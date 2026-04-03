'use strict';

const express = require('express');
const { verifyInstagramWebhook, handleInstagramEvent } = require('../controllers/instagram.controller');

const router = express.Router();

router.get('/', verifyInstagramWebhook);
router.post('/', handleInstagramEvent);

module.exports = router;
