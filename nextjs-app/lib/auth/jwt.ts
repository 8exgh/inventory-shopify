import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return JWT_SECRET;
}

function getJwtExpiration(): string {
  const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';
  return JWT_EXPIRATION;
}

export interface JWTPayload {
  userId: string;
  role: 'admin' | 'restocker';
  exp?: number;
}

export function signToken(payload: Omit<JWTPayload, 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getJwtExpiration() });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}
