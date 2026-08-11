import { v4 as uuidv4 } from 'uuid';
import { getSystemDb } from './system';

export interface ShopifyConnection {
  tenant_id: string;
  shop: string;
  access_token: string;
  scope: string;
  location_id: string;
  connected_by_user_id: string;
  connected_at: number;
  status: 'connected' | 'disconnected';
  // Offline tokens expire (1h) and are renewed with the refresh token (90d).
  token_expires_at: number | null;
  refresh_token: string | null;
  refresh_token_expires_at: number | null;
}

export function getShopifyConnection(tenantId: string): ShopifyConnection | null {
  const db = getSystemDb();
  const row = db.prepare(
    `SELECT * FROM shopify_connections WHERE tenant_id = ? AND status = 'connected'`
  ).get(tenantId) as ShopifyConnection | undefined;
  return row || null;
}

export function getConnectedShopifyConnections(): ShopifyConnection[] {
  const db = getSystemDb();
  return db.prepare(
    `SELECT * FROM shopify_connections WHERE status = 'connected'`
  ).all() as ShopifyConnection[];
}

// Any-status lookup: a returning shop (reinstall) reattaches to its tenant
export function getShopifyConnectionByShop(shop: string): ShopifyConnection | null {
  const db = getSystemDb();
  const row = db.prepare(
    `SELECT * FROM shopify_connections WHERE shop = ?`
  ).get(shop) as ShopifyConnection | undefined;
  return row || null;
}

// Install-driven provisioning: tenant identity is the shop. A shop that was
// connected before (even if uninstalled since) keeps its tenant and data;
// a brand-new shop gets a fresh tenant. Returns the tenantId.
export function provisionShopConnection(params: {
  shop: string;
  accessToken: string;
  scope: string;
  locationId: string;
  connectedBy: string;
  tokenExpiresAt: number;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
}): string {
  const db = getSystemDb();
  const existing = getShopifyConnectionByShop(params.shop);
  const tenantId = existing ? existing.tenant_id : uuidv4();

  db.transaction(() => {
    if (!existing) {
      db.prepare('INSERT INTO tenants (id, created_at) VALUES (?, ?)').run(tenantId, Date.now());
    }
    db.prepare(`
      INSERT INTO shopify_connections (
        tenant_id, shop, access_token, scope, location_id, connected_by_user_id,
        connected_at, status, token_expires_at, refresh_token, refresh_token_expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        shop = excluded.shop,
        access_token = excluded.access_token,
        scope = excluded.scope,
        location_id = excluded.location_id,
        connected_by_user_id = excluded.connected_by_user_id,
        connected_at = excluded.connected_at,
        status = 'connected',
        token_expires_at = excluded.token_expires_at,
        refresh_token = excluded.refresh_token,
        refresh_token_expires_at = excluded.refresh_token_expires_at
    `).run(
      tenantId,
      params.shop,
      params.accessToken,
      params.scope,
      params.locationId,
      params.connectedBy,
      Date.now(),
      params.tokenExpiresAt,
      params.refreshToken,
      params.refreshTokenExpiresAt
    );
  })();

  return tenantId;
}

export function markShopDisconnected(shop: string): boolean {
  const db = getSystemDb();
  const result = db.prepare(
    `UPDATE shopify_connections SET status = 'disconnected' WHERE shop = ?`
  ).run(shop);
  return result.changes > 0;
}

// Persists a rotated token pair after a refresh_token grant.
export function updateConnectionTokens(params: {
  tenantId: string;
  accessToken: string;
  tokenExpiresAt: number;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
}): void {
  const db = getSystemDb();
  db.prepare(`
    UPDATE shopify_connections
       SET access_token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ?
     WHERE tenant_id = ?
  `).run(
    params.accessToken,
    params.tokenExpiresAt,
    params.refreshToken,
    params.refreshTokenExpiresAt,
    params.tenantId
  );
}
