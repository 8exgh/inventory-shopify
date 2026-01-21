import { getUserDb } from '@/lib/db/user-db';
import { Event, ShopifyTokenReceivedData } from '@/types/events';

export interface ShopifyTokenResult {
  accessToken: string;
  expiresAt: number;
  shop: string;
}

/**
 * Gets the latest valid Shopify token for a user.
 * Returns null if no token exists or if it's expired (with 5-min buffer).
 */
export function getLatestShopifyToken(userId: string): ShopifyTokenResult | null {
  const db = getUserDb(userId);

  // Query for the latest ShopifyTokenReceived event
  const event = db.prepare(`
    SELECT * FROM events
    WHERE aggregate_id = 'shopify-auth'
      AND event_type = 'ShopifyTokenReceived'
    ORDER BY timestamp DESC
    LIMIT 1
  `).get() as Event | undefined;

  if (!event) {
    return null;
  }

  const data = JSON.parse(event.event_data) as ShopifyTokenReceivedData;

  // Check if token is expired (with 5-minute buffer)
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  if (data.expiresAt - bufferMs <= now) {
    return null; // Token is expired or about to expire
  }

  return {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    shop: data.shop
  };
}

/**
 * Checks if a user has a valid (non-expired) Shopify connection.
 */
export function hasValidShopifyConnection(userId: string): boolean {
  return getLatestShopifyToken(userId) !== null;
}

/**
 * Gets Shopify connection status details for a user.
 */
export function getShopifyConnectionStatus(userId: string): {
  connected: boolean;
  shop?: string;
  expiresAt?: number;
} {
  const token = getLatestShopifyToken(userId);

  if (!token) {
    return { connected: false };
  }

  return {
    connected: true,
    shop: token.shop,
    expiresAt: token.expiresAt
  };
}
