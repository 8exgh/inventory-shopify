import '@shopify/shopify-api/adapters/node';

function getShopifyShopDomain(): string {
  return process.env.SHOPIFY_SHOP_DOMAIN || '';
}

function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-10';
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  options: Array<{ name: string; values: string[] }>;
}

export interface ShopifyVariant {
  id: string;
  product_id: string;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  inventory_quantity: number;
}

export interface ShopifyImage {
  id: string;
  product_id: string;
  src: string;
}

// REST API based implementation for simplicity
export class ShopifyClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(accessToken: string, shop?: string) {
    const shopDomain = shop || getShopifyShopDomain();
    this.baseUrl = `https://${shopDomain}/admin/api/${getShopifyApiVersion()}`;
    this.headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };
  }

  async getProducts(): Promise<ShopifyProduct[]> {
    const response = await fetch(`${this.baseUrl}/products.json?limit=250`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    return data.products.map((p: any) => ({
      id: p.id.toString(),
      title: p.title,
      handle: p.handle,
      options: p.options || []
    }));
  }

  async getProduct(productId: string): Promise<ShopifyProduct> {
    const response = await fetch(`${this.baseUrl}/products/${productId}.json`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch product: ${response.statusText}`);
    }

    const data = await response.json();
    const p = data.product;
    return {
      id: p.id.toString(),
      title: p.title,
      handle: p.handle,
      options: p.options || []
    };
  }

  async getVariants(productId: string): Promise<ShopifyVariant[]> {
    const response = await fetch(`${this.baseUrl}/products/${productId}/variants.json`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch variants: ${response.statusText}`);
    }

    const data = await response.json();
    return data.variants.map((v: any) => ({
      id: v.id.toString(),
      product_id: v.product_id.toString(),
      title: v.title,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      inventory_quantity: v.inventory_quantity || 0
    }));
  }

  async uploadImage(productId: string, imageBase64: string): Promise<ShopifyImage> {
    const response = await fetch(`${this.baseUrl}/products/${productId}/images.json`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        image: {
          attachment: imageBase64
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload image: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.image.id.toString(),
      product_id: data.image.product_id.toString(),
      src: data.image.src
    };
  }

  async createVariant(
    productId: string,
    options: {
      option1?: string;
      option2?: string;
      option3?: string;
      inventory_quantity: number;
      image_id?: string;
    }
  ): Promise<ShopifyVariant> {
    const response = await fetch(`${this.baseUrl}/products/${productId}/variants.json`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        variant: {
          ...options,
          inventory_management: 'shopify',
          inventory_policy: 'deny'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create variant: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const v = data.variant;
    return {
      id: v.id.toString(),
      product_id: v.product_id.toString(),
      title: v.title,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      inventory_quantity: v.inventory_quantity || 0
    };
  }

  async getProductColors(productId: string): Promise<string[]> {
    const variants = await this.getVariants(productId);

    // Extract unique color values from option1
    const colors = new Set<string>();
    for (const variant of variants) {
      if (variant.option1) {
        colors.add(variant.option1);
      }
    }

    return Array.from(colors).sort();
  }
}

/**
 * Factory function to create a ShopifyClient with a specific access token.
 */
export function createShopifyClient(accessToken: string, shop?: string): ShopifyClient {
  return new ShopifyClient(accessToken, shop);
}
