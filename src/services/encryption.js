import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex')

/**
 * Encrypts a string using AES-256-CBC
 * @param {string} text 
 * @returns {string} ivHex:encryptedHex
 */
export function encrypt(text) {
  if (!text) return null
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

/**
 * Decrypts a string
 * @param {string} str ivHex:encryptedHex
 * @returns {string} plaintext
 */
export function decrypt(str) {
  if (!str) return null
  const [ivHex, encryptedHex] = str.split(':')
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'))
  return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8')
}
