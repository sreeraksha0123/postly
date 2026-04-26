import request from 'supertest';
import app from '../app.js';
import prisma from '../config/db.js';

describe('Full Database Round-Trip Integration', () => {

  const testEmail = 'integration@test.com';
  const testPassword = 'password123';
  let accessToken;

  beforeAll(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  test('Complex Flow: Register -> Login -> Profile Management', async () => {
    // 1. Register
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: testPassword, name: 'Integration Admin' });
    
    expect(regRes.status).toBe(201);
    expect(regRes.body.data.email).toBe(testEmail);

    // 2. Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    
    expect(loginRes.status).toBe(200);
    accessToken = loginRes.body.data.accessToken;

    // 3. Get /me
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.name).toBe('Integration Admin');

    // 4. Update Profile
    const updateRes = await request(app)
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bio: 'I am an automated integration test.', defaultTone: 'witty' });
    
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.bio).toBe('I am an automated integration test.');

    // 5. Verify Persistence via GET
    const profileRes = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.defaultTone).toBe('witty');

    // 6. Direct DB Verification
    const userInDb = await prisma.user.findUnique({
        where: { email: testEmail }
    });
    expect(userInDb.bio).toBe('I am an automated integration test.');
    expect(userInDb.defaultTone).toBe('witty');
  });

});
