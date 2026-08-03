import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/shopify/hmac';
import { getUserById } from '@/lib/db/system';
import { saveShopifyConnection } from '@/lib/db/shopify-connection';

function getShopifyClientId(): string {
  return process.env.SHOPIFY_CLIENT_ID || '';
}

function getShopifyClientSecret(): string {
  return process.env.SHOPIFY_CLIENT_SECRET || '';
}

function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-10';
}

export async function GET(request: NextRequest) {
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
      console.error('Missing OAuth callback parameters');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_missing_params', request.url));
    }

    // Validate state (CSRF protection)
    if (state !== savedState) {
      console.error('OAuth state mismatch');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_state_mismatch', request.url));
    }

    // Validate shop matches
    if (shop !== savedShop) {
      console.error('OAuth shop mismatch');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_shop_mismatch', request.url));
    }

    // Validate user ID exists
    if (!userId) {
      console.error('Missing user ID in OAuth callback');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_no_user', request.url));
    }

    // Only an admin may complete the connection (the cookie alone proves
    // nothing about the role)
    const user = getUserById(userId);
    if (!user || user.role !== 'admin') {
      console.error('OAuth callback from non-admin user');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_not_admin', request.url));
    }

    // Verify HMAC signature
    const clientSecret = getShopifyClientSecret();
    const queryParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    if (!verifyShopifyHmac(queryParams, clientSecret)) {
      console.error('Invalid HMAC signature');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_invalid_hmac', request.url));
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
      console.error('Failed to exchange OAuth code:', errorText);
      return NextResponse.redirect(new URL('/dashboard?error=oauth_token_exchange', request.url));
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      scope: string;
    };

    // Fetch the store's primary location so inventory can be set without any
    // env configuration. This also proves the token works.
    const shopResponse = await fetch(
      `https://${shop}/admin/api/${getShopifyApiVersion()}/shop.json`,
      { headers: { 'X-Shopify-Access-Token': tokenData.access_token } }
    );

    if (!shopResponse.ok) {
      const errorText = await shopResponse.text();
      console.error('Failed to fetch shop info after OAuth:', errorText);
      return NextResponse.redirect(new URL('/dashboard?error=oauth_location_fetch', request.url));
    }

    const shopData = await shopResponse.json() as { shop: { primary_location_id: number } };
    const locationId = shopData.shop?.primary_location_id;
    if (!locationId) {
      console.error('Shop info missing primary_location_id');
      return NextResponse.redirect(new URL('/dashboard?error=oauth_location_fetch', request.url));
    }

    saveShopifyConnection({
      shop,
      access_token: tokenData.access_token,
      scope: tokenData.scope,
      location_id: String(locationId),
      connected_by_user_id: userId
    });

    console.log(`Shopify store ${shop} connected by user ${userId}`);

    // Clear OAuth cookies and redirect to dashboard
    const response = NextResponse.redirect(new URL('/dashboard?shopify=connected', request.url));

    response.cookies.delete('shopify_oauth_state');
    response.cookies.delete('shopify_shop');
    response.cookies.delete('shopify_user_id');

    return response;
  } catch (error: any) {
    console.error('Shopify OAuth callback error:', error);
    return NextResponse.redirect(new URL('/dashboard?error=oauth_error', request.url));
  }
}
