import authService from '../services/authService.js'
import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2)
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

class AuthController {
  async register(req, res, next) {
    try {
      const user = await authService.register(req.body)
      res.status(201).json({ data: user, error: null })
    } catch (error) {
      next(error)
    }
  }

  async login(req, res, next) {
    try {
      const result = await authService.login(req.body)
      res.status(200).json({ data: result, error: null })
    } catch (error) {
      next(error)
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body
      if (!refreshToken) throw new Error('Refresh token required')
      const result = await authService.refresh(refreshToken)
      res.status(200).json({ data: result, error: null })
    } catch (error) {
      next(error)
    }
  }

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body
      await authService.logout(refreshToken)
      res.status(200).json({ data: { success: true }, error: null })
    } catch (error) {
      next(error)
    }
  }

  async me(req, res, next) {
    try {
      const user = await authService.me(req.user.userId)
      res.status(200).json({ data: user, error: null })
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController()
