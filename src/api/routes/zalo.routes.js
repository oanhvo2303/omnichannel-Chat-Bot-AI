'use strict';

const express = require('express');
const { verifyZaloWebhook, handleZaloEvent } = require('../controllers/zalo.controller');

const router = express.Router();

router.get('/', verifyZaloWebhook);
router.post('/', handleZaloEvent);

module.exports = router;
