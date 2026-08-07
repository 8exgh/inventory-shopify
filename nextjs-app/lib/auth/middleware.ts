import { NextRequest } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';
import { verifySessionToken, shopFromSessionToken } from './session-token';
import { getShopifyConnectionByShop } from '@/lib/db/shopify-connection';
import { getLogger } from '@/lib/logger';

const log = getLogger('auth/middleware');

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
  isEmbedded?: boolean;
  shop?: string;
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
    log.debug('Auth failed: no credentials on request');
    return { authenticated: false, error: 'No authentication provided' };
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (payload && payload.userId && payload.tenantId) {
    return {
      authenticated: true,
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      isApiKey: false
    };
  }

  // Not one of our JWTs: try an App Bridge session token (embedded admin).
  // Anyone Shopify lets into the app in the admin acts as the tenant admin.
  const sessionPayload = verifySessionToken(token);
  if (sessionPayload) {
    const shop = shopFromSessionToken(sessionPayload);
    const connection = getShopifyConnectionByShop(shop);
    if (!connection || connection.status !== 'connected') {
      log.debug(`Auth failed: session token for unprovisioned shop ${shop}`);
      return { authenticated: false, error: 'Shop not provisioned' };
    }
    return {
      authenticated: true,
      userId: `shopify:${sessionPayload.sub}`,
      tenantId: connection.tenant_id,
      role: 'admin',
      isApiKey: false,
      isEmbedded: true,
      shop
    };
  }

  // Tokens minted before multi-tenancy lack tenantId and are invalid
  log.debug('Auth failed: invalid or pre-tenancy JWT');
  return { authenticated: false, error: 'Invalid token' };
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
