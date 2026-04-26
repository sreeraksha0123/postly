import { Router } from 'express'
import { bot } from '../services/telegram.js'
import { webhookCallback } from 'grammy'

const router = Router()

router.post('/webhook', async (req, res) => {
  // Verify Telegram secret token
  const secretToken = req.headers['x-telegram-bot-api-secret-token']
  if (process.env.WEBHOOK_SECRET && secretToken !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    await webhookCallback(bot, 'express')(req, res)
  } catch (err) {
    console.error('[Bot] Webhook error:', err.message)
    res.status(200).json({ ok: true }) // Always return 200 to Telegram
  }
})

router.get('/status', async (req, res) => {
  try {
    const info = await bot.api.getWebhookInfo()
    res.json({ data: info, error: null })
  } catch (err) {
    res.json({ data: null, error: { message: err.message } })
  }
})

export default router
