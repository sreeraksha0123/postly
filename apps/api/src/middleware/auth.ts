import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "@postly/shared";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; role: string };
}

/**
 * Thin wrapper around jwt.sign. jsonwebtoken's types require `expiresIn`
 * to be a template-literal `StringValue` (e.g. "7d") rather than a plain
 * `string`, which our env-sourced config can't statically satisfy — cast
 * once here instead of at every call site.
 */
export function signToken(payload: object): string {
  return jwt.sign(payload, config.security.jwtSecret, {
    expiresIn: config.security.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, config.security.jwtSecret) as AuthedRequest["user"];
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
