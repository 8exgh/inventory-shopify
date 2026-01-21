import { insertEvent } from '@/lib/db/user-db';

export interface StoreShopifyTokenParams {
  userId: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
  shop: string;
}

/**
 * Stores a Shopify access token as an event in the user's database.
 * Uses aggregate_id='shopify-auth' since this is user-level auth, not product-level.
 */
export function handleStoreShopifyToken(params: StoreShopifyTokenParams): void {
  const { userId, accessToken, expiresAt, scope, shop } = params;

  insertEvent(userId, {
    aggregateId: 'shopify-auth',
    eventType: 'ShopifyTokenReceived',
    eventData: JSON.stringify({
      accessToken,
      expiresAt,
      scope,
      shop
    }),
    timestamp: Date.now(),
    version: 1 // Version isn't critical for this aggregate type
  });
}
