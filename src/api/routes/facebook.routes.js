'use strict';

const express = require('express');
const { verifyWebhook, handleIncomingEvent } = require('../controllers/facebook.controller');
const { verifyFacebookSignature } = require('../middlewares/facebookSignature.middleware');

const router = express.Router();

/**
 * GET /webhook/facebook
 * Facebook webhook verification handshake (called once by Meta during setup).
 * No signature needed for the GET request.
 */
router.get('/', verifyWebhook);

/**
 * POST /webhook/facebook
 * Receives all incoming events (messages, postbacks, etc.) from Facebook.
 * The verifyFacebookSignature middleware runs first to ensure request authenticity.
 */
router.post('/', verifyFacebookSignature, handleIncomingEvent);

module.exports = router;
