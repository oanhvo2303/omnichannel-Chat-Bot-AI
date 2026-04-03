'use strict';

const express = require('express');
const { register, login, me } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected route
router.get('/me', authMiddleware, me);

module.exports = router;
