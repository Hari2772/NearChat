const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Group = require('../models/Group');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { uploadToCloud } = require('../utils/fileUpload');
const { sendPushNotification } = require('../utils/notifications');
const redis = require('../config/redis');

class ChatController {
  // Create or get direct chat
  async createDirectChat(req, res) {
    try {
      if (!features.isEnabled('direct_messaging')) {
        return res.status(403).json({ error: 'Direct messaging feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { participantId } = req.body;

      if (userId === participantId) {
        return res.status(400).json({ error: 'Cannot create chat with yourself' });
      }

      // Check if chat already exists
      let chat = await Chat.findOne({
        type: 'direct',
        participants: { $all: [userId, participantId] }
      });

      if (chat) {
        return res.json(chat);
      }

      // Check if users are friends (if friend-only messaging is enabled)
      if (features.isEnabled('friend_only_messaging')) {
        const user = await User.findById(userId);
        if (!user.friends.includes(participantId)) {
          return res.status(403).json({ error: 'Can only message friends' });
        }
      }

      // Create new chat
      chat = new Chat({
        type: 'direct',
        participants: [userId, participantId],
        createdBy: userId,
        settings: {
          allowVoiceMessages: true,
          allowReactions: true,
          allowEditing: true,
          allowDeletion: true
        }
      });

      await chat.save();

      // Populate participant details
      await chat.populate('participants', 'username displayName avatar isOnline lastSeen');

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'chat_creation' },
        {
          $inc: { 'metrics.chat.directChatsCreated': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.status(201).json(chat);
    } catch (error) {
      logger.error('Error creating direct chat:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user's chats
  async getUserChats(req, res) {
    try {
      if (!features.isEnabled('chat_listing')) {
        return res.status(403).json({ error: 'Chat listing feature is disabled' });
      }

      const userId = req.user.id;
      const { type, limit = 20, offset = 0 } = req.query;

      const query = { participants: userId };
      if (type) {
        query.type = type;
      }

      const chats = await Chat.find(query)
        .populate('participants', 'username displayName avatar isOnline lastSeen')
        .populate('lastMessage')
        .populate('pinnedMessages')
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Chat.countDocuments(query);

      res.json({
        chats,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error getting user chats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get chat messages
  async getChatMessages(req, res) {
    try {
      if (!features.isEnabled('message_retrieval')) {
        return res.status(403).json({ error: 'Message retrieval feature is disabled' });
      }

      const userId = req.user.id;
      const { chatId } = req.params;
      const { limit = 50, offset = 0, before } = req.query;

      // Check if user is participant
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      if (!chat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Build query
      const query = { chat: chatId };
      if (before) {
        query.createdAt = { $lt: new Date(before) };
      }

      const messages = await Message.find(query)
        .populate('sender', 'username displayName avatar')
        .populate('reactions.user', 'username displayName avatar')
        .populate('replyTo', 'content sender')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Message.countDocuments(query);

      // Mark messages as read
      await Message.updateMany(
        { chat: chatId, sender: { $ne: userId }, readBy: { $ne: userId } },
        { $addToSet: { readBy: userId } }
      );

      // Update chat last read
      await Chat.findByIdAndUpdate(chatId, {
        $set: { [`lastRead.${userId}`]: new Date() }
      });

      res.json({
        messages: messages.reverse(),
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error getting chat messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Send message
  async sendMessage(req, res) {
    try {
      if (!features.isEnabled('message_sending')) {
        return res.status(403).json({ error: 'Message sending feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { chatId } = req.params;
      const { content, type = 'text', replyTo, forwardFrom } = req.body;

      // Check if user is participant
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      if (!chat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check chat settings
      if (type === 'voice' && !chat.settings.allowVoiceMessages) {
        return res.status(403).json({ error: 'Voice messages not allowed in this chat' });
      }

      // Create message
      const messageData = {
        chat: chatId,
        sender: userId,
        content,
        type,
        replyTo,
        forwardFrom
      };

      // Handle media uploads
      if (req.file) {
        try {
          const mediaUrl = await uploadToCloud(req.file, 'messages');
          messageData.media = {
            url: mediaUrl,
            type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
            size: req.file.size,
            name: req.file.originalname
          };
        } catch (uploadError) {
          logger.error('Media upload failed:', uploadError);
          return res.status(400).json({ error: 'Media upload failed' });
        }
      }

      const message = new Message(messageData);
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

      // Send real-time notification
      const participants = chat.participants.filter(id => id.toString() !== userId);
      for (const participantId of participants) {
        // Check notification settings
        const participant = await User.findById(participantId);
        if (participant && participant.notificationSettings.newMessages) {
          await sendPushNotification(participantId, {
            title: chat.type === 'direct' ? message.sender.displayName : chat.name,
            body: type === 'text' ? content : `${type} message`,
            data: { type: 'new_message', chatId, messageId: message._id }
          });
        }

        // Emit to Socket.IO
        req.app.get('io').to(participantId.toString()).emit('new_message', {
          chatId,
          message: message.toObject()
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_sending' },
        {
          $inc: { 'metrics.messages.totalSent': 1, [`metrics.messages.${type}Sent`]: 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.status(201).json(message);
    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Send voice message
  async sendVoiceMessage(req, res) {
    try {
      if (!features.isEnabled('voice_messages')) {
        return res.status(403).json({ error: 'Voice messages feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { chatId } = req.params;
      const { duration, waveform } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'Voice file is required' });
      }

      // Check if user is participant
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      if (!chat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!chat.settings.allowVoiceMessages) {
        return res.status(403).json({ error: 'Voice messages not allowed in this chat' });
      }

      // Upload voice file
      let voiceUrl;
      try {
        voiceUrl = await uploadToCloud(req.file, 'voice_messages');
      } catch (uploadError) {
        logger.error('Voice message upload failed:', uploadError);
        return res.status(400).json({ error: 'Voice message upload failed' });
      }

      // Create message
      const message = new Message({
        chat: chatId,
        sender: userId,
        type: 'voice',
        content: 'Voice message',
        media: {
          url: voiceUrl,
          type: 'audio',
          size: req.file.size,
          duration: parseInt(duration) || 0,
          waveform: waveform || []
        }
      });

      await message.save();

      // Populate sender details
      await message.populate('sender', 'username displayName avatar');

      // Update chat
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id,
        updatedAt: new Date()
      });

      // Send real-time notification
      const participants = chat.participants.filter(id => id.toString() !== userId);
      for (const participantId of participants) {
        const participant = await User.findById(participantId);
        if (participant && participant.notificationSettings.newMessages) {
          await sendPushNotification(participantId, {
            title: chat.type === 'direct' ? message.sender.displayName : chat.name,
            body: 'Voice message',
            data: { type: 'new_message', chatId, messageId: message._id }
          });
        }

        req.app.get('io').to(participantId.toString()).emit('new_message', {
          chatId,
          message: message.toObject()
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'voice_messages' },
        {
          $inc: { 'metrics.messages.voiceMessagesSent': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.status(201).json(message);
    } catch (error) {
      logger.error('Error sending voice message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // React to message
  async reactToMessage(req, res) {
    try {
      if (!features.isEnabled('message_reactions')) {
        return res.status(403).json({ error: 'Message reactions feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { messageId } = req.params;
      const { reaction } = req.body;

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user can access the chat
      const chat = await Chat.findById(message.chat);
      if (!chat || !chat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
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

      // Send real-time update
      const participants = chat.participants.filter(id => id.toString() !== userId);
      for (const participantId of participants) {
        req.app.get('io').to(participantId.toString()).emit('message_reaction_updated', {
          messageId,
          reactions: message.reactions
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_reactions' },
        {
          $inc: { 'metrics.messages.reactionsAdded': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json(message);
    } catch (error) {
      logger.error('Error reacting to message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Edit message
  async editMessage(req, res) {
    try {
      if (!features.isEnabled('message_editing')) {
        return res.status(403).json({ error: 'Message editing feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { messageId } = req.params;
      const { content } = req.body;

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user is the sender
      if (message.sender.toString() !== userId) {
        return res.status(403).json({ error: 'Can only edit your own messages' });
      }

      // Check if message is too old
      const editTimeLimit = 15 * 60 * 1000; // 15 minutes
      if (Date.now() - message.createdAt.getTime() > editTimeLimit) {
        return res.status(400).json({ error: 'Message too old to edit' });
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

      // Populate sender details
      await message.populate('sender', 'username displayName avatar');

      // Send real-time update
      const chat = await Chat.findById(message.chat);
      if (chat) {
        const participants = chat.participants.filter(id => id.toString() !== userId);
        for (const participantId of participants) {
          req.app.get('io').to(participantId.toString()).emit('message_edited', {
            messageId,
            content,
            editedAt: message.editedAt
          });
        }
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_editing' },
        {
          $inc: { 'metrics.messages.messagesEdited': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json(message);
    } catch (error) {
      logger.error('Error editing message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Delete message
  async deleteMessage(req, res) {
    try {
      if (!features.isEnabled('message_deletion')) {
        return res.status(403).json({ error: 'Message deletion feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { messageId } = req.params;

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user can delete the message
      const chat = await Chat.findById(message.chat);
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      const canDelete = message.sender.toString() === userId || 
                       chat.members.find(m => m.user.toString() === userId && m.role === 'admin');

      if (!canDelete) {
        return res.status(403).json({ error: 'Cannot delete this message' });
      }

      // Soft delete
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      await message.save();

      // Send real-time update
      const participants = chat.participants.filter(id => id.toString() !== userId);
      for (const participantId of participants) {
        req.app.get('io').to(participantId.toString()).emit('message_deleted', {
          messageId,
          deletedAt: message.deletedAt
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_deletion' },
        {
          $inc: { 'metrics.messages.messagesDeleted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Message deleted successfully' });
    } catch (error) {
      logger.error('Error deleting message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Forward message
  async forwardMessage(req, res) {
    try {
      if (!features.isEnabled('message_forwarding')) {
        return res.status(403).json({ error: 'Message forwarding feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { messageId } = req.params;
      const { chatIds } = req.body;

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user can access the original message
      const originalChat = await Chat.findById(message.chat);
      if (!originalChat || !originalChat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const forwardedMessages = [];

      for (const chatId of chatIds) {
        const targetChat = await Chat.findById(chatId);
        if (!targetChat || !targetChat.participants.includes(userId)) {
          continue;
        }

        // Create forwarded message
        const forwardedMessage = new Message({
          chat: chatId,
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
        await Chat.findByIdAndUpdate(chatId, {
          lastMessage: forwardedMessage._id,
          updatedAt: new Date()
        });

        forwardedMessages.push(forwardedMessage);

        // Send real-time notification
        const participants = targetChat.participants.filter(id => id.toString() !== userId);
        for (const participantId of participants) {
          const participant = await User.findById(participantId);
          if (participant && participant.notificationSettings.newMessages) {
            await sendPushNotification(participantId, {
              title: targetChat.type === 'direct' ? message.sender.displayName : targetChat.name,
              body: 'Forwarded message',
              data: { type: 'new_message', chatId, messageId: forwardedMessage._id }
            });
          }

          req.app.get('io').to(participantId.toString()).emit('new_message', {
            chatId,
            message: forwardedMessage.toObject()
          });
        }
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'message_forwarding' },
        {
          $inc: { 'metrics.messages.messagesForwarded': forwardedMessages.length },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'Messages forwarded successfully',
        forwardedMessages
      });
    } catch (error) {
      logger.error('Error forwarding message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Pin message
  async pinMessage(req, res) {
    try {
      if (!features.isEnabled('message_pinning')) {
        return res.status(403).json({ error: 'Message pinning feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { messageId } = req.params;

      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const chat = await Chat.findById(message.chat);
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      // Check permissions
      const member = chat.members.find(m => m.user.toString() === userId);
      const canPin = member && ['admin', 'moderator'].includes(member.role);

      if (!canPin) {
        return res.status(403).json({ error: 'Cannot pin messages' });
      }

      // Toggle pin status
      const isPinned = chat.pinnedMessages.includes(messageId);
      if (isPinned) {
        chat.pinnedMessages = chat.pinnedMessages.filter(id => id.toString() !== messageId);
      } else {
        chat.pinnedMessages.push(messageId);
      }

      await chat.save();

      // Send real-time update
      const participants = chat.participants.filter(id => id.toString() !== userId);
      for (const participantId of participants) {
        req.app.get('io').to(participantId.toString()).emit('message_pin_updated', {
          chatId: chat._id,
          messageId,
          isPinned: !isPinned
        });
      }

      res.json({
        message: isPinned ? 'Message unpinned' : 'Message pinned',
        isPinned: !isPinned
      });
    } catch (error) {
      logger.error('Error pinning message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Mark messages as read
  async markAsRead(req, res) {
    try {
      if (!features.isEnabled('read_receipts')) {
        return res.status(403).json({ error: 'Read receipts feature is disabled' });
      }

      const userId = req.user.id;
      const { chatId } = req.params;
      const { messageIds } = req.body;

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
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

      res.json({ message: 'Messages marked as read' });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Search messages
  async searchMessages(req, res) {
    try {
      if (!features.isEnabled('message_search')) {
        return res.status(403).json({ error: 'Message search feature is disabled' });
      }

      const userId = req.user.id;
      const { query, chatId, limit = 20, offset = 0 } = req.query;

      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }

      // Build search query
      const searchQuery = {
        content: { $regex: query, $options: 'i' },
        sender: { $ne: userId },
        isDeleted: { $ne: true }
      };

      if (chatId) {
        // Search in specific chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        searchQuery.chat = chatId;
      } else {
        // Search in all user's chats
        const userChats = await Chat.find({ participants: userId });
        const chatIds = userChats.map(chat => chat._id);
        searchQuery.chat = { $in: chatIds };
      }

      const messages = await Message.find(searchQuery)
        .populate('sender', 'username displayName avatar')
        .populate('chat', 'name type')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Message.countDocuments(searchQuery);

      res.json({
        messages,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error searching messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = new ChatController();