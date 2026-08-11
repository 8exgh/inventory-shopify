import {
  ShopifyConnection,
  getShopifyConnection,
  getConnectedShopifyConnections,
  updateConnectionTokens
} from '@/lib/db/shopify-connection';
import { getLogger } from '@/lib/logger';

const log = getLogger('shopify/token');

// Shopify rejects non-expiring offline tokens on the Admin API, so every
// token is short-lived (1h) and renewed with a refresh token (90d). Renew a
// little early so a request never races the expiry.
const RENEW_SKEW_MS = 5 * 60 * 1000;

export interface TokenGrant {
  accessToken: string;
  tokenExpiresAt: number;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
  scope: string;
}

// Normalizes an /admin/oauth/access_token response into absolute timestamps.
export function readTokenGrant(body: {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}): TokenGrant {
  const now = Date.now();
  return {
    accessToken: body.access_token,
    // A response without expires_in is a non-expiring token, which the Admin
    // API no longer accepts; treat it as already expired rather than caching
    // a token that can only 403.
    tokenExpiresAt: body.expires_in ? now + body.expires_in * 1000 : 0,
    refreshToken: body.refresh_token || null,
    refreshTokenExpiresAt: body.refresh_token_expires_in
      ? now + body.refresh_token_expires_in * 1000
      : null,
    scope: body.scope || ''
  };
}

export function tokenNeedsRenewal(connection: ShopifyConnection, now = Date.now()): boolean {
  return (connection.token_expires_at ?? 0) - RENEW_SKEW_MS <= now;
}

async function refresh(connection: ShopifyConnection): Promise<string | null> {
  if (!connection.refresh_token) {
    log.warn(`No refresh token for ${connection.shop}; awaiting re-install to mint one`);
    return null;
  }
  if (connection.refresh_token_expires_at && connection.refresh_token_expires_at <= Date.now()) {
    log.warn(`Refresh token for ${connection.shop} expired; awaiting merchant to reopen the app`);
    return null;
  }

  const response = await fetch(`https://${connection.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token
    })
  });

  if (!response.ok) {
    log.error(
      `Token refresh failed for ${connection.shop}: ${response.status}`,
      await response.text()
    );
    return null;
  }

  const grant = readTokenGrant(await response.json());
  updateConnectionTokens({
    tenantId: connection.tenant_id,
    accessToken: grant.accessToken,
    tokenExpiresAt: grant.tokenExpiresAt,
    refreshToken: grant.refreshToken,
    refreshTokenExpiresAt: grant.refreshTokenExpiresAt
  });
  log.debug(`Refreshed access token for ${connection.shop}`);
  return grant.accessToken;
}

// In-flight refreshes per tenant, so concurrent requests renew once.
const pending = new Map<string, Promise<string | null>>();

async function renew(connection: ShopifyConnection): Promise<string | null> {
  const existing = pending.get(connection.tenant_id);
  if (existing) return existing;
  const promise = refresh(connection).finally(() => pending.delete(connection.tenant_id));
  pending.set(connection.tenant_id, promise);
  return promise;
}

// Returns an access token that is valid right now, refreshing if needed.
export async function validAccessToken(connection: ShopifyConnection): Promise<string | null> {
  if (!tokenNeedsRenewal(connection)) return connection.access_token;
  return renew(connection);
}

// Connection for a tenant with its token guaranteed fresh.
export async function connectionWithFreshToken(
  tenantId: string
): Promise<ShopifyConnection | null> {
  const connection = getShopifyConnection(tenantId);
  if (!connection) return null;
  const accessToken = await validAccessToken(connection);
  if (!accessToken) return null;
  return { ...connection, access_token: accessToken };
}

// Every connected tenant, each with a fresh token. Tenants whose token can no
// longer be renewed are omitted rather than handed out dead.
export async function connectionsWithFreshTokens(): Promise<ShopifyConnection[]> {
  const connections = getConnectedShopifyConnections();
  const refreshed = await Promise.all(
    connections.map(async connection => {
      const accessToken = await validAccessToken(connection);
      return accessToken ? { ...connection, access_token: accessToken } : null;
    })
  );
  return refreshed.filter((c): c is ShopifyConnection => c !== null);
}
