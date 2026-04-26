import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('[DATABASE] Connected successfully');
  } catch (error) {
    console.error('[DATABASE] Connection error:', error.message);
  }
}

testConnection();

export default prisma;
