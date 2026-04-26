import dotenv from 'dotenv'
dotenv.config()

import app from './app.js'
import prisma from './config/db.js'
import redis from './config/redis.js'
import { bot } from './services/telegram.js'

const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'

async function start() {
  try {
    console.log('[Postly] Starting up...')
    console.log('[Postly] NODE_ENV:', process.env.NODE_ENV)
    console.log('[Postly] PORT:', process.env.PORT)
    console.log('[Postly] DATABASE_URL exists:', !!process.env.DATABASE_URL)
    console.log('[Postly] REDIS_URL exists:', !!process.env.REDIS_URL)
    console.log('[Postly] TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN)

    // STEP 1: Start HTTP server FIRST
    // This ensures healthchecks pass immediately while other services connect
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Postly] Server running on port ${PORT} (${NODE_ENV})`)
    })

    // STEP 2: Database Connection (Non-blocking)
    try {
      await prisma.$connect()
      console.log('[Postly] Database connected')
    } catch (dbError) {
      console.error('[Postly] Database connection failed:', dbError.message)
    }

    // STEP 3: Redis Connection (Non-blocking)
    try {
      await redis.connect()
      console.log('[Postly] Redis connected')
    } catch (redisError) {
      console.error('[Postly] Redis connection failed (non-fatal):', redisError.message)
    }

    // STEP 4: Import workers after Redis is potentially ready
    // Using dynamic import to avoid blocking the main server startup
    try {
      await import('./queue/workers/platformWorker.js')
      console.log('[Postly] Background workers initialized')
    } catch (workerError) {
      console.error('[Postly] Worker initialization failed:', workerError.message)
    }

    // STEP 5: Telegram Bot Setup
    if (NODE_ENV === 'production') {
      try {
        const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
        if (webhookUrl && bot.api.setWebhook) {
          await bot.api.setWebhook(webhookUrl, {
            secret_token: process.env.WEBHOOK_SECRET
          })
          console.log(`[Postly] Telegram webhook set: ${webhookUrl}`)
        }
      } catch (botError) {
        console.error('[Postly] Bot webhook failed:', botError.message)
      }
    } else {
      bot.start?.()
      console.log('[Postly] Bot polling started (Development)')
    }

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`[Postly] ${signal} received — shutting down`)
      server.close()
      try { await prisma.$disconnect() } catch {}
      try { redis.disconnect() } catch {}
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('unhandledRejection', (reason) => console.error('[Postly] Unhandled Rejection:', reason))

  } catch (error) {
    console.error('[Postly] Critical startup error:', error.message)
    process.exit(1)
  }
}

start()
