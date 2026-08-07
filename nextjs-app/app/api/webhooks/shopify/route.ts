import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSystemDb } from '@/lib/db/system';
import { markShopDisconnected, getShopifyConnectionByShop } from '@/lib/db/shopify-connection';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/webhooks/shopify');

// Mandatory App Store webhook endpoint (compliance topics + app/uninstalled).
// HMAC is computed over the RAW request body; an invalid HMAC must return
// 401 and a valid delivery must return 2xx (reviewers verify both).

function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) {
    return false;
  }
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Shopify retries deliveries; process each webhook id once
function isDuplicate(webhookId: string): boolean {
  const db = getSystemDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      webhook_id TEXT PRIMARY KEY,
      received_at INTEGER NOT NULL
    );
  `);
  const existing = db.prepare('SELECT 1 FROM processed_webhooks WHERE webhook_id = ?').get(webhookId);
  if (existing) {
    return true;
  }
  db.prepare('INSERT INTO processed_webhooks (webhook_id, received_at) VALUES (?, ?)').run(webhookId, Date.now());
  // Opportunistic prune of entries older than 7 days
  db.prepare('DELETE FROM processed_webhooks WHERE received_at < ?').run(Date.now() - 7 * 24 * 3600 * 1000);
  return false;
}

function handleUninstalled(shop: string): void {
  const changed = markShopDisconnected(shop);
  log.info(`app/uninstalled for ${shop}: connection ${changed ? 'marked disconnected' : 'not found'}`);
}

// Arrives ~48h after uninstall: permanently delete the shop's data
function handleShopRedact(shop: string): void {
  const connection = getShopifyConnectionByShop(shop);
  if (!connection) {
    log.info(`shop/redact for ${shop}: no data held`);
    return;
  }

  const tenantId = connection.tenant_id;
  const db = getSystemDb();
  db.transaction(() => {
    db.prepare('DELETE FROM shopify_connections WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM feedback WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
  })();

  const tenantDbPath = path.join(process.env.TENANT_DATABASES_PATH || './data/tenants', `${tenantId}.db`);
  try {
    fs.rmSync(tenantDbPath, { force: true });
  } catch (error: any) {
    log.error(`shop/redact: failed to remove tenant db ${tenantDbPath}`, error);
  }

  log.info(`shop/redact for ${shop}: tenant ${tenantId} data deleted`);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = Buffer.from(await request.arrayBuffer());

    if (!verifyWebhookHmac(rawBody, request.headers.get('X-Shopify-Hmac-Sha256'))) {
      log.warn('Webhook rejected: invalid HMAC');
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
    }

    const topic = request.headers.get('X-Shopify-Topic') || '';
    const shop = (request.headers.get('X-Shopify-Shop-Domain') || '').toLowerCase();
    const webhookId = request.headers.get('X-Shopify-Webhook-Id') || '';

    if (webhookId && isDuplicate(webhookId)) {
      log.debug(`Duplicate webhook ${webhookId} (${topic}) ignored`);
      return NextResponse.json({ success: true });
    }

    log.info(`Webhook ${topic} for ${shop}`);

    switch (topic) {
      case 'app/uninstalled':
        handleUninstalled(shop);
        break;
      case 'shop/redact':
        handleShopRedact(shop);
        break;
      case 'customers/data_request':
      case 'customers/redact':
        // This app stores no customer data (products/inventory only);
        // acknowledging is the complete, documented response.
        log.info(`${topic} for ${shop}: no customer data held - acknowledged`);
        break;
      default:
        log.warn(`Unhandled webhook topic ${topic}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Webhook processing error:', error);
    // Still 200-series? No - a processing failure should let Shopify retry
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
