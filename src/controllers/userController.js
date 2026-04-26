import userService from '../services/userService.js'
import { z } from 'zod'

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional(),
  defaultTone: z.string().optional(),
  defaultLanguage: z.string().optional()
})

export const socialAccountSchema = z.object({
  platform: z.enum(['TWITTER', 'LINKEDIN', 'INSTAGRAM', 'THREADS']),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  handle: z.string()
})

export const aiKeysSchema = z.object({
  openaiKey: z.string().optional(),
  anthropicKey: z.string().optional()
})

class UserController {
  async getProfile(req, res, next) {
    try {
      const data = await userService.getProfile(req.user.userId)
      res.status(200).json({ data, error: null })
    } catch (e) { next(e) }
  }

  async updateProfile(req, res, next) {
    try {
      const data = await userService.updateProfile(req.user.userId, req.body)
      res.status(200).json({ data, error: null })
    } catch (e) { next(e) }
  }

  async addSocialAccount(req, res, next) {
    try {
      const data = await userService.addSocialAccount(req.user.userId, req.body)
      res.status(201).json({ data, error: null })
    } catch (e) { next(e) }
  }

  async getSocialAccounts(req, res, next) {
    try {
      const data = await userService.getSocialAccounts(req.user.userId)
      res.status(200).json({ data, error: null })
    } catch (e) { next(e) }
  }

  async deleteSocialAccount(req, res, next) {
    try {
      await userService.deleteSocialAccount(req.user.userId, req.params.id)
      res.status(200).json({ data: { success: true }, error: null })
    } catch (e) { next(e) }
  }

  async updateAiKeys(req, res, next) {
    try {
      const data = await userService.updateAiKeys(req.user.userId, req.body)
      res.status(200).json({ data, error: null })
    } catch (e) { next(e) }
  }
}

export default new UserController()
