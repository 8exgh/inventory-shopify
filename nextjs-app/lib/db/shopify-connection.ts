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
}): string {
  const db = getSystemDb();
  const existing = getShopifyConnectionByShop(params.shop);
  const tenantId = existing ? existing.tenant_id : uuidv4();

  db.transaction(() => {
    if (!existing) {
      db.prepare('INSERT INTO tenants (id, created_at) VALUES (?, ?)').run(tenantId, Date.now());
    }
    db.prepare(`
      INSERT INTO shopify_connections (tenant_id, shop, access_token, scope, location_id, connected_by_user_id, connected_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'connected')
      ON CONFLICT(tenant_id) DO UPDATE SET
        shop = excluded.shop,
        access_token = excluded.access_token,
        scope = excluded.scope,
        location_id = excluded.location_id,
        connected_by_user_id = excluded.connected_by_user_id,
        connected_at = excluded.connected_at,
        status = 'connected'
    `).run(
      tenantId,
      params.shop,
      params.accessToken,
      params.scope,
      params.locationId,
      params.connectedBy,
      Date.now()
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

// A shop may be actively connected by only one tenant (enforced by the
// partial unique index; this check gives the OAuth callback a friendly error).
export function isShopConnectedByOtherTenant(shop: string, tenantId: string): boolean {
  const db = getSystemDb();
  const row = db.prepare(
    `SELECT 1 FROM shopify_connections WHERE shop = ? AND status = 'connected' AND tenant_id != ?`
  ).get(shop, tenantId);
  return row !== undefined;
}

export function saveShopifyConnection(
  tenantId: string,
  connection: Omit<ShopifyConnection, 'tenant_id' | 'connected_at' | 'status'>
): void {
  const db = getSystemDb();
  // One row per tenant: re-authorizing (rotation, or even a different shop)
  // simply overwrites the connection.
  db.prepare(`
    INSERT INTO shopify_connections (tenant_id, shop, access_token, scope, location_id, connected_by_user_id, connected_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'connected')
    ON CONFLICT(tenant_id) DO UPDATE SET
      shop = excluded.shop,
      access_token = excluded.access_token,
      scope = excluded.scope,
      location_id = excluded.location_id,
      connected_by_user_id = excluded.connected_by_user_id,
      connected_at = excluded.connected_at,
      status = 'connected'
  `).run(
    tenantId,
    connection.shop,
    connection.access_token,
    connection.scope,
    connection.location_id,
    connection.connected_by_user_id,
    Date.now()
  );
}
