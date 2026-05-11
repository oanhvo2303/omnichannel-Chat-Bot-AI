'use strict';

const express = require('express');
const { register, login, me, updateProfile, changePassword } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authMiddleware, me);
router.patch('/profile', authMiddleware, updateProfile);   // User tự cập nhật shop_name/email
router.patch('/password', authMiddleware, changePassword); // User tự đổi mật khẩu

module.exports = router;
