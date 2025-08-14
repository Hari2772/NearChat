const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const redis = require('../config/redis');

class ChatHandler {
  constructor() {
    this.typingUsers = new Map(); // roomId -> Set of typing userIds
    this.typingTimeouts = new Map(); // roomId -> Map of userId -> timeout
  }

  handleConnection(socket, socketManager) {
    try {
      const userId = socket.userId;

      // Join user's personal chat room
      socketManager.joinRoom(userId, `user_${userId}`, 'personal');

      // Handle chat events
      socket.on('join_chat', (data) => this.handleJoinChat(socket, socketManager, data));
      socket.on('leave_chat', (data) => this.handleLeaveChat(socket, socketManager, data));
      socket.on('send_message', (data) => this.handleSendMessage(socket, socketManager, data));
      socket.on('typing_start', (data) => this.handleTypingStart(socket, socketManager, data));
      socket.on('typing_stop', (data) => this.handleTypingStop(socket, socketManager, data));
      socket.on('mark_read', (data) => this.handleMarkRead(socket, socketManager, data));
      socket.on('mark_delivered', (data) => this.handleMarkDelivered(socket, socketManager, data));
      socket.on('react_to_message', (data) => this.handleReactToMessage(socket, socketManager, data));
      socket.on('edit_message', (data) => this.handleEditMessage(socket, socketManager, data));
      socket.on('delete_message', (data) => this.handleDeleteMessage(socket, socketManager, data));
      socket.on('forward_message', (data) => this.handleForwardMessage(socket, socketManager, data));
      socket.on('pin_message', (data) => this.handlePinMessage(socket, socketManager, data));

      logger.info(`Chat handler initialized for user ${userId}`);
    } catch (error) {
      logger.error('Error initializing chat handler:', error);
    }
  }

  async handleJoinChat(socket, socketManager, data) {
    try {
      if (!features.isEnabled('real_time_chat')) {
        socket.emit('error', { message: 'Real-time chat feature is disabled' });
        return;
      }

      const { chatId } = data;
      const userId = socket.userId;

      // Validate chat access
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }

      if (!chat.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied to this chat' });
        return;
      }

      // Join the chat room
      const success = socketManager.joinRoom(userId, chatId, 'chat');
      if (success) {
        // Get recent messages
        const recentMessages = await Message.find({ chat: chatId })
          .populate('sender', 'username displayName avatar')
          .populate('reactions.user', 'username displayName avatar')
          .sort({ createdAt: -1 })
          .limit(50);

        socket.emit('chat_joined', {
          chatId,
          messages: recentMessages.reverse(),
          participants: chat.participants.length,
          timestamp: new Date()
        });

        // Update analytics
        await Analytics.findOneAndUpdate(
          { name: 'chat_room_joins' },
          {
            $inc: { 'metrics.chat.roomJoins': 1 },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true }
        );
      }
    } catch (error) {
      logger.error('Error joining chat:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  }

  async handleLeaveChat(socket, socketManager, data) {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      // Leave the chat room
      const success = socketManager.leaveRoom(userId, chatId);
      if (success) {
        socket.emit('chat_left', {
          chatId,
          timestamp: new Date()
        });

        // Stop typing if user was typing
        this.handleTypingStop(socket, socketManager, { chatId });
      }
    } catch (error) {
      logger.error('Error leaving chat:', error);
      socket.emit('error', { message: 'Failed to leave chat' });
    }
  }

  async handleSendMessage(socket, socketManager, data) {
    try {
      if (!features.isEnabled('real_time_messaging')) {
        socket.emit('error', { message: 'Real-time messaging feature is disabled' });
        return;
      }

      const { chatId, content, type = 'text', replyTo, forwardFrom } = data;
      const userId = socket.userId;

      // Validate chat access
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }

      if (!chat.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied to this chat' });
        return;
      }

      // Create message
      const message = new Message({
        chat: chatId,
        sender: userId,
        content,
        type,
        replyTo,
        forwardFrom
      });

      await message.save();

      // Populate sender details
      await message.populate('sender', 'username displayName avatar');
      if (replyTo) {
        await message.populate('replyTo', 'content sender');
      }

      // Update chat
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id,
        updatedAt: new Date()
      });

      // Broadcast message to chat room
      socketManager.broadcastToRoom(chatId, 'new_message', {
        message: message.toObject(),
        chatId,
        timestamp: new Date()
      }, userId);

      // Emit confirmation to sender
      socket.emit('message_sent', {
        messageId: message._id,
        chatId,
        timestamp: new Date()
      });

      // Stop typing indicator
      this.handleTypingStop(socket, socketManager, { chatId });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'real_time_messages' },
        {
          $inc: { 'metrics.messages.realTimeSent': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  handleTypingStart(socket, socketManager, data) {
    try {
      if (!features.isEnabled('typing_indicators')) {
        return;
      }

      const { chatId } = data;
      const userId = socket.userId;

      // Initialize typing tracking for this room
      if (!this.typingUsers.has(chatId)) {
        this.typingUsers.set(chatId, new Set());
      }
      if (!this.typingTimeouts.has(chatId)) {
        this.typingTimeouts.set(chatId, new Map());
      }

      // Add user to typing set
      this.typingUsers.get(chatId).add(userId);

      // Clear existing timeout
      const existingTimeout = this.typingTimeouts.get(chatId).get(userId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new timeout to automatically stop typing
      const timeout = setTimeout(() => {
        this.handleTypingStop(socket, socketManager, { chatId });
      }, 5000); // 5 seconds

      this.typingTimeouts.get(chatId).set(userId, timeout);

      // Broadcast typing start to other users in the room
      socketManager.broadcastToRoom(chatId, 'user_typing', {
        userId,
        chatId,
        isTyping: true,
        timestamp: new Date()
      }, userId);

    } catch (error) {
      logger.error('Error handling typing start:', error);
    }
  }

  handleTypingStop(socket, socketManager, data) {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      // Remove user from typing set
      if (this.typingUsers.has(chatId)) {
        this.typingUsers.get(chatId).delete(userId);
      }

      // Clear timeout
      if (this.typingTimeouts.has(chatId) && this.typingTimeouts.get(chatId).has(userId)) {
        clearTimeout(this.typingTimeouts.get(chatId).get(userId));
        this.typingTimeouts.get(chatId).delete(userId);
      }

      // Broadcast typing stop to other users in the room
      socketManager.broadcastToRoom(chatId, 'user_typing', {
        userId,
        chatId,
        isTyping: false,
        timestamp: new Date()
      }, userId);

    } catch (error) {
      logger.error('Error handling typing stop:', error);
    }
  }

  async handleMarkRead(socket, socketManager, data) {
    try {
      if (!features.isEnabled('read_receipts')) {
        return;
      }

      const { chatId, messageIds } = data;
      const userId = socket.userId;

      // Validate chat access
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(userId)) {
        return;
      }

      if (messageIds && messageIds.length > 0) {
        // Mark specific messages as read
        await Message.updateMany(
          { _id: { $in: messageIds }, sender: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );
      } else {
        // Mark all unread messages in chat as read
        await Message.updateMany(
          { chat: chatId, sender: { $ne: userId }, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );
      }

      // Update chat last read
      await Chat.findByIdAndUpdate(chatId, {
        $set: { [`lastRead.${userId}`]: new Date() }
      });

      // Broadcast read receipt to message senders
      const messages = await Message.find({
        chat: chatId,
        _id: { $in: messageIds || [] },
        sender: { $ne: userId }
      }).distinct('sender');

      messages.forEach(senderId => {
        socketManager.broadcastToUser(senderId, 'message_read', {
          chatId,
          messageIds,
          readBy: userId,
          timestamp: new Date()
        });
      });

    } catch (error) {
      logger.error('Error marking messages as read:', error);
    }
  }

  async handleMarkDelivered(socket, socketManager, data) {
    try {
      if (!features.isEnabled('delivery_receipts')) {
        return;
      }

      const { chatId, messageIds } = data;
      const userId = socket.userId;

      // Validate chat access
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(userId)) {
        return;
      }

      if (messageIds && messageIds.length > 0) {
        // Mark specific messages as delivered
        await Message.updateMany(
          { _id: { $in: messageIds }, sender: { $ne: userId } },
          { $addToSet: { deliveredTo: userId } }
        );
      }

      // Broadcast delivery receipt to message senders
      const messages = await Message.find({
        chat: chatId,
        _id: { $in: messageIds || [] },
        sender: { $ne: userId }
      }).distinct('sender');

      messages.forEach(senderId => {
        socketManager.broadcastToUser(senderId, 'message_delivered', {
          chatId,
          messageIds,
          deliveredTo: userId,
          timestamp: new Date()
        });
      });

    } catch (error) {
      logger.error('Error marking messages as delivered:', error);
    }
  }

  async handleReactToMessage(socket, socketManager, data) {
    try {
      if (!features.isEnabled('message_reactions')) {
        socket.emit('error', { message: 'Message reactions feature is disabled' });
        return;
      }

      const { messageId, reaction } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Check if user can access the chat
      const chat = await Chat.findById(message.chat);
      if (!chat || !chat.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Check if reaction already exists
      const existingReaction = message.reactions.find(
        r => r.user.toString() === userId && r.reaction === reaction
      );

      if (existingReaction) {
        // Remove reaction
        message.reactions = message.reactions.filter(
          r => !(r.user.toString() === userId && r.reaction === reaction)
        );
      } else {
        // Add reaction
        message.reactions.push({
          user: userId,
          reaction,
          timestamp: new Date()
        });
      }

      await message.save();

      // Populate reaction user details
      await message.populate('reactions.user', 'username displayName avatar');

      // Broadcast reaction update to chat room
      socketManager.broadcastToRoom(message.chat, 'message_reaction_updated', {
        messageId,
        reactions: message.reactions,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_reactions' },
        {
          $inc: { 'metrics.messages.reactionsAdded': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error handling message reaction:', error);
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  }

  async handleEditMessage(socket, socketManager, data) {
    try {
      if (!features.isEnabled('message_editing')) {
        socket.emit('error', { message: 'Message editing feature is disabled' });
        return;
      }

      const { messageId, content } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Check if user is the sender
      if (message.sender.toString() !== userId) {
        socket.emit('error', { message: 'Can only edit your own messages' });
        return;
      }

      // Check if message is too old
      const editTimeLimit = 15 * 60 * 1000; // 15 minutes
      if (Date.now() - message.createdAt.getTime() > editTimeLimit) {
        socket.emit('error', { message: 'Message too old to edit' });
        return;
      }

      // Store original content
      if (!message.editHistory) {
        message.editHistory = [];
      }
      message.editHistory.push({
        content: message.content,
        editedAt: message.editedAt || message.createdAt
      });

      // Update message
      message.content = content;
      message.editedAt = new Date();
      message.isEdited = true;

      await message.save();

      // Broadcast message edit to chat room
      socketManager.broadcastToRoom(message.chat, 'message_edited', {
        messageId,
        content,
        editedAt: message.editedAt,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_editing' },
        {
          $inc: { 'metrics.messages.messagesEdited': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error handling message edit:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  }

  async handleDeleteMessage(socket, socketManager, data) {
    try {
      if (!features.isEnabled('message_deletion')) {
        socket.emit('error', { message: 'Message deletion feature is disabled' });
        return;
      }

      const { messageId } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Check if user can delete the message
      const chat = await Chat.findById(message.chat);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }

      const canDelete = message.sender.toString() === userId || 
                       chat.members.find(m => m.user.toString() === userId && m.role === 'admin');

      if (!canDelete) {
        socket.emit('error', { message: 'Cannot delete this message' });
        return;
      }

      // Soft delete
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      await message.save();

      // Broadcast message deletion to chat room
      socketManager.broadcastToRoom(message.chat, 'message_deleted', {
        messageId,
        deletedAt: message.deletedAt,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_deletion' },
        {
          $inc: { 'metrics.messages.messagesDeleted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error handling message deletion:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  }

  async handleForwardMessage(socket, socketManager, data) {
    try {
      if (!features.isEnabled('message_forwarding')) {
        socket.emit('error', { message: 'Message forwarding feature is disabled' });
        return;
      }

      const { messageId, targetChatIds } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Check if user can access the original message
      const originalChat = await Chat.findById(message.chat);
      if (!originalChat || !originalChat.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      const forwardedMessages = [];

      for (const targetChatId of targetChatIds) {
        const targetChat = await Chat.findById(targetChatId);
        if (!targetChat || !targetChat.participants.includes(userId)) {
          continue;
        }

        // Create forwarded message
        const forwardedMessage = new Message({
          chat: targetChatId,
          sender: userId,
          type: message.type,
          content: message.content,
          media: message.media,
          forwardFrom: {
            message: message._id,
            chat: message.chat,
            sender: message.sender
          },
          isForwarded: true
        });

        await forwardedMessage.save();
        await forwardedMessage.populate('sender', 'username displayName avatar');

        // Update target chat
        await Chat.findByIdAndUpdate(targetChatId, {
          lastMessage: forwardedMessage._id,
          updatedAt: new Date()
        });

        forwardedMessages.push(forwardedMessage);

        // Broadcast new message to target chat room
        socketManager.broadcastToRoom(targetChatId, 'new_message', {
          message: forwardedMessage.toObject(),
          chatId: targetChatId,
          timestamp: new Date()
        }, userId);
      }

      // Emit confirmation to sender
      socket.emit('messages_forwarded', {
        count: forwardedMessages.length,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_forwarding' },
        {
          $inc: { 'metrics.messages.messagesForwarded': forwardedMessages.length },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error handling message forwarding:', error);
      socket.emit('error', { message: 'Failed to forward messages' });
    }
  }

  async handlePinMessage(socket, socketManager, data) {
    try {
      if (!features.isEnabled('message_pinning')) {
        socket.emit('error', { message: 'Message pinning feature is disabled' });
        return;
      }

      const { messageId } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      const chat = await Chat.findById(message.chat);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }

      // Check permissions
      const member = chat.members.find(m => m.user.toString() === userId);
      const canPin = member && ['admin', 'moderator'].includes(member.role);

      if (!canPin) {
        socket.emit('error', { message: 'Cannot pin messages' });
        return;
      }

      // Toggle pin status
      const isPinned = chat.pinnedMessages.includes(messageId);
      if (isPinned) {
        chat.pinnedMessages = chat.pinnedMessages.filter(id => id.toString() !== messageId);
      } else {
        chat.pinnedMessages.push(messageId);
      }

      await chat.save();

      // Broadcast pin update to chat room
      socketManager.broadcastToRoom(message.chat, 'message_pin_updated', {
        messageId,
        isPinned: !isPinned,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error handling message pinning:', error);
      socket.emit('error', { message: 'Failed to pin message' });
    }
  }

  // Get typing users for a chat
  getTypingUsers(chatId) {
    if (this.typingUsers.has(chatId)) {
      return Array.from(this.typingUsers.get(chatId));
    }
    return [];
  }

  // Cleanup typing timeouts
  cleanupTypingTimeouts() {
    this.typingTimeouts.forEach((userTimeouts, chatId) => {
      userTimeouts.forEach((timeout, userId) => {
        clearTimeout(timeout);
      });
    });
    this.typingTimeouts.clear();
    this.typingUsers.clear();
  }
}

module.exports = new ChatHandler();