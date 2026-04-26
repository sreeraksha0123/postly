import express from 'express';
import { webhookCallback } from 'grammy';
import { bot } from '../services/telegram.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const { WEBHOOK_SECRET } = process.env;

/**
 * Telegram Webhook Handler
 */
router.post('/webhook', (req, res, next) => {
  // Verify secret token from Telegram headers
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  
  if (secretToken !== WEBHOOK_SECRET) {
      console.warn('[WEBHOOK] Unauthorized access attempt');
      return res.status(403).json({ error: 'Unauthorized' });
  }

  return webhookCallback(bot, 'express')(req, res, next);
});

export default router;
