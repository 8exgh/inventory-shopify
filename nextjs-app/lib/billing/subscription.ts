import { getSystemDb } from '@/lib/db/system';
import { connectionWithFreshToken } from '@/lib/shopify/token';
import { shopifyGraphql } from '@/lib/shopify/graphql';
import { getLogger } from '@/lib/logger';

const log = getLogger('billing/subscription');

// Subscription state via Shopify App Pricing: Shopify hosts plan selection,
// charging, and upgrades/downgrades, so the app only needs to know whether
// the shop currently has an active subscription (the trial counts as active).
//
// Status comes from the shop's own Admin API through currentAppInstallation,
// which needs nothing beyond the offline token we already hold - no Partner
// API token, no shop id lookup. Results are cached on the connection row.
// Fail-open on API errors so an outage never locks out a paying merchant.

const CACHE_TTL_MS = 60 * 60 * 1000;
// "No subscription" is the state that blocks the merchant and the one that
// flips the moment they approve a plan, so it is only ever cached briefly -
// otherwise someone who just paid keeps seeing the plan picker.
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;

const ACTIVE_SUBSCRIPTIONS = `
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        trialDays
        createdAt
      }
    }
  }
`;

export interface SubscriptionStatus {
  subscribed: boolean;
  status: 'active' | 'none' | 'unenforced';
  trialEndsAt: string | null;
}

// Billing is only enforced once App Pricing plans exist for the app; leaving
// this unset in development treats every shop as subscribed.
function billingEnforced(): boolean {
  return process.env.SHOPIFY_BILLING_ENFORCED === 'true';
}

export function pricingPlansUrl(shop: string): string {
  const storeHandle = shop.replace('.myshopify.com', '');
  const appHandle = process.env.SHOPIFY_APP_HANDLE || 'inventory-reload';
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

function trialEnd(subscription: { trialDays?: number; createdAt?: string }): string | null {
  if (!subscription.trialDays || !subscription.createdAt) return null;
  const created = new Date(subscription.createdAt).getTime();
  if (Number.isNaN(created)) return null;
  return new Date(created + subscription.trialDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function getSubscriptionStatus(
  tenantId: string,
  forceRefresh = false
): Promise<SubscriptionStatus> {
  if (!billingEnforced()) {
    return { subscribed: true, status: 'unenforced', trialEndsAt: null };
  }

  const connection = await connectionWithFreshToken(tenantId);
  if (!connection) {
    return { subscribed: false, status: 'none', trialEndsAt: null };
  }

  const db = getSystemDb();
  const cached = db.prepare(
    'SELECT subscription_status, trial_ends_at, subscription_checked_at FROM shopify_connections WHERE tenant_id = ?'
  ).get(tenantId) as
    | { subscription_status: string | null; trial_ends_at: string | null; subscription_checked_at: number | null }
    | undefined;

  const ttl = cached?.subscription_status === 'active' ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  const fresh = cached?.subscription_checked_at
    && Date.now() - cached.subscription_checked_at < ttl;

  if (fresh && !forceRefresh && cached?.subscription_status) {
    return {
      subscribed: cached.subscription_status === 'active',
      status: cached.subscription_status as SubscriptionStatus['status'],
      trialEndsAt: cached.trial_ends_at
    };
  }

  try {
    const data = await shopifyGraphql(connection.shop, connection.access_token, ACTIVE_SUBSCRIPTIONS);
    const subscriptions: Array<{ status: string; trialDays: number; createdAt: string }> =
      data.currentAppInstallation?.activeSubscriptions || [];
    const active = subscriptions.find(s => s.status === 'ACTIVE');
    const status = active ? 'active' : 'none';
    const trialEndsAt = active ? trialEnd(active) : null;

    db.prepare(`
      UPDATE shopify_connections
      SET subscription_status = ?, trial_ends_at = ?, subscription_checked_at = ?
      WHERE tenant_id = ?
    `).run(status, trialEndsAt, Date.now(), tenantId);

    log.debug(`Subscription for ${connection.shop}: ${status}`);
    return { subscribed: !!active, status, trialEndsAt };
  } catch (error: any) {
    log.warn(`Subscription check failed for tenant ${tenantId} - failing open`, error);
    return {
      subscribed: true,
      status: (cached?.subscription_status as SubscriptionStatus['status']) || 'unenforced',
      trialEndsAt: cached?.trial_ends_at ?? null
    };
  }
}
