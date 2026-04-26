import dotenv from 'dotenv'
dotenv.config()

// Test basic startup immediately
console.log('[Postly] Node process started')
console.log('[Postly] NODE_ENV:', process.env.NODE_ENV)
console.log('[Postly] PORT:', process.env.PORT)

import express from 'express'
const app = express()

const PORT = process.env.PORT || 3000

// Start server immediately — nothing else
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Postly] Server running on port ${PORT}`)
})