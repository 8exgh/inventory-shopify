import { getSystemDb } from './system';

export interface ShopifyConnection {
  shop: string;
  access_token: string;
  scope: string;
  location_id: string;
  connected_by_user_id: string;
  connected_at: number;
  status: 'connected' | 'disconnected';
}

export function getShopifyConnection(): ShopifyConnection | null {
  const db = getSystemDb();
  const row = db.prepare(
    `SELECT * FROM shopify_connection WHERE id = 1 AND status = 'connected'`
  ).get() as ShopifyConnection | undefined;
  return row || null;
}

export function saveShopifyConnection(
  connection: Omit<ShopifyConnection, 'connected_at' | 'status'>
): void {
  const db = getSystemDb();
  // Single-row table: re-authorizing (rotation, or even a different shop)
  // simply overwrites the connection.
  db.prepare(`
    INSERT INTO shopify_connection (id, shop, access_token, scope, location_id, connected_by_user_id, connected_at, status)
    VALUES (1, ?, ?, ?, ?, ?, ?, 'connected')
    ON CONFLICT(id) DO UPDATE SET
      shop = excluded.shop,
      access_token = excluded.access_token,
      scope = excluded.scope,
      location_id = excluded.location_id,
      connected_by_user_id = excluded.connected_by_user_id,
      connected_at = excluded.connected_at,
      status = 'connected'
  `).run(
    connection.shop,
    connection.access_token,
    connection.scope,
    connection.location_id,
    connection.connected_by_user_id,
    Date.now()
  );
}
