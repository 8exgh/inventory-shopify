import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createVariant } from './shopify-creation.js';

// Mock environment variables
process.env.SHOPIFY_API_VERSION = '2025-10';
process.env.SHOPIFY_LOCATION_ID = '12345678';


describe('createVariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Without this the test issues a real request to the shop domain below.
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('should create a Shopify variant and return the variant ID', async () => {
    // Arrange: variant creation, then the inventory level call
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variant: { id: 67890, inventory_item_id: 1122334455 } })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    // Arrange
    const productId = '12345';
    const colorName = 'Blue';
    const weight = '168G';
    const imageId = '98765';
    const accessToken = 'shpca_test_token';
    const shop = 'test-store.myshopify.com';

    // Act
    const result = await createVariant(productId, colorName, weight, imageId, accessToken, shop);

    // Assert
    expect(global.fetch).toHaveBeenCalledTimes(2); // Once for variant creation, once for inventory
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-store.myshopify.com/admin/api/2025-10/products/12345/variants.json',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': 'shpca_test_token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variant: {
            option1: 'Blue',
            option2: '168G',
            inventory_management: 'shopify',
            inventory_policy: 'deny',
            image_id: '98765'
          }
        })
      })
    );

    expect(result).toBe('67890');
  });
});
