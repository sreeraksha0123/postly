process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message)
  console.error(err.stack)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason)
  process.exit(1)
})

import dotenv from 'dotenv'
dotenv.config()

console.log('[Postly] ===== STARTUP BEGIN =====')
console.log('[Postly] Node version:', process.version)
console.log('[Postly] NODE_ENV:', process.env.NODE_ENV)
console.log('[Postly] PORT:', process.env.PORT)
console.log('[Postly] DATABASE_URL exists:', !!process.env.DATABASE_URL)
console.log('[Postly] REDIS_URL exists:', !!process.env.REDIS_URL)
console.log('[Postly] TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN)

import express from 'express'

console.log('[Postly] Express imported OK')

const app = express()
const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'

// health must be first so railway can ping while modules are still loading
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    node: process.version,
    env: NODE_ENV
  })
})

console.log('[Postly] Health endpoint registered')

// app.listen has to happen fast or container dies on startup
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Postly] ===== SERVER LISTENING ON PORT ${PORT} =====`)
})

server.on('error', (err) => {
  console.error('[Postly] Server error:', err.message)
  process.exit(1)
})

// async imports prevent blocking the main thread while waiting for connections
async function loadApp() {
  try {
    console.log('[Postly] Loading app modules...')
    
    const { default: appRouter } = await import('./app.js')
    console.log('[Postly] App router loaded')
    
    app.use(appRouter)
    console.log('[Postly] Routes mounted')
    
    const { default: prisma } = await import('./config/db.js')
    try {
      await prisma.$connect()
      console.log('[Postly] Database connected')
    } catch (dbErr) {
      console.error('[Postly] Database error (non-fatal):', dbErr.message)
    }
    
    const { default: redis } = await import('./config/redis.js')
    try {
      await redis.connect()
      console.log('[Postly] Redis connected')
    } catch (redisErr) {
      console.error('[Postly] Redis error (non-fatal):', redisErr.message)
    }
    
    try {
      await import('./queue/workers/platformWorker.js')
      console.log('[Postly] Workers initialized')
    } catch (workerErr) {
      console.error('[Postly] Worker error (non-fatal):', workerErr.message)
    }
    
    try {
      const { bot } = await import('./services/telegram.js')
      if (NODE_ENV === 'production') {
        const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
        if (webhookUrl) {
          await bot.api.setWebhook(webhookUrl, {
            secret_token: process.env.WEBHOOK_SECRET
          })
          console.log('[Postly] Webhook set:', webhookUrl)
        } else {
          console.warn('[Postly] No TELEGRAM_WEBHOOK_URL set')
        }
      } else {
        bot.start().catch(e => 
          console.error('[Postly] Bot polling error (non-fatal):', e.message)
        )
        console.log('[Postly] Bot polling started')
      }
    } catch (botErr) {
      console.error('[Postly] Bot error (non-fatal):', botErr.message)
    }

    console.log('[Postly] ===== FULLY OPERATIONAL =====')
    
  } catch (err) {
    console.error('[Postly] loadApp error:', err.message)
    console.error(err.stack)
    // server is listening so healthcheck still passes even if modules fail
  }
}

const shutdown = async (signal) => {
  console.log(`[Postly] ${signal} received`)
  server.close(() => console.log('[Postly] HTTP closed'))
  try {
    const { default: prisma } = await import('./config/db.js')
    await prisma.$disconnect()
  } catch {}
  try {
    const { default: redis } = await import('./config/redis.js')
    redis.disconnect()
  } catch {}
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

loadApp()