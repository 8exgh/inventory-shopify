import jwt, { SignOptions } from 'jsonwebtoken';

// Make sure getJwtSecret() is typed correctly
function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not defined');
    }
    return secret;  // Explicitly return string, not string | undefined
}

function getJwtExpiration(): string {
    return process.env.JWT_EXPIRATION || '7d';
}


export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: 'admin' | 'restocker';
  exp?: number;
}


// export function signToken(payload: Omit<JWTPayload, 'exp'>): string {
//   return jwt.sign(payload, getJwtSecret(), { expiresIn: getJwtExpiration() });
// }

export function signToken(payload: Omit<JWTPayload, 'exp'>): string {
    return (jwt.sign as any)(payload, getJwtSecret(), {
        expiresIn: getJwtExpiration()
    });
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
