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
