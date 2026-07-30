import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { generateOAuthState } from '@/lib/shopify/hmac';

function getShopifyClientId(): string {
  return process.env.SHOPIFY_CLIENT_ID || '';
}

function getShopifyShopDomain(): string {
  return process.env.SHOPIFY_SHOP_DOMAIN || '';
}

function getShopifyScopes(): string {
  return process.env.SHOPIFY_SCOPES || 'read_products,write_products,write_files,read_files,read_locations,write_inventory,read_inventory';
}

function getShopifyRedirectUri(): string {
  return process.env.SHOPIFY_REDIRECT_URI || '';
}

export async function GET(request: NextRequest) {
  try {
    // Get token from query parameter (since browser redirects can't include headers)
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing authentication token' },
        { status: 401 }
      );
    }

    // Verify the JWT token
    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const clientId = getShopifyClientId();
    const shop = getShopifyShopDomain();
    const scopes = getShopifyScopes();
    const redirectUri = getShopifyRedirectUri();

    if (!clientId || !shop || !redirectUri) {
      console.error('Missing Shopify OAuth configuration');
      return NextResponse.json(
        { error: 'Shopify OAuth not configured' },
        { status: 500 }
      );
    }

    // Generate state for CSRF protection
    const state = generateOAuthState();

    // Build authorization URL with online access token request
    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('grant_options[]', 'per-user'); // Request online access token

    // Create response with redirect
    const response = NextResponse.redirect(authUrl.toString());

    // Set cookies for state verification in callback
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 10, // 10 minutes
      path: '/'
    };

    response.cookies.set('shopify_oauth_state', state, cookieOptions);
    response.cookies.set('shopify_shop', shop, cookieOptions);
    response.cookies.set('shopify_user_id', payload.userId, cookieOptions);

    return response;
  } catch (error: any) {
    console.error('Shopify OAuth login error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
