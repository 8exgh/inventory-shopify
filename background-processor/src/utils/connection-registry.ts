import { ShopifyConnection } from './api-client.js';

export type ConnectionMap = Map<string, ShopifyConnection>;

export function buildConnectionMap(connections: ShopifyConnection[]): ConnectionMap {
  return new Map(connections.map(c => [c.tenantId, c]));
}

// Latched per tenant so a disconnected tenant logs once, not every cycle
const warnedTenants = new Set<string>();

export function reportReconnected(connections: ConnectionMap): void {
  for (const tenantId of warnedTenants) {
    if (connections.has(tenantId)) {
      console.log(`[Job Loop] Tenant ${tenantId} connected; resuming its Shopify jobs`);
      warnedTenants.delete(tenantId);
    }
  }
}

export function connectionForTenant(
  connections: ConnectionMap,
  tenantId: string,
  jobName: string
): ShopifyConnection | null {
  const connection = connections.get(tenantId);
  if (connection) {
    return connection;
  }
  if (!warnedTenants.has(tenantId)) {
    console.log(`[${jobName}] Tenant ${tenantId} has no Shopify connection; skipping its tasks`);
    warnedTenants.add(tenantId);
  }
  return null;
}
