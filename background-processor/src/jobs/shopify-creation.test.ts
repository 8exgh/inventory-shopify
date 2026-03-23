import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createVariant } from './shopify-creation.js';

// Mock environment variables
process.env.SHOPIFY_SHOP_DOMAIN = 'vbxsb1-cr.myshopify.com';
process.env.SHOPIFY_ACCESS_TOKEN = 'TODO';
process.env.SHOPIFY_API_VERSION = '2026-01';
process.env.SHOPIFY_LOCATION_ID = '12345678';


describe('createVariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a Shopify variant via GraphQL and return the variant ID', async () => {
    // Arrange
    const productId = '12345';
    const colorName = 'Blue';
    const weight = '168G';
    const mediaId = 'gid://shopify/MediaImage/98765';

    // Mock global.fetch for the GraphQL call
    const mockFetch = jest.fn<typeof global.fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          productVariantsBulkCreate: {
            productVariants: [{
              id: 'gid://shopify/ProductVariant/67890',
              title: 'Blue / 168G',
              selectedOptions: [
                { name: 'Color', value: 'Blue' },
                { name: 'Weight', value: '168G' }
              ]
            }],
            userErrors: []
          }
        }
      })
    } as any);
    global.fetch = mockFetch;

    // Act
    const result = await createVariant(productId, colorName, weight, mediaId);

    // Assert
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://vbxsb1-cr.myshopify.com/admin/api/2026-01/graphql.json',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': 'TODO',
          'Content-Type': 'application/json'
        },
      })
    );

    // Verify the GraphQL body contains the right mutation variables
    const callBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(callBody.variables.productId).toBe('gid://shopify/Product/12345');
    expect(callBody.variables.variants[0].optionValues).toEqual([
      { optionName: 'Color', name: 'Blue' },
      { optionName: 'Weight', name: '168G' }
    ]);
    expect(callBody.variables.variants[0].inventoryPolicy).toBe('DENY');
    expect(callBody.variables.variants[0].inventoryItem).toEqual({ tracked: true });
    expect(callBody.variables.variants[0].mediaId).toBe('gid://shopify/MediaImage/98765');
    expect(callBody.variables.variants[0].inventoryQuantities).toEqual([{
      locationId: 'gid://shopify/Location/12345678',
      name: 'available',
      quantity: 1
    }]);

    expect(result).toBe('67890');
  });
});
