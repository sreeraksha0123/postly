import prisma from '../config/db.js'
import { encrypt } from './encryption.js'

class UserService {
  async getProfile(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, bio: true, defaultTone: true, defaultLanguage: true }
    })
  }

  async updateProfile(userId, data) {
    return await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, bio: true, defaultTone: true, defaultLanguage: true }
    })
  }

  async addSocialAccount(userId, { platform, accessToken, refreshToken, handle }) {
    // using unique index on [userId, platform] to prevent multiple connections for same service
    const existing = await prisma.socialAccount.findUnique({
        where: { userId_platform: { userId, platform } }
    })
    
    if (existing) {
        const error = new Error(`Account for ${platform} already connected`)
        error.statusCode = 409
        throw error
    }

    return await prisma.socialAccount.create({
      data: {
        userId,
        platform,
        accessTokenEnc: encrypt(accessToken),
        refreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
        handle
      },
      select: { id: true, platform: true, handle: true, connectedAt: true }
    })
  }

  async getSocialAccounts(userId) {
    return await prisma.socialAccount.findMany({
      where: { userId },
      select: { id: true, platform: true, handle: true, connectedAt: true }
    })
  }

  async deleteSocialAccount(userId, id) {
    const account = await prisma.socialAccount.findUnique({ where: { id } })
    if (!account) throw new Error('Account not found')
    
    // account belongs to a different user, bail
    if (account.userId !== userId) {
        const error = new Error('Forbidden')
        error.statusCode = 403
        throw error
    }

    await prisma.socialAccount.delete({ where: { id } })
  }

  async updateAiKeys(userId, { openaiKey, anthropicKey }) {
    const updateData = {}
    if (openaiKey) updateData.openaiKeyEnc = encrypt(openaiKey)
    if (anthropicKey) updateData.anthropicKeyEnc = encrypt(anthropicKey)

    const result = await prisma.aiKeys.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData }
    })

    return {
      hasOpenai: !!result.openaiKeyEnc,
      hasAnthropic: !!result.anthropicKeyEnc
    }
  }
}

export default new UserService()
