-- Dev-only convenience seed. Password is bcrypt of "password123".
-- Safe to skip/delete for production migrations.
INSERT INTO users (id, email, password_hash, name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev@postly.local',
  '$2b$10$M4b6z1r3z8p1u1G0h1s8UO1p8m5z9v3G1jv1H0z4kQjv8m5z9v3G1',
  'Dev User'
)
ON CONFLICT (email) DO NOTHING;
