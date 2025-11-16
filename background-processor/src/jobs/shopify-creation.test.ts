import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createVariant } from './shopify-creation.js';

// Mock environment variables
process.env.SHOPIFY_SHOP_DOMAIN = 'vbxsb1-cr.myshopify.com';
process.env.SHOPIFY_ACCESS_TOKEN = 'TODO';
process.env.SHOPIFY_API_VERSION = '2025-10';


describe('createVariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a Shopify variant and return the variant ID', async () => {
    // Arrange
    const productId = '12345';
    const colorName = 'Blue';
    const weight = '168G';
    const imageId = '98765';

    // Act
    const result = await createVariant(productId, colorName, weight, imageId);

    // Assert
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
            inventory_quantity: 1,
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
