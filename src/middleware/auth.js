import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const { JWT_ACCESS_SECRET } = process.env

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      data: null,
      error: { message: 'No token provided', code: 'NO_TOKEN' }
    })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET)
    req.user = {
      userId: decoded.userId,
      email: decoded.email
    }
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        data: null,
        error: { message: 'Token expired', code: 'TOKEN_EXPIRED' }
      })
    }
    
    // catch anything else like bad signature or tampered payload
    return res.status(401).json({
      data: null,
      error: { message: 'Invalid token', code: 'INVALID_TOKEN' }
    })
  }
}
