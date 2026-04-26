import { jest } from '@jest/globals';

await jest.unstable_mockModule('../queue/publisher.js', () => ({
  addPublishJobs: jest.fn().mockResolvedValue(['job-123'])
}));

await jest.unstable_mockModule('../services/content.js', () => ({
  generatePlatformContent: jest.fn().mockResolvedValue({
    generated: { twitter: { content: 'Mock Tweet', char_count: 10 } },
    model_used: 'gpt-4o',
    tokens_used: 100
  }),
  generateMultiPlatformContent: jest.fn().mockResolvedValue({
    generated: { twitter: { content: 'Mock Tweet', char_count: 10 } },
    model_used: 'gpt-4o',
    tokens_used: 100
  }),
  generateSchema: { parse: (v) => v }
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../app.js');
const { default: prisma } = await import('../config/db.js');

let accessToken;
let userId;

beforeAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.platformPost.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.user.deleteMany({ where: { email: 'posts@test.com' } });

  const regRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'posts@test.com', password: 'password123', name: 'Tester' });
  userId = regRes.body.data.id;

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'posts@test.com', password: 'password123' });
  accessToken = loginRes.body.data.accessToken;
});

describe('Post Operations', () => {
  let createdPostId;

  test('POST /api/posts/publish - Success', async () => {
    const res = await request(app)
      .post('/api/posts/publish')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        idea: 'Campaign idea',
        postType: 'promotional',
        platforms: ['twitter'],
        tone: 'witty',
        language: 'en',
        model: 'openai'
      });

    expect(res.status).toBe(202);
    expect(res.body.data).toHaveProperty('postId');
    createdPostId = res.body.data.postId;

    // Verify DB
    const post = await prisma.post.findUnique({ where: { id: createdPostId } });
    expect(post).toBeTruthy();
    expect(post.status).toBe('QUEUED');
  });

  test('GET /api/posts/:id - Success', async () => {
    const res = await request(app)
      .get(`/api/posts/${createdPostId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdPostId);
  });

  test('GET /api/posts/:id - Wrong User', async () => {
    const otherUser = await prisma.user.create({
        data: { email: 'other@test.com', passwordHash: 'hash', name: 'Other' }
    });

    const otherPost = await prisma.post.create({
        data: {
            userId: otherUser.id,
            idea: 'Secret',
            postType: 'STORY',
            tone: 'casual',
            modelUsed: 'gpt-4o',
            status: 'QUEUED'
        }
    });

    const res = await request(app)
      .get(`/api/posts/${otherPost.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});
