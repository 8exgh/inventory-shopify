import { shopifyApi } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

function getShopifyShopDomain(): string {
  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || '';
  return SHOPIFY_SHOP_DOMAIN;
}

function getShopifyAccessToken(): string {
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  return SHOPIFY_ACCESS_TOKEN;;
}

function getShopifyApiVersion(): string {
  const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
  return SHOPIFY_API_VERSION;
}

const shopify = shopifyApi({
  apiKey: 'not-needed-for-custom-app',
  apiSecretKey: 'not-needed-for-custom-app',
  scopes: ['read_products', 'write_products', 'write_files'],
  hostName: getShopifyShopDomain().replace('.myshopify.com', ''),
  apiVersion: getShopifyApiVersion() as any,
  isEmbeddedApp: false,
});

const session = {
  shop: getShopifyShopDomain(),
  accessToken: getShopifyAccessToken(),
  state: 'active',
  isOnline: false,
  scope: 'read_products,write_products,write_files'
};

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

  constructor() {
    this.baseUrl = `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}`;
    this.headers = {
      'X-Shopify-Access-Token': getShopifyAccessToken(),
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
}

export const shopifyClient = new ShopifyClient();
