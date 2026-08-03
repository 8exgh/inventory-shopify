import { NextRequest } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';

function getBackgroundProcessorApiKey(): string {
  const key = process.env.BACKGROUND_PROCESSOR_API_KEY;
  if (!key) {
    throw new Error('BACKGROUND_PROCESSOR_API_KEY environment variable must be set');
  }
  return key;
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
  role?: 'admin' | 'restocker';
  isApiKey?: boolean;
  error?: string;
}

export function authenticateRequest(request: NextRequest): AuthResult {
  // Check for API Key first
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey && apiKey === getBackgroundProcessorApiKey()) {
    return { authenticated: true, isApiKey: true };
  }

  // Check for JWT
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'No authentication provided' };
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  // Tokens minted before multi-tenancy lack tenantId and are invalid
  if (!payload || !payload.userId || !payload.tenantId) {
    return { authenticated: false, error: 'Invalid token' };
  }

  return {
    authenticated: true,
    userId: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role,
    isApiKey: false
  };
}

export function requireAuth(request: NextRequest): AuthResult {
  const auth = authenticateRequest(request);
  if (!auth.authenticated) {
    return auth;
  }
  return auth;
}

export function requireAdmin(request: NextRequest): AuthResult {
  const auth = authenticateRequest(request);
  if (!auth.authenticated) {
    return auth;
  }

  if (auth.isApiKey) {
    return auth; // API key has full access
  }

  if (auth.role !== 'admin') {
    return { authenticated: false, error: 'Admin role required' };
  }

  return auth;
}

export function requireApiKey(request: NextRequest): AuthResult {
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== getBackgroundProcessorApiKey()) {
    return { authenticated: false, error: 'Valid API key required' };
  }

  return { authenticated: true, isApiKey: true };
}
