import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { errorHandler } from './middleware/errorHandler.js'

// Route Imports
import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import contentRoutes from './routes/content.js'
import postsRoutes from './routes/posts.js'
import botRoutes from './routes/bot.js'
import dashboardRoutes from './routes/dashboard.js'

const app = express()

// Security & Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Rate Limiting: 100 requests every 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { data: null, error: { message: 'Too many requests, please try again later', code: 'RATE_LIMIT' } }
})
app.use('/api', limiter)

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/content', contentRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/bot', botRoutes)
app.use('/api/dashboard', dashboardRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ data: null, error: { message: 'Route not found', code: 'NOT_FOUND' } })
})

// Error handler
app.use(errorHandler)

export default app
