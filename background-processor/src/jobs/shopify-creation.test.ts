import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createVariant,
  buildVariantInput,
  makeDiscDescriptorUnique,
  parseGrams,
  buildSku,
  NewVariantSpec
} from './shopify-creation.js';

// Mock environment variables
process.env.SHOPIFY_API_VERSION = '2025-10';

describe('buildVariantInput', () => {
  const baseSpec: NewVariantSpec = {
    optionValuesInOrder: ['Blue', '168g pink rim silver foil'],
    price: '29.99',
    sku: 'destroyer-halo-star-168-blue',
    barcode: 'aggregate-uuid-1',
    grams: 168,
    mediaId: 'gid://shopify/MediaImage/111',
    locationId: '12345678'
  };

  it('maps positional option values onto the product option names', () => {
    const input = buildVariantInput(baseSpec, ['Color', 'Weight']);
    expect(input.optionValues).toEqual([
      { optionName: 'Color', name: 'Blue' },
      { optionName: 'Weight', name: '168g pink rim silver foil' }
    ]);
  });

  it('sets price, barcode, sku, grams and inventory of 1 at the location', () => {
    const input = buildVariantInput(baseSpec, ['Color', 'Weight']) as any;
    expect(input.price).toBe('29.99');
    expect(input.barcode).toBe('aggregate-uuid-1');
    expect(input.inventoryPolicy).toBe('DENY');
    expect(input.inventoryItem).toEqual({
      tracked: true,
      sku: 'destroyer-halo-star-168-blue',
      measurement: { weight: { unit: 'GRAMS', value: 168 } }
    });
    expect(input.inventoryQuantities).toEqual([
      { availableQuantity: 1, locationId: 'gid://shopify/Location/12345678' }
    ]);
    expect(input.mediaId).toBe('gid://shopify/MediaImage/111');
  });

  it('omits optional fields when absent and supports 3-option products', () => {
    const input = buildVariantInput(
      {
        optionValuesInOrder: ['Blue', 'Halo Star', '172g blue rim foil'],
        mediaId: 'gid://shopify/MediaImage/1',
        locationId: 'gid://shopify/Location/9'
      },
      ['Colour', 'Plastic', 'Weight']
    ) as any;

    expect(input.optionValues).toEqual([
      { optionName: 'Colour', name: 'Blue' },
      { optionName: 'Plastic', name: 'Halo Star' },
      { optionName: 'Weight', name: '172g blue rim foil' }
    ]);
    expect(input).not.toHaveProperty('price');
    expect(input).not.toHaveProperty('barcode');
    expect(input.inventoryItem).toEqual({ tracked: true });
    // Already-gid location passes through unchanged
    expect(input.inventoryQuantities[0].locationId).toBe('gid://shopify/Location/9');
  });
});

describe('createVariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Without this the test issues a real request to the shop domain below.
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('sends one productVariantsBulkCreate mutation and returns the variant gid', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          productVariantsBulkCreate: {
            productVariants: [{ id: 'gid://shopify/ProductVariant/67890' }],
            userErrors: []
          }
        }
      })
    });

    const result = await createVariant(
      '12345',
      {
        optionValuesInOrder: ['Blue', '168g'],
        price: '29.99',
        mediaId: 'gid://shopify/MediaImage/1',
        locationId: '777'
      },
      ['Color', 'Weight'],
      'shpat_test_token',
      'test-store.myshopify.com'
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://test-store.myshopify.com/admin/api/2025-10/graphql.json');
    expect(init.headers['X-Shopify-Access-Token']).toBe('shpat_test_token');

    const body = JSON.parse(init.body);
    expect(body.query).toContain('productVariantsBulkCreate');
    expect(body.variables.productId).toBe('gid://shopify/Product/12345');
    expect(body.variables.variants).toHaveLength(1);
    expect(body.variables.variants[0].optionValues).toEqual([
      { optionName: 'Color', name: 'Blue' },
      { optionName: 'Weight', name: '168g' }
    ]);
    expect(body.variables.variants[0].inventoryQuantities).toEqual([
      { availableQuantity: 1, locationId: 'gid://shopify/Location/777' }
    ]);

    expect(result).toBe('gid://shopify/ProductVariant/67890');
  });

  it('throws on userErrors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          productVariantsBulkCreate: {
            productVariants: [],
            userErrors: [{ field: ['variants', '0'], message: 'Option value taken' }]
          }
        }
      })
    });

    await expect(createVariant(
      '12345',
      { optionValuesInOrder: ['Blue', '168g'], mediaId: 'm', locationId: '1' },
      ['Color', 'Weight'],
      'token',
      'test-store.myshopify.com'
    )).rejects.toThrow('Option value taken');
  });
});

describe('makeDiscDescriptorUnique', () => {
  it('returns the base value when no variant uses it', () => {
    const variants = [{ option2: '170G' }];
    expect(makeDiscDescriptorUnique('168G', variants, 'option2')).toEqual({ value: '168G', counter: 1 });
  });

  it('appends a numeric suffix on collision', () => {
    const variants = [{ option2: '168G' }, { option2: '168G 2' }];
    expect(makeDiscDescriptorUnique('168G', variants, 'option2')).toEqual({ value: '168G 3', counter: 3 });
  });

  it('checks option3 for 3-option products', () => {
    const variants = [{ option2: 'Halo Star', option3: '172g blue rim' }];
    expect(makeDiscDescriptorUnique('172g blue rim', variants, 'option3')).toEqual({ value: '172g blue rim 2', counter: 2 });
  });
});

describe('parseGrams', () => {
  it('parses the leading weight from a free-text weight string', () => {
    expect(parseGrams('168G RED PRISM Foil')).toBe(168);
    expect(parseGrams('75g mini')).toBe(75);
  });

  it('returns undefined when no leading number exists', () => {
    expect(parseGrams('RED PRISM Foil')).toBeUndefined();
    expect(parseGrams('')).toBeUndefined();
  });
});

describe('buildSku', () => {
  it('builds a slugged sku from title, grams and color', () => {
    expect(buildSku('Destroyer (Halo Star)', 172, 'Blue', [])).toBe('destroyer-halo-star-172-blue');
  });

  it('handles missing grams and multi-word colors', () => {
    expect(buildSku('Zone (ESP)', undefined, 'Multi-Color', [])).toBe('zone-esp-na-multi-color');
  });

  it('uniquifies against existing skus', () => {
    const variants = [{ sku: 'destroyer-halo-star-172-blue' }, { sku: 'destroyer-halo-star-172-blue-2' }];
    expect(buildSku('Destroyer (Halo Star)', 172, 'Blue', variants)).toBe('destroyer-halo-star-172-blue-3');
  });
});
