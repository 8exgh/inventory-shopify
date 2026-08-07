import { getSystemDb } from '@/lib/db/system';
import { getShopifyConnection, ShopifyConnection } from '@/lib/db/shopify-connection';
import { shopifyGraphql, fromGid } from '@/lib/shopify/graphql';
import { getLogger } from '@/lib/logger';

const log = getLogger('billing/subscription');

// Subscription state via Shopify App Pricing: Shopify hosts plan selection
// and charging; the app only needs to know whether the shop currently has
// an active subscription (which includes the 14-day trial period).
//
// Status is read from the Partner API and cached on the connection row.
// Design choices:
// - Billing disabled entirely when SHOPIFY_PARTNER_API_TOKEN is unset
//   (development / pre-enrollment) - everything reads as subscribed.
// - Fail-open on Partner API errors so an outage never locks out a paying
//   merchant; the cache keeps normal traffic off the Partner API.
// NOTE: the Partner API activeSubscription schema should be re-verified on
// the first live check after App Pricing enrollment.

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface SubscriptionStatus {
  subscribed: boolean;
  status: 'active' | 'none' | 'unenforced';
  trialEndsAt: string | null;
}

function billingEnforced(): boolean {
  return !!process.env.SHOPIFY_PARTNER_API_TOKEN;
}

export function pricingPlansUrl(shop: string): string {
  const storeHandle = shop.replace('.myshopify.com', '');
  const appHandle = process.env.SHOPIFY_APP_HANDLE || 'disc-golf-inventory';
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

async function fetchShopNumericId(connection: ShopifyConnection): Promise<string> {
  const data = await shopifyGraphql(connection.shop, connection.access_token, `
    query ShopId { shop { id } }
  `);
  return fromGid(data.shop.id);
}

async function queryPartnerApi(shopNumericId: string): Promise<{ active: boolean; trialEndsAt: string | null }> {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const appId = process.env.SHOPIFY_PARTNER_APP_ID;
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN!;

  const response = await fetch(`https://partners.shopify.com/${orgId}/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query ActiveSubscription($appId: ID!, $shopId: ID!) {
          app(id: $appId) {
            activeSubscription(shopId: $shopId) {
              trialEndsAt
            }
          }
        }
      `,
      variables: {
        appId: `gid://partners/App/${appId}`,
        shopId: `gid://partners/Shop/${shopNumericId}`
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Partner API ${response.status}: ${await response.text()}`);
  }

  const body = await response.json() as any;
  if (body.errors?.length) {
    throw new Error(`Partner API errors: ${body.errors.map((e: any) => e.message).join('; ')}`);
  }

  const subscription = body.data?.app?.activeSubscription;
  return {
    active: !!subscription,
    trialEndsAt: subscription?.trialEndsAt ?? null
  };
}

export async function getSubscriptionStatus(tenantId: string, forceRefresh = false): Promise<SubscriptionStatus> {
  if (!billingEnforced()) {
    return { subscribed: true, status: 'unenforced', trialEndsAt: null };
  }

  const connection = getShopifyConnection(tenantId);
  if (!connection) {
    return { subscribed: false, status: 'none', trialEndsAt: null };
  }

  const db = getSystemDb();
  const cached = db.prepare(
    'SELECT subscription_status, trial_ends_at, subscription_checked_at FROM shopify_connections WHERE tenant_id = ?'
  ).get(tenantId) as { subscription_status: string | null; trial_ends_at: string | null; subscription_checked_at: number | null } | undefined;

  const fresh = cached?.subscription_checked_at
    && Date.now() - cached.subscription_checked_at < CACHE_TTL_MS;

  if (fresh && !forceRefresh && cached?.subscription_status) {
    return {
      subscribed: cached.subscription_status === 'active',
      status: cached.subscription_status as SubscriptionStatus['status'],
      trialEndsAt: cached.trial_ends_at
    };
  }

  try {
    let shopNumericId = (db.prepare(
      'SELECT shop_numeric_id FROM shopify_connections WHERE tenant_id = ?'
    ).get(tenantId) as { shop_numeric_id: string | null } | undefined)?.shop_numeric_id;

    if (!shopNumericId) {
      shopNumericId = await fetchShopNumericId(connection);
      db.prepare('UPDATE shopify_connections SET shop_numeric_id = ? WHERE tenant_id = ?')
        .run(shopNumericId, tenantId);
    }

    const result = await queryPartnerApi(shopNumericId);
    const status = result.active ? 'active' : 'none';

    db.prepare(`
      UPDATE shopify_connections
      SET subscription_status = ?, trial_ends_at = ?, subscription_checked_at = ?
      WHERE tenant_id = ?
    `).run(status, result.trialEndsAt, Date.now(), tenantId);

    return { subscribed: result.active, status, trialEndsAt: result.trialEndsAt };
  } catch (error: any) {
    log.warn(`Subscription check failed for tenant ${tenantId} - failing open`, error);
    return {
      subscribed: true,
      status: (cached?.subscription_status as SubscriptionStatus['status']) || 'unenforced',
      trialEndsAt: cached?.trial_ends_at ?? null
    };
  }
}
