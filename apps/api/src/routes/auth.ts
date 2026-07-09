import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { signToken } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) return res.status(409).json({ error: "email already registered" });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name",
    [email, hash, name || null]
  );
  const user = rows[0];
  const token = signToken({ id: user.id, email: user.email, role: "user" });
  res.status(201).json({ user, token });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const { rows } = await pool.query("SELECT id, email, password_hash, name FROM users WHERE email = $1", [email]);
  if (rows.length === 0) return res.status(401).json({ error: "invalid credentials" });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "invalid credentials" });

  const token = signToken({ id: user.id, email: user.email, role: "user" });
  res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
});
