const User = require('../models/User');
const auth = require('../config/auth');
const features = require('../config/features');
const logger = require('../utils/logger');
const redis = require('../config/redis');

/**
 * Authentication Controller
 * Handles user authentication, registration, and token management
 */
class AuthController {
  
  /**
   * User Registration
   * POST /api/auth/register
   */
  async register(req, res) {
    try {
      const {
        email,
        username,
        firstName,
        lastName,
        password,
        dateOfBirth,
        gender,
        location
      } = req.body;

      // Check if features are enabled
      if (!features.isEnabled('USER_REGISTRATION')) {
        return res.status(403).json({
          success: false,
          message: 'User registration is currently disabled'
        });
      }

      // Validate required fields
      if (!email || !username || !firstName || !lastName || !password) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { username }]
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: existingUser.email === email.toLowerCase() 
            ? 'Email already registered' 
            : 'Username already taken'
        });
      }

      // Validate password strength
      if (!auth.isValidPassword(password)) {
        return res.status(400).json({
          success: false,
          message: 'Password does not meet security requirements'
        });
      }

      // Create user
      const userData = {
        email: email.toLowerCase(),
        username,
        firstName,
        lastName,
        password,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender,
        authProvider: 'local'
      };

      // Add location if provided
      if (location && location.coordinates) {
        userData.location = {
          type: 'Point',
          coordinates: location.coordinates,
          address: location.address || {},
          lastUpdated: new Date()
        };
      }

      const user = new User(userData);
      await user.save();

      // Generate tokens
      const accessToken = auth.generateAccessToken(user._id);
      const refreshToken = auth.generateRefreshToken(user._id);

      // Store refresh token in Redis
      await redis.setex(`refresh_token:${user._id}`, 30 * 24 * 60 * 60, refreshToken);

      // Log registration
      logger.info('User registered successfully', {
        userId: user._id,
        email: user.email,
        username: user.username
      });

      // Send verification email if feature is enabled
      if (features.isEnabled('EMAIL_VERIFICATION')) {
        await this.sendVerificationEmail(user);
      }

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user._id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            isEmailVerified: user.isEmailVerified,
            role: user.role
          },
          tokens: {
            accessToken,
            refreshToken
          }
        }
      });

    } catch (error) {
      logger.error('User registration failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * User Login
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email, password, rememberMe = false } = req.body;

      // Check if features are enabled
      if (!features.isEnabled('USER_LOGIN')) {
        return res.status(403).json({
          success: false,
          message: 'User login is currently disabled'
        });
      }

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Find user
      const user = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { username: email }
        ]
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if user is banned
      if (user.isBanned) {
        return res.status(403).json({
          success: false,
          message: 'Account is banned',
          reason: user.banReason
        });
      }

      // Check if user is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked',
          lockUntil: user.lockUntil
        });
      }

      // Verify password
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        // Increment login attempts
        user.loginAttempts += 1;
        
        // Lock account if too many failed attempts
        if (user.loginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        }
        
        await user.save();

        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Reset login attempts on successful login
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.lastLoginAt = new Date();
      user.isOnline = true;
      user.status = 'online';
      await user.save();

      // Generate tokens
      const accessToken = auth.generateAccessToken(user._id);
      const refreshToken = auth.generateRefreshToken(user._id);

      // Store refresh token in Redis
      const tokenExpiry = rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60; // 30 days or 7 days
      await redis.setex(`refresh_token:${user._id}`, tokenExpiry, refreshToken);

      // Log successful login
      logger.info('User logged in successfully', {
        userId: user._id,
        email: user.email,
        username: user.username
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            avatar: user.avatar,
            isEmailVerified: user.isEmailVerified,
            role: user.role,
            isOnline: user.isOnline,
            lastSeenAt: user.lastSeenAt
          },
          tokens: {
            accessToken,
            refreshToken
          }
        }
      });

    } catch (error) {
      logger.error('User login failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Google OAuth Login
   * POST /api/auth/google
   */
  async googleAuth(req, res) {
    try {
      const { accessToken: googleAccessToken } = req.body;

      if (!googleAccessToken) {
        return res.status(400).json({
          success: false,
          message: 'Google access token is required'
        });
      }

      // Check if features are enabled
      if (!features.isEnabled('GOOGLE_OAUTH')) {
        return res.status(403).json({
          success: false,
          message: 'Google OAuth is currently disabled'
        });
      }

      // Verify Google token and get user info
      const googleUserInfo = await auth.verifyGoogleToken(googleAccessToken);
      
      if (!googleUserInfo) {
        return res.status(401).json({
          success: false,
          message: 'Invalid Google token'
        });
      }

      // Find or create user
      let user = await User.findOne({ googleId: googleUserInfo.id });

      if (!user) {
        // Check if user exists with same email
        user = await User.findOne({ email: googleUserInfo.email });

        if (user) {
          // Link Google account to existing user
          user.googleId = googleUserInfo.id;
          user.authProvider = 'google';
        } else {
          // Create new user
          user = new User({
            googleId: googleUserInfo.id,
            email: googleUserInfo.email,
            username: await this.generateUniqueUsername(googleUserInfo.name),
            firstName: googleUserInfo.given_name,
            lastName: googleUserInfo.family_name,
            displayName: googleUserInfo.name,
            avatar: googleUserInfo.picture,
            isEmailVerified: true,
            authProvider: 'google'
          });
        }
      }

      // Update user info
      user.lastLoginAt = new Date();
      user.isOnline = true;
      user.status = 'online';
      await user.save();

      // Generate tokens
      const accessToken = auth.generateAccessToken(user._id);
      const refreshToken = auth.generateRefreshToken(user._id);

      // Store refresh token in Redis
      await redis.setex(`refresh_token:${user._id}`, 30 * 24 * 60 * 60, refreshToken);

      // Log OAuth login
      logger.info('Google OAuth login successful', {
        userId: user._id,
        email: user.email,
        googleId: user.googleId
      });

      res.json({
        success: true,
        message: 'Google authentication successful',
        data: {
          user: {
            id: user._id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            avatar: user.avatar,
            isEmailVerified: user.isEmailVerified,
            role: user.role,
            isOnline: user.isOnline,
            lastSeenAt: user.lastSeenAt
          },
          tokens: {
            accessToken,
            refreshToken
          }
        }
      });

    } catch (error) {
      logger.error('Google OAuth failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Google authentication failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Refresh Access Token
   * POST /api/auth/refresh
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken: token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = auth.verifyRefreshToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Check if token exists in Redis
      const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
      if (!storedToken || storedToken !== token) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired or invalid'
        });
      }

      // Generate new access token
      const newAccessToken = auth.generateAccessToken(decoded.userId);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken
        }
      });

    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Token refresh failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      const { refreshToken: token } = req.body;
      const userId = req.user.id;

      // Update user status
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        status: 'offline',
        lastSeenAt: new Date()
      });

      // Remove refresh token from Redis
      if (token) {
        await redis.del(`refresh_token:${userId}`);
      }

      // Log logout
      logger.info('User logged out', {
        userId,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Logout successful'
      });

    } catch (error) {
      logger.error('Logout failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Forgot Password
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // Check if features are enabled
      if (!features.isEnabled('PASSWORD_RESET')) {
        return res.status(403).json({
          success: false,
          message: 'Password reset is currently disabled'
        });
      }

      // Find user
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // Don't reveal if user exists
        return res.json({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent'
        });
      }

      // Generate reset token
      const resetToken = auth.generatePasswordResetToken();
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      user.passwordResetToken = resetToken;
      user.passwordResetExpires = resetExpiry;
      await user.save();

      // Send reset email
      if (features.isEnabled('EMAIL_NOTIFICATIONS')) {
        await this.sendPasswordResetEmail(user, resetToken);
      }

      // Log password reset request
      logger.info('Password reset requested', {
        userId: user._id,
        email: user.email
      });

      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });

    } catch (error) {
      logger.error('Forgot password failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Password reset request failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Reset Password
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      // Find user with valid reset token
      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      // Validate new password
      if (!auth.isValidPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'Password does not meet security requirements'
        });
      }

      // Update password
      user.password = newPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      // Log password reset
      logger.info('Password reset successful', {
        userId: user._id,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Password reset successful'
      });

    } catch (error) {
      logger.error('Password reset failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Password reset failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Verify Email
   * POST /api/auth/verify-email
   */
  async verifyEmail(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Verification token is required'
        });
      }

      // Find user with valid verification token
      const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification token'
        });
      }

      // Verify email
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      // Log email verification
      logger.info('Email verified successfully', {
        userId: user._id,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Email verified successfully'
      });

    } catch (error) {
      logger.error('Email verification failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Email verification failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Resend Verification Email
   * POST /api/auth/resend-verification
   */
  async resendVerification(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // Find user
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: 'Email is already verified'
        });
      }

      // Generate new verification token
      const verificationToken = auth.generateEmailVerificationToken();
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpires = verificationExpiry;
      await user.save();

      // Send verification email
      if (features.isEnabled('EMAIL_NOTIFICATIONS')) {
        await this.sendVerificationEmail(user);
      }

      res.json({
        success: true,
        message: 'Verification email sent successfully'
      });

    } catch (error) {
      logger.error('Resend verification failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Failed to resend verification email',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get Current User
   * GET /api/auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId).select('-password -emailVerificationToken -passwordResetToken');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          user
        }
      });

    } catch (error) {
      logger.error('Get current user failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Failed to get user information',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Change Password
   * POST /api/auth/change-password
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Validate new password
      if (!auth.isValidPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'New password does not meet security requirements'
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // Log password change
      logger.info('Password changed successfully', {
        userId: user._id,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      logger.error('Change password failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Failed to change password',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Helper methods

  /**
   * Generate unique username
   */
  async generateUniqueUsername(baseName) {
    let username = baseName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    let counter = 1;
    let finalUsername = username;

    while (await User.findOne({ username: finalUsername })) {
      finalUsername = `${username}${counter}`;
      counter++;
    }

    return finalUsername;
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(user) {
    try {
      // This would integrate with your email service
      // For now, just log the action
      logger.info('Verification email sent', {
        userId: user._id,
        email: user.email,
        token: user.emailVerificationToken
      });
    } catch (error) {
      logger.error('Failed to send verification email', {
        userId: user._id,
        error: error.message
      });
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    try {
      // This would integrate with your email service
      // For now, just log the action
      logger.info('Password reset email sent', {
        userId: user._id,
        email: user.email,
        token: resetToken
      });
    } catch (error) {
      logger.error('Failed to send password reset email', {
        userId: user._id,
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();