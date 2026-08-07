import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, shopFromSessionToken } from '@/lib/auth/session-token';
import { provisionShopConnection } from '@/lib/db/shopify-connection';
import { shopifyGraphql } from '@/lib/shopify/graphql';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/auth/shopify/token-exchange');

// Embedded-app boot: exchange the App Bridge session token for an offline
// access token (Shopify managed installation - no OAuth redirect ever) and
// provision the shop's tenant. Idempotent; called on every embedded load.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing session token' }, { status: 401 });
    }
    const sessionToken = authHeader.substring(7);

    const payload = verifySessionToken(sessionToken);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session token' }, { status: 401 });
    }
    const shop = shopFromSessionToken(payload);

    // Token exchange (RFC 8693 profile)
    const exchangeResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: sessionToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token'
      })
    });

    if (!exchangeResponse.ok) {
      const text = await exchangeResponse.text();
      log.error(`Token exchange failed for ${shop}: ${exchangeResponse.status}`, text);
      return NextResponse.json({ error: 'Token exchange failed' }, { status: 502 });
    }

    const tokenData = await exchangeResponse.json() as { access_token: string; scope: string };

    // Shop.primaryLocation was removed from the Admin API; take the first
    // active location that stocks inventory (falling back to the first active).
    const locationData = await shopifyGraphql(shop, tokenData.access_token, `
      query InventoryLocations {
        locations(first: 10, includeInactive: false) {
          nodes { id name shipsInventory }
        }
      }
    `);
    const locations: Array<{ id: string; name: string; shipsInventory: boolean }> =
      locationData.locations?.nodes || [];
    const locationId = (locations.find(l => l.shipsInventory) || locations[0])?.id;
    if (!locationId) {
      log.error(`No active location for ${shop}`);
      return NextResponse.json({ error: 'Store has no active inventory location' }, { status: 502 });
    }
    log.debug(`Using location ${locationId} for ${shop}`);

    const tenantId = provisionShopConnection({
      shop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      locationId,
      connectedBy: `shopify:${payload.sub}`
    });

    log.info(`Provisioned ${shop} (tenant ${tenantId}) via token exchange`);
    return NextResponse.json({ success: true, shop, tenantId });
  } catch (error: any) {
    log.error('Token exchange error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
