import dotenv from 'dotenv'
dotenv.config()

console.log('[Postly] Node process started')
console.log('[Postly] PORT:', process.env.PORT)

import express from 'express'
const app = express()
const PORT = process.env.PORT || 3000

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Postly] Server running on port ${PORT}`)
})