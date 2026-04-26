import { Router } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'

import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import contentRoutes from './routes/content.js'
import postsRoutes from './routes/posts.js'
import botRoutes from './routes/bot.js'
import dashboardRoutes from './routes/dashboard.js'

const router = Router()

router.use(helmet())
router.use(cors())
router.use(express.json())

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { 
    data: null, 
    error: { message: 'Too many requests', code: 'RATE_LIMIT' } 
  }
})
router.use('/api', limiter)

router.use('/api/auth', authRoutes)
router.use('/api/user', userRoutes)
router.use('/api/content', contentRoutes)
router.use('/api/posts', postsRoutes)
router.use('/api/bot', botRoutes)
router.use('/api/dashboard', dashboardRoutes)

router.use((req, res) => {
  res.status(404).json({ 
    data: null, 
    error: { message: 'Route not found', code: 'NOT_FOUND' } 
  })
})

router.use(errorHandler)

export default router
