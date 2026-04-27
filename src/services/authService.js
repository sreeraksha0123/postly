import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../config/db.js'

class AuthService {
  generateTokens(payload) {
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
    // refresh token is opaque random bytes, not JWT — can't be decoded by client
    const refreshToken = crypto.randomBytes(40).toString('hex')
    return { accessToken, refreshToken }
  }

  async register({ email, password, name }) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      const error = new Error('Email already registered')
      error.statusCode = 409
      error.code = 'DUPLICATE_EMAIL'
      throw error
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true }
    })

    return user
  }

  async login({ email, password }) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      const error = new Error('Invalid credentials')
      error.statusCode = 401
      throw error
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      const error = new Error('Invalid credentials')
      error.statusCode = 401
      throw error
    }

    const { accessToken, refreshToken } = this.generateTokens({ userId: user.id, email: user.email })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt
      }
    })

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name }
    }
  }

  async refresh(oldToken) {
    // verified against DB since opaque tokens have no internal state
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: oldToken },
      include: { user: true }
    })

    if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
      const error = new Error('Invalid refresh token')
      error.statusCode = 401
      throw error
    }

    // burn the old one to prevent reuse
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true }
    })

    const { accessToken, refreshToken } = this.generateTokens({ 
      userId: tokenRecord.userId, 
      email: tokenRecord.user.email 
    })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: tokenRecord.userId,
        expiresAt
      }
    })

    return { accessToken, refreshToken }
  }

  async logout(token) {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true }
    })
  }

  async me(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true, bio: true, defaultTone: true, defaultLanguage: true }
    })
  }
}

export default new AuthService()
