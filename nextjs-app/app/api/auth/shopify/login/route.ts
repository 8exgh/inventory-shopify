import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { generateOAuthState } from '@/lib/shopify/hmac';
import { getUserById } from '@/lib/db/system';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/auth/shopify/login');

function getShopifyClientId(): string {
  return process.env.SHOPIFY_CLIENT_ID || '';
}

function getShopifyScopes(): string {
  return process.env.SHOPIFY_SCOPES || 'read_products,write_products,write_files,read_files,read_locations,write_inventory,read_inventory';
}

function getShopifyRedirectUri(): string {
  return process.env.SHOPIFY_REDIRECT_URI || '';
}

// Anchored on both ends: the shop is user input and gets interpolated into the
// authorize redirect URL, so anything looser is an open redirect.
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export async function GET(request: NextRequest) {
  try {
    // Get token from query parameter (since browser redirects can't include headers)
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const shopInput = searchParams.get('shop');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing authentication token' },
        { status: 401 }
      );
    }

    // Verify the JWT token
    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      log.warn('OAuth start rejected: invalid token');
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Only an admin may connect the store — checked against the database so a
    // stale JWT for a demoted or deleted user can't authorize.
    const user = getUserById(payload.userId);
    if (!user || user.role !== 'admin') {
      log.warn(`OAuth start rejected: user ${payload.userId} is not an admin`);
      return NextResponse.json(
        { error: 'Only an admin can connect the Shopify store' },
        { status: 403 }
      );
    }

    const shop = (shopInput || '').trim().toLowerCase();
    if (!SHOP_DOMAIN_PATTERN.test(shop)) {
      log.warn(`OAuth start rejected: invalid shop domain (${shopInput})`);
      return NextResponse.json(
        { error: 'Invalid shop domain; expected your-store.myshopify.com' },
        { status: 400 }
      );
    }

    const clientId = getShopifyClientId();
    const scopes = getShopifyScopes();
    const redirectUri = getShopifyRedirectUri();

    if (!clientId || !redirectUri) {
      log.error('Missing Shopify OAuth configuration');
      return NextResponse.json(
        { error: 'Shopify OAuth not configured' },
        { status: 500 }
      );
    }

    log.info(`Starting OAuth for shop ${shop} (user ${payload.userId})`);

    // Generate state for CSRF protection
    const state = generateOAuthState();

    // Build authorization URL. No grant_options[] means an offline access
    // token: it never expires and is what the background processor relies on.
    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

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
    log.error('Shopify OAuth login error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
