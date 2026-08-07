'use client';

// Client helpers for the embedded (Shopify admin) surface. App Bridge v4
// (cdn app-bridge.js) exposes window.shopify; every request carries a fresh
// session token - no cookies, no localStorage (App Store req 1.1.1).

declare global {
  interface Window {
    shopify?: {
      idToken: () => Promise<string>;
      config?: { shop?: string };
    };
  }
}

export async function sessionToken(): Promise<string> {
  if (!window.shopify?.idToken) {
    throw new Error('App Bridge not available - is this page running inside the Shopify admin?');
  }
  return window.shopify.idToken();
}

export async function embeddedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await sessionToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(path, { ...init, headers });
}

// Boot call: provisions the shop's tenant (idempotent)
export async function ensureProvisioned(): Promise<{ shop: string; tenantId: string }> {
  const response = await embeddedFetch('/api/auth/shopify/token-exchange', { method: 'POST' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Provisioning failed (${response.status})`);
  }
  return response.json();
}
