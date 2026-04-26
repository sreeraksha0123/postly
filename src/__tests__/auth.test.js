import request from 'supertest';
import app from '../app.js';
import prisma from '../config/db.js';
import jwt from 'jsonwebtoken';

const testUser = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Tester'
};

beforeAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.platformPost.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.user.deleteMany({ where: { email: 'test@example.com' } });
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('Auth Endpoints', () => {
  let accessToken;
  let refreshToken;

  test('POST /api/auth/register - Success', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe(testUser.email);
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  test('POST /api/auth/register - Duplicate Email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Email already registered');
  });

  test('POST /api/auth/login - Success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  test('GET /api/auth/me - Success', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(testUser.email);
  });

  test('GET /api/auth/me - No Token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  test('POST /api/auth/refresh - Valid rotation', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    
    // Attempt second use of old token
    const res2 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    
    expect(res2.status).toBe(401);
  });
});
