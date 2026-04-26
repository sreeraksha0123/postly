import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../config/db.js'

class AuthService {
  /**
   * Generates Access and Refresh tokens
   */
  generateTokens(payload) {
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
    // Use randomBytes for a non-deterministic, high-entropy refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex')
    return { accessToken, refreshToken }
  }

  /**
   * Register logic
   */
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

  /**
   * Login logic
   */
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

  /**
   * Refresh token rotation
   */
  async refresh(oldToken) {
    // Note: Refresh tokens are now opaque random strings, verified against DB only.
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: oldToken },
      include: { user: true }
    })

    if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
      const error = new Error('Invalid refresh token')
      error.statusCode = 401
      throw error
    }

    // Revoke old
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

  /**
   * Logout (revocation)
   */
  async logout(token) {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true }
    })
  }

  /**
   * Current user
   */
  async me(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true, bio: true, defaultTone: true, defaultLanguage: true }
    })
  }
}

export default new AuthService()
