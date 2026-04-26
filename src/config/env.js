require('dotenv').config();
/**
 * Environment variables configuration and validation
 */
module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
};
