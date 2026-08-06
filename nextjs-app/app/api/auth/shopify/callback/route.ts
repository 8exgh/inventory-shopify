import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/shopify/hmac';
import { getUserById } from '@/lib/db/system';
import { saveShopifyConnection, isShopConnectedByOtherTenant } from '@/lib/db/shopify-connection';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/auth/shopify/callback');

function getShopifyClientId(): string {
  return process.env.SHOPIFY_CLIENT_ID || '';
}

function getShopifyClientSecret(): string {
  return process.env.SHOPIFY_CLIENT_SECRET || '';
}

function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-10';
}

// Behind the reverse proxy request.url resolves to the container's own
// address (localhost:3000), so browser redirects must use the public origin.
// SHOPIFY_REDIRECT_URI already carries it.
function getPublicBaseUrl(request: NextRequest): string {
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // fall through to request.url
    }
  }
  return request.url;
}

export async function GET(request: NextRequest) {
  const baseUrl = getPublicBaseUrl(request);
  try {
    const { searchParams } = new URL(request.url);

    // Extract query parameters
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const shop = searchParams.get('shop');
    const hmac = searchParams.get('hmac');

    // Get cookies
    const savedState = request.cookies.get('shopify_oauth_state')?.value;
    const savedShop = request.cookies.get('shopify_shop')?.value;
    const userId = request.cookies.get('shopify_user_id')?.value;

    // Validate required parameters
    if (!code || !state || !shop || !hmac) {
      log.error('Missing OAuth callback parameters');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_missing_params', baseUrl));
    }

    // Validate state (CSRF protection)
    if (state !== savedState) {
      log.error('OAuth state mismatch');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_state_mismatch', baseUrl));
    }

    // Validate shop matches
    if (shop !== savedShop) {
      log.error('OAuth shop mismatch');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_shop_mismatch', baseUrl));
    }

    // Validate user ID exists
    if (!userId) {
      log.error('Missing user ID in OAuth callback');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_no_user', baseUrl));
    }

    // Only an admin may complete the connection (the cookie alone proves
    // nothing about the role)
    const user = getUserById(userId);
    if (!user || user.role !== 'admin') {
      log.error('OAuth callback from non-admin user');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_not_admin', baseUrl));
    }

    // Verify HMAC signature
    const clientSecret = getShopifyClientSecret();
    const queryParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    log.debug(`OAuth callback received for shop ${shop} (user ${userId})`);
    if (!verifyShopifyHmac(queryParams, clientSecret)) {
      log.error('Invalid HMAC signature');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_invalid_hmac', baseUrl));
    }

    // Exchange code for an offline access token (no expiry, no associated user)
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: getShopifyClientId(),
        client_secret: clientSecret,
        code
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log.error('Failed to exchange OAuth code:', errorText);
      return NextResponse.redirect(new URL('/dashboard?error=oauth_token_exchange', baseUrl));
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      scope: string;
    };
    log.info(`Offline token obtained for ${shop}`);

    // Fetch the store's primary location so inventory can be set without any
    // env configuration. This also proves the token works.
    const shopResponse = await fetch(
      `https://${shop}/admin/api/${getShopifyApiVersion()}/shop.json`,
      { headers: { 'X-Shopify-Access-Token': tokenData.access_token } }
    );

    if (!shopResponse.ok) {
      const errorText = await shopResponse.text();
      log.error('Failed to fetch shop info after OAuth:', errorText);
      return NextResponse.redirect(new URL('/dashboard?error=oauth_location_fetch', baseUrl));
    }

    const shopData = await shopResponse.json() as { shop: { primary_location_id: number } };
    log.debug(`shop.json fetched for ${shop}`);
    const locationId = shopData.shop?.primary_location_id;
    if (!locationId) {
      log.error('Shop info missing primary_location_id');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_location_fetch', baseUrl));
    }

    // A shop can be actively connected by only one tenant
    if (isShopConnectedByOtherTenant(shop, user.tenant_id)) {
      log.error(`Shop ${shop} is already connected by another tenant`);
      return NextResponse.redirect(new URL('/dashboard?error=oauth_shop_taken', baseUrl));
    }

    try {
      saveShopifyConnection(user.tenant_id, {
        shop,
        access_token: tokenData.access_token,
        scope: tokenData.scope,
        location_id: String(locationId),
        connected_by_user_id: userId
      });
    } catch (error: any) {
      // Backstop for the partial unique index racing the check above
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return NextResponse.redirect(new URL('/dashboard?error=oauth_shop_taken', baseUrl));
      }
      throw error;
    }

    log.info(`Shopify store ${shop} connected by user ${userId} (tenant ${user.tenant_id})`);

    // Clear OAuth cookies and redirect to dashboard
    const response = NextResponse.redirect(new URL('/dashboard?shopify=connected', baseUrl));

    response.cookies.delete('shopify_oauth_state');
    response.cookies.delete('shopify_shop');
    response.cookies.delete('shopify_user_id');

    return response;
  } catch (error: any) {
    log.error('Shopify OAuth callback error:', error);
    return NextResponse.redirect(new URL('/dashboard?error=oauth_error', baseUrl));
  }
}
