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
    // STEP 1: Start HTTP server FIRST on 0.0.0.0
    // Railway healthcheck needs /health to respond before anything else
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Postly] Server running on port ${PORT} (${NODE_ENV})`)
    })

    // STEP 2: Connect database (after server is already listening)
    try {
      await prisma.$connect()
      console.log('[Postly] Database connected')
    } catch (dbError) {
      console.error('[Postly] Database connection failed:', dbError.message)
      // Don't exit — let healthcheck pass, Railway will show DB error in logs
    }

    // STEP 3: Connect Redis (non-fatal if slow)
    try {
      await redis.connect()
      console.log('[Postly] Redis connected')
    } catch (redisError) {
      console.error('[Postly] Redis connection failed (non-fatal):', redisError.message)
    }

    // STEP 4: Telegram bot setup (fully non-blocking, non-fatal)
    if (NODE_ENV === 'production') {
      setImmediate(async () => {
        try {
          const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
          const botToken = process.env.TELEGRAM_BOT_TOKEN
          if (webhookUrl && botToken) {
            await bot.api.setWebhook(webhookUrl, {
              secret_token: process.env.WEBHOOK_SECRET
            })
            console.log(`[Postly] Webhook configured: ${webhookUrl}`)
          } else {
            console.warn('[Postly] Telegram env vars missing — bot not configured')
          }
        } catch (botError) {
          console.error('[Postly] Webhook setup failed (non-fatal):', botError.message)
        }
      })
    } else {
      // Development: start polling in background, never block
      bot.start().catch(err =>
        console.error('[Postly] Bot polling error (non-fatal):', err.message)
      )
      console.log('[Postly] Bot polling started (development)')
    }

    // STEP 5: Graceful shutdown handlers
    const shutdown = async (signal) => {
      console.log(`[Postly] ${signal} received — shutting down gracefully`)
      server.close(() => console.log('[Postly] HTTP server closed'))
      try { await prisma.$disconnect() } catch {}
      try { redis.disconnect() } catch {}
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // STEP 6: Catch unhandled rejections — log but don't crash
    process.on('unhandledRejection', (reason) => {
      console.error('[Postly] Unhandled rejection:', reason)
    })

    process.on('uncaughtException', (err) => {
      console.error('[Postly] Uncaught exception:', err.message)
      // Don't exit — let Railway restart if needed
    })

  } catch (error) {
    console.error('[Postly] Critical startup error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

start()
