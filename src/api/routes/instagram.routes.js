'use strict';

const express = require('express');
const { verifyFacebookSignature }                          = require('../middlewares/facebookSignature.middleware');
const { verifyInstagramWebhook, handleInstagramEvent }     = require('../controllers/instagram.controller');

const router = express.Router();

// GET — Verification handshake (Meta gửi GET để verify webhook endpoint)
router.get('/', verifyInstagramWebhook);

// POST — Nhận event thật từ Instagram Messaging API
// FIX: Instagram dùng chung Facebook App Secret → tái dùng verifyFacebookSignature
// (header X-Hub-Signature-256 được Meta ký cho cả FB và IG webhook)
router.post('/', verifyFacebookSignature, handleInstagramEvent);

module.exports = router;
