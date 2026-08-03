import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { buildConnectionMap, connectionForTenant, reportReconnected } from './connection-registry.js';
import { ShopifyConnection } from './api-client.js';

const CONN_A: ShopifyConnection = {
  tenantId: 'tenant-a',
  accessToken: 'token-a',
  shop: 'a.myshopify.com',
  locationId: '1'
};

describe('connection-registry', () => {
  let logSpy: any;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    // Clear the latch between tests by "reconnecting" every warned tenant
    reportReconnected(buildConnectionMap([
      CONN_A,
      { ...CONN_A, tenantId: 'tenant-b' },
      { ...CONN_A, tenantId: 'tenant-c' }
    ]));
  });

  it('returns the connection for a connected tenant', () => {
    const map = buildConnectionMap([CONN_A]);
    expect(connectionForTenant(map, 'tenant-a', 'Test Job')).toBe(CONN_A);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('returns null for an unconnected tenant and logs only once', () => {
    const map = buildConnectionMap([CONN_A]);

    expect(connectionForTenant(map, 'tenant-b', 'Test Job')).toBeNull();
    expect(connectionForTenant(map, 'tenant-b', 'Test Job')).toBeNull();
    expect(connectionForTenant(map, 'tenant-b', 'Test Job')).toBeNull();

    const skipLogs = logSpy.mock.calls.filter((c: any[]) =>
      String(c[0]).includes('tenant-b') && String(c[0]).includes('skipping')
    );
    expect(skipLogs).toHaveLength(1);
  });

  it('clears the latch and logs resumption when the tenant reconnects', () => {
    // Latch tenant-c
    expect(connectionForTenant(buildConnectionMap([]), 'tenant-c', 'Test Job')).toBeNull();

    const reconnected = buildConnectionMap([{ ...CONN_A, tenantId: 'tenant-c' }]);
    reportReconnected(reconnected);

    const resumeLogs = logSpy.mock.calls.filter((c: any[]) =>
      String(c[0]).includes('tenant-c') && String(c[0]).includes('resuming')
    );
    expect(resumeLogs).toHaveLength(1);

    // Latch is cleared: disconnecting again warns again (once)
    expect(connectionForTenant(buildConnectionMap([]), 'tenant-c', 'Test Job')).toBeNull();
    const skipLogs = logSpy.mock.calls.filter((c: any[]) =>
      String(c[0]).includes('tenant-c') && String(c[0]).includes('skipping')
    );
    expect(skipLogs).toHaveLength(2);
  });
});
