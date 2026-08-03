import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createVariant, makeDiscDescriptorUnique, parseGrams, buildSku } from './shopify-creation.js';

// Mock environment variables
process.env.SHOPIFY_API_VERSION = '2025-10';


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

    // Act
    const result = await createVariant(
      '12345',
      {
        option1: 'Blue',
        option2: '168G',
        price: '29.99',
        sku: 'destroyer-halo-star-168-blue',
        barcode: 'aggregate-uuid-1',
        grams: 168,
        imageId: '98765'
      },
      'shpca_test_token',
      'test-store.myshopify.com',
      '12345678'
    );

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
            price: '29.99',
            sku: 'destroyer-halo-star-168-blue',
            barcode: 'aggregate-uuid-1',
            grams: 168,
            inventory_management: 'shopify',
            inventory_policy: 'deny',
            image_id: '98765'
          }
        })
      })
    );

    // The inventory call uses the location passed in, not any env var
    const inventoryBody = JSON.parse((global.fetch as any).mock.calls[1][1].body);
    expect(inventoryBody).toEqual({
      location_id: '12345678',
      inventory_item_id: '1122334455',
      available: 1
    });

    expect(result).toBe('67890');
  });

  it('should place the disc descriptor in option3 for 3-option products', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variant: { id: 111, inventory_item_id: 222 } })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await createVariant(
      '12345',
      {
        option1: 'Blue',
        option2: 'Halo Star',
        option3: '172g blue rim rainbow foil',
        imageId: '98765'
      },
      'shpca_test_token',
      'test-store.myshopify.com',
      '12345678'
    );

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.variant.option2).toBe('Halo Star');
    expect(body.variant.option3).toBe('172g blue rim rainbow foil');
    // Optional fields stay absent when not provided
    expect(body.variant).not.toHaveProperty('price');
    expect(body.variant).not.toHaveProperty('sku');
    expect(body.variant).not.toHaveProperty('grams');
    expect(body.variant).not.toHaveProperty('barcode');
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
