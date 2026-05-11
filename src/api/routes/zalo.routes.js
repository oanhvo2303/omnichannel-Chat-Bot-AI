'use strict';

const express = require('express');
const { verifyZaloSignature }              = require('../middlewares/zaloSignature.middleware');
const { verifyZaloWebhook, handleZaloEvent } = require('../controllers/zalo.controller');

const router = express.Router();

// GET — Zalo verification handshake (không cần verify signature)
router.get('/', verifyZaloWebhook);

// POST — Nhận event thật từ Zalo OA
// FIX: Bắt buộc verify HMAC chữ ký trước khi xử lý
router.post('/', verifyZaloSignature, handleZaloEvent);

module.exports = router;
