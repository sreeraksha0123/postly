import { jest } from '@jest/globals';

await jest.unstable_mockModule('../services/openai.js', () => ({
  generateContent: jest.fn().mockResolvedValue({
    generated: { twitter: { content: 'Mock tweet', hashtags: ['#test'] } },
    model_used: 'gpt-4o-mock',
    tokensUsed: 10
  })
}));

await jest.unstable_mockModule('../services/anthropic.js', () => ({
  generateContent: jest.fn().mockResolvedValue({
    generated: { twitter: { content: 'Mock tweet', hashtags: ['#test'] } },
    model_used: 'claude-mock',
    tokensUsed: 10
  })
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../app.js');
const { default: prisma } = await import('../config/db.js');

let accessToken;

beforeAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.platformPost.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.user.deleteMany({ where: { email: 'content@test.com' } });

  const regRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'content@test.com', password: 'password123', name: 'Tester' });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'content@test.com', password: 'password123' });
  accessToken = loginRes.body.data.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'content@test.com' } });
  await prisma.$disconnect();
});

describe('Content Generation Validation', () => {
  test('POST /api/content/generate - Missing idea', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ postType: 'announcement', platforms: ['twitter'], tone: 'casual', language: 'en', model: 'openai' });
    expect(res.status).toBe(400);
  });

  test('POST /api/content/generate - Idea too long', async () => {
    const longIdea = 'a'.repeat(501);
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ idea: longIdea, postType: 'announcement', platforms: ['twitter'], tone: 'casual', language: 'en', model: 'openai' });
    expect(res.status).toBe(400);
  });

  test('POST /api/content/generate - Success', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ idea: 'valid idea', postType: 'announcement', platforms: ['twitter'], tone: 'casual', language: 'en', model: 'openai' });
    console.log('response body:', JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('generated');
    expect(res.body.data.model_used).toBe('gpt-4o-mock');
  });
});
