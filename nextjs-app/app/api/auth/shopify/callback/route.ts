import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyHmac } from '@/lib/shopify/hmac';
import { handleStoreShopifyToken } from '@/lib/commands/shopify-token-commands';

function getShopifyClientId(): string {
  return process.env.SHOPIFY_CLIENT_ID || '';
}

function getShopifyClientSecret(): string {
  return process.env.SHOPIFY_CLIENT_SECRET || '';
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

    // Exchange code for access token
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
      expires_in?: number;
      associated_user_scope?: string;
      associated_user?: {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
        account_owner: boolean;
      };
    };

    // Calculate expiration time
    // Online tokens typically expire in 24 hours (86400 seconds)
    // If expires_in is not provided, default to 24 hours
    const expiresInMs = (tokenData.expires_in || 86400) * 1000;
    const expiresAt = Date.now() + expiresInMs;

    // Store token as event in user's database
    handleStoreShopifyToken({
      userId,
      accessToken: tokenData.access_token,
      expiresAt,
      scope: tokenData.scope,
      shop
    });

    console.log(`Shopify token stored for user ${userId}, expires at ${new Date(expiresAt).toISOString()}`);

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
