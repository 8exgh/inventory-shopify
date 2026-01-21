# Shopify Auth Migration: Legacy Custom App → Online Access Tokens (January 2026)

## Context

This Next.js app currently uses **legacy Shopify custom app authentication** — a permanent Admin API access token that was generated directly in the Shopify admin under Settings → Apps → Develop apps.

As of January 1, 2026, Shopify deprecated the creation of new legacy custom apps. The app needs to migrate to the modern authentication approach.

## Current State (Legacy)

- App has a permanent access token stored (likely in env vars or config)
- Token was generated once in Shopify admin and never expires
- App makes API calls directly with this token in the `X-Shopify-Access-Token` header
- Scopes used: `read_products`, `write_products`, `write_files`, `read_files`, `read_locations`, `write_inventory`, `read_inventory`

## Target State (Online Access Tokens via Authorization Code Grant)

We want **Online Access Tokens** — short-lived, session-based tokens that:
- Require the user to authenticate via Shopify OAuth each session
- Expire after ~24 hours of inactivity
- Provide better security since no permanent credentials are stored on the server

### Why Online Tokens (not Offline)

The app's use case is:
1. User opens app
2. User creates 1-of-1 inventory variants
3. User finishes and closes app
4. Token can safely expire

There's no need for background jobs or persistent access. Online tokens match this usage pattern and minimize risk if the hosting environment is compromised.

---

## Technical Implementation

### Step 1: App Setup in Shopify Dev Dashboard

The store owner needs to do this once:

1. Go to https://dev.shopify.com/dashboard
2. Click "Create app" → "Start from Dev Dashboard"
3. Name the app
4. Create a version with these scopes:
    - `read_products`
    - `write_products`
    - `write_files`
    - `read_files`
    - `read_locations`
    - `write_inventory`
    - `read_inventory`
5. Set the App URL to: `https://{your-domain}/`
6. Set the Redirect URI to: `https://{your-domain}/api/auth/callback`
7. Release the version
8. Install the app on the store
9. Note the **Client ID** and **Client Secret** from Settings page

### Step 2: Environment Variables

The app needs these env vars (Client Secret must be kept secure):

```
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
SHOPIFY_SCOPES=read_products,write_products,write_files,read_files,read_locations,write_inventory,read_inventory
SHOPIFY_REDIRECT_URI=https://{your-domain}/api/auth/callback
```

### Step 3: OAuth Flow Implementation

#### 3a. Login/Auth Initiation Endpoint

Create an endpoint that redirects to Shopify's authorization page.

**Route:** `GET /api/auth/login`

```typescript
// Example: /app/api/auth/login/route.ts (Next.js App Router)
// or /pages/api/auth/login.ts (Pages Router)

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop');
  
  if (!shop) {
    return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
  }

  // Generate a random state/nonce for CSRF protection
  const state = crypto.randomUUID();
  
  // Store state in a secure HTTP-only cookie for verification later
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', process.env.SHOPIFY_CLIENT_ID!);
  authUrl.searchParams.set('scope', process.env.SHOPIFY_SCOPES!);
  authUrl.searchParams.set('redirect_uri', process.env.SHOPIFY_REDIRECT_URI!);
  authUrl.searchParams.set('state', state);
  
  // THIS IS THE KEY PART - request online/per-user token
  authUrl.searchParams.set('grant_options[]', 'per-user');

  const response = NextResponse.redirect(authUrl.toString());
  
  // Set state cookie for CSRF verification (secure, httpOnly, sameSite)
  response.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  
  // Also store the shop for the callback
  response.cookies.set('shopify_shop', shop, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
```

#### 3b. OAuth Callback Endpoint

Handle Shopify's redirect and exchange the code for an access token.

**Route:** `GET /api/auth/callback`

```typescript
// Example: /app/api/auth/callback/route.ts (Next.js App Router)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const shop = searchParams.get('shop');
  const hmac = searchParams.get('hmac');
  
  // Retrieve stored state from cookie
  const storedState = request.cookies.get('shopify_oauth_state')?.value;
  const storedShop = request.cookies.get('shopify_shop')?.value;

  // 1. Verify state matches (CSRF protection)
  if (!state || state !== storedState) {
    return NextResponse.json({ error: 'State mismatch' }, { status: 403 });
  }

  // 2. Verify HMAC signature
  if (!verifyHmac(searchParams, process.env.SHOPIFY_CLIENT_SECRET!)) {
    return NextResponse.json({ error: 'HMAC validation failed' }, { status: 403 });
  }

  // 3. Exchange authorization code for access token
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code: code,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    return NextResponse.json({ error: 'Token exchange failed', details: error }, { status: 500 });
  }

  const tokenData = await tokenResponse.json();
  
  // tokenData contains:
  // {
  //   "access_token": "shpua_xxxxx",  // Note: online tokens start with shpua_
  //   "scope": "read_products,write_products,...",
  //   "expires_in": 86399,  // seconds until expiry (~24 hours)
  //   "associated_user_scope": "...",
  //   "associated_user": {
  //     "id": 123456789,
  //     "first_name": "John",
  //     "last_name": "Doe",
  //     "email": "john@example.com",
  //     ...
  //   }
  // }

  // 4. Store token in session (use secure session management)
  // Options: encrypted cookie, server-side session store, etc.
  
  const response = NextResponse.redirect(new URL('/', request.url));
  
  // Store session data - this is a simplified example
  // In production, use proper session management (e.g., iron-session, next-auth custom provider)
  response.cookies.set('shopify_session', JSON.stringify({
    shop: shop,
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
    user: tokenData.associated_user,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: tokenData.expires_in,
    path: '/',
  });

  // Clear OAuth state cookies
  response.cookies.delete('shopify_oauth_state');
  response.cookies.delete('shopify_shop');

  return response;
}

// HMAC verification helper
function verifyHmac(searchParams: URLSearchParams, secret: string): boolean {
  const hmac = searchParams.get('hmac');
  if (!hmac) return false;

  // Create a copy of params without hmac
  const params = new URLSearchParams(searchParams);
  params.delete('hmac');
  
  // Sort and create query string
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  // Calculate HMAC
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(calculatedHmac)
  );
}
```

#### 3c. Session/Auth Check Middleware or Helper

Create a helper to check if the user has a valid session.

```typescript
// Example: /lib/shopify-session.ts

import { cookies } from 'next/headers';

export interface ShopifySession {
  shop: string;
  accessToken: string;
  expiresAt: number;
  user: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export async function getShopifySession(): Promise<ShopifySession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('shopify_session');
  
  if (!sessionCookie) {
    return null;
  }

  try {
    const session: ShopifySession = JSON.parse(sessionCookie.value);
    
    // Check if token is expired (with 5 minute buffer)
    if (Date.now() > session.expiresAt - 300000) {
      return null; // Session expired, user needs to re-auth
    }
    
    return session;
  } catch {
    return null;
  }
}

export async function requireShopifySession(): Promise<ShopifySession> {
  const session = await getShopifySession();
  if (!session) {
    throw new Error('No valid session');
  }
  return session;
}
```

#### 3d. Making Authenticated API Calls

```typescript
// Example: /lib/shopify-api.ts

import { ShopifySession } from './shopify-session';

export async function shopifyFetch(
  session: ShopifySession,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://${session.shop}/admin/api/2024-01/${endpoint}`;
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken,
      ...options.headers,
    },
  });
}

// GraphQL helper
export async function shopifyGraphQL(
  session: ShopifySession,
  query: string,
  variables?: Record<string, any>
): Promise<any> {
  const response = await fetch(
    `https://${session.shop}/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  return response.json();
}
```

### Step 4: UI Flow

#### Login Page / Entry Point

```tsx
// Example: /app/page.tsx or landing component

'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [shop, setShop] = useState('');

  const handleLogin = () => {
    // Normalize shop domain
    let shopDomain = shop.trim();
    if (!shopDomain.includes('.')) {
      shopDomain = `${shopDomain}.myshopify.com`;
    }
    
    // Redirect to auth initiation
    window.location.href = `/api/auth/login?shop=${encodeURIComponent(shopDomain)}`;
  };

  return (
    <div>
      <h1>Connect Your Shopify Store</h1>
      <input
        type="text"
        placeholder="your-store.myshopify.com"
        value={shop}
        onChange={(e) => setShop(e.target.value)}
      />
      <button onClick={handleLogin}>
        Connect to Shopify
      </button>
    </div>
  );
}
```

#### Protected Pages

```tsx
// Example: /app/dashboard/page.tsx

import { redirect } from 'next/navigation';
import { getShopifySession } from '@/lib/shopify-session';

export default async function DashboardPage() {
  const session = await getShopifySession();
  
  if (!session) {
    // No valid session, redirect to login
    redirect('/');
  }

  return (
    <div>
      <p>Connected to: {session.shop}</p>
      <p>Logged in as: {session.user.email}</p>
      {/* Your inventory management UI */}
    </div>
  );
}
```

---

## Key Differences from Legacy Auth

| Aspect | Legacy | New (Online Tokens) |
|--------|--------|---------------------|
| Token source | Copied from Shopify admin | OAuth flow at runtime |
| Token lifespan | Permanent | ~24 hours |
| Stored credential | Access token | Client ID + Secret (server-side only) |
| User experience | None (pre-configured) | Login redirect each session |
| Token prefix | `shpat_` | `shpua_` (online/user-associated) |

## Security Notes

1. **Client Secret** must never be exposed to the client/browser
2. **Access tokens** should be stored in httpOnly cookies or server-side session store
3. **HMAC validation** is required on the callback to verify the request came from Shopify
4. **State parameter** prevents CSRF attacks during OAuth flow
5. Consider encrypting session cookies (e.g., using `iron-session`)

## API Version Note

Use a recent stable API version. As of January 2026, `2024-01` or `2024-10` are safe choices. Check https://shopify.dev/docs/api/usage/versioning for the current stable versions.

## Migration Checklist

- [ ] Store owner creates app in Dev Dashboard with required scopes
- [ ] Store owner installs app on their store
- [ ] Get Client ID and Client Secret from Dev Dashboard
- [ ] Add environment variables to app
- [ ] Implement `/api/auth/login` endpoint
- [ ] Implement `/api/auth/callback` endpoint
- [ ] Implement session management helpers
- [ ] Update all Shopify API calls to use session token
- [ ] Add login UI for shop entry
- [ ] Protect routes that require authentication
- [ ] Remove old legacy token from env/config
- [ ] Test full flow: login → use app → session expires → re-login

## Testing the Flow

1. Clear all cookies
2. Go to your app's URL
3. Enter shop domain and click connect
4. Should redirect to Shopify login (if not already logged in)
5. Should show permission grant screen (first time only)
6. Should redirect back to your app with active session
7. Verify API calls work
8. Wait for expiry (or manually delete session cookie) and verify re-auth is required