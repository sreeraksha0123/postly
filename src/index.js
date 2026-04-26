import dotenv from 'dotenv'
dotenv.config()

import app from './app.js'
import prisma from './config/db.js'
import redis from './config/redis.js'
import { bot } from './services/telegram.js'
import './queue/workers/platformWorker.js'

const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'

async function start() {
  try {
    // 1. Connect to Database
    await prisma.$connect()
    console.log('[Postly] Database connected successfully')

    // 2. Telegram Bot Configuration
    if (NODE_ENV === 'production') {
      const webhookUrl = `${process.env.TELEGRAM_WEBHOOK_URL}/api/bot/webhook`
      await bot.api.setWebhook(webhookUrl, {
        secret_token: process.env.WEBHOOK_SECRET
      })
      console.log(`[Postly] Bot webhook set: ${webhookUrl}`)
    } else {
      bot.start()
      console.log('[Postly] Bot polling started (Development mode)')
    }

    // 3. Start Server
    const server = app.listen(PORT, () => {
      console.log(`[Postly] Server running on port ${PORT} in ${NODE_ENV} mode`)
    })

    // 4. Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`\n[Postly] ${signal} received. Closing connections...`)
      server.close(() => {
        console.log('[Postly] HTTP server closed.')
      })
      await prisma.$disconnect()
      await redis.quit()
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

  } catch (error) {
    console.error('[Postly] Critical startup error:', error)
    process.exit(1)
  }
}

start()
