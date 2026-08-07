import jwt from 'jsonwebtoken';
import { getLogger } from '@/lib/logger';

const log = getLogger('auth/session-token');

// App Bridge session tokens: HS256 JWTs signed with the app's client secret.
// They identify the shop (dest) and admin user (sub) for a single request;
// they are NOT API access tokens.
export interface ShopifySessionToken {
  iss: string;  // https://{shop}.myshopify.com/admin
  dest: string; // https://{shop}.myshopify.com
  aud: string;  // client id
  sub: string;  // Shopify user id
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

export function verifySessionToken(token: string): ShopifySessionToken | null {
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientSecret || !clientId) {
    log.error('SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET not configured');
    return null;
  }

  try {
    const payload = jwt.verify(token, clientSecret, {
      algorithms: ['HS256'],
      audience: clientId,
      clockTolerance: 5
    }) as ShopifySessionToken;

    if (!payload.dest || !payload.dest.endsWith('.myshopify.com')) {
      log.warn('Session token has unexpected dest', payload.dest);
      return null;
    }
    return payload;
  } catch (error: any) {
    log.debug(`Session token verification failed: ${error.message}`);
    return null;
  }
}

// "https://x.myshopify.com" -> "x.myshopify.com"
export function shopFromSessionToken(payload: ShopifySessionToken): string {
  return new URL(payload.dest).hostname.toLowerCase();
}
