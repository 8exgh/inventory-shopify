import { shopifyGraphql, toGid, fromGid } from './graphql';

export interface ShopifyProduct {
  id: string; // numeric string, matching ids stored in the event log
  title: string;
  options: Array<{ name: string }>;
}

export class ShopifyClient {
  constructor(private accessToken: string, private shop: string) {}

  async getProducts(): Promise<ShopifyProduct[]> {
    const data = await shopifyGraphql(this.shop, this.accessToken, `
      query Products {
        products(first: 250) {
          nodes {
            id
            title
            options { name }
          }
        }
      }
    `);

    return data.products.nodes.map((p: any) => ({
      id: fromGid(p.id),
      title: p.title,
      options: p.options
    }));
  }

  // The color option is the product's first option by convention
  async getProductColors(productId: string): Promise<string[]> {
    const data = await shopifyGraphql(this.shop, this.accessToken, `
      query ProductColors($id: ID!) {
        product(id: $id) {
          options { name }
          variants(first: 250) {
            nodes { selectedOptions { name value } }
          }
        }
      }
    `, { id: toGid('Product', productId) });

    if (!data.product) {
      throw new Error(`Product ${productId} not found`);
    }

    const colorOptionName = data.product.options[0]?.name;
    const colors = new Set<string>();
    for (const variant of data.product.variants.nodes) {
      const value = variant.selectedOptions.find((o: any) => o.name === colorOptionName)?.value;
      if (value) {
        colors.add(value);
      }
    }

    return Array.from(colors).sort();
  }
}

/**
 * Factory function to create a ShopifyClient with a specific access token.
 */
export function createShopifyClient(accessToken: string, shop: string): ShopifyClient {
  return new ShopifyClient(accessToken, shop);
}
