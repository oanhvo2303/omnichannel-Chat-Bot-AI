'use strict';

const express = require('express');
const { registerStaff, loginStaff, listStaff, goOffline } = require('../controllers/staff.controller');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public: Staff login (cần shop_id)
router.post('/login', loginStaff);

// Protected routes
router.use(authMiddleware);
router.post('/register', registerStaff);   // Owner tạo nhân viên
router.get('/', listStaff);                // Danh sách nhân viên
router.post('/offline', goOffline);        // Đánh dấu offline

module.exports = router;
