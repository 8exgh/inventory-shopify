function getShopifyShopDomain(): string {
  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || '';
  return SHOPIFY_SHOP_DOMAIN;
}

function getShopifyAccessToken(): string {
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  return SHOPIFY_ACCESS_TOKEN;
}

function getShopifyApiVersion(): string {
  const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';
  return SHOPIFY_API_VERSION;
}

function toGid(resource: string, numericId: string): string {
  return `gid://shopify/${resource}/${numericId}`;
}

function fromGid(gid: string): string {
  return gid.split('/').pop()!;
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

// REST API based implementation for simplicity
export class ShopifyClient {
  private graphqlUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.graphqlUrl = `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}/graphql.json`;
    this.headers = {
      'X-Shopify-Access-Token': getShopifyAccessToken(),
      'Content-Type': 'application/json',
    };
  }

  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const json = await response.json() as any;
    if (json.errors) {
      throw new Error(`GraphQL errors: ${json.errors.map((e: any) => e.message).join(', ')}`);
    }
    return json.data as T;
  }

  async getProducts(): Promise<ShopifyProduct[]> {
    const query = `
      query {
        products(first: 250) {
          nodes {
            id
            title
            handle
            options { name values }
          }
        }
      }
    `;

    const data = await this.graphql<{
      products: { nodes: Array<{ id: string; title: string; handle: string; options: Array<{ name: string; values: string[] }> }> }
    }>(query);

    return data.products.nodes.map((p) => ({
      id: fromGid(p.id),
      title: p.title,
      handle: p.handle,
      options: p.options || []
    }));
  }

  async getProduct(productId: string): Promise<ShopifyProduct> {
    const query = `
      query($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          options { name values }
        }
      }
    `;

    const data = await this.graphql<{
      product: { id: string; title: string; handle: string; options: Array<{ name: string; values: string[] }> }
    }>(query, { id: toGid('Product', productId) });

    const p = data.product;
    return {
      id: fromGid(p.id),
      title: p.title,
      handle: p.handle,
      options: p.options || []
    };
  }

  async getVariants(productId: string): Promise<ShopifyVariant[]> {
    const query = `
      query($id: ID!) {
        product(id: $id) {
          id
          variants(first: 250) {
            nodes {
              id
              title
              selectedOptions { name value }
              inventoryQuantity
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      product: {
        id: string;
        variants: {
          nodes: Array<{
            id: string;
            title: string;
            selectedOptions: Array<{ name: string; value: string }>;
            inventoryQuantity: number;
          }>
        }
      }
    }>(query, { id: toGid('Product', productId) });

    return data.product.variants.nodes.map((v) => ({
      id: fromGid(v.id),
      product_id: productId,
      title: v.title,
      option1: v.selectedOptions.find(o => o.name === 'Color')?.value
            ?? v.selectedOptions[0]?.value ?? null,
      option2: v.selectedOptions.find(o => o.name === 'Weight')?.value
            ?? v.selectedOptions[1]?.value ?? null,
      option3: v.selectedOptions[2]?.value ?? null,
      inventory_quantity: v.inventoryQuantity || 0
    }));
  }

  async uploadImage(productId: string, imageBase64: string): Promise<string> {
    // Step 1: Request staged upload URL
    const stagedData = await this.graphql<{
      stagedUploadsCreate: {
        stagedTargets: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors: Array<{ field: string[]; message: string }>;
      }
    }>(`
      mutation($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `, {
      input: [{
        resource: 'PRODUCT_IMAGE',
        filename: `product-image-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        httpMethod: 'POST',
      }]
    });

    if (stagedData.stagedUploadsCreate.userErrors.length > 0) {
      throw new Error(`Staged upload error: ${stagedData.stagedUploadsCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    const target = stagedData.stagedUploadsCreate.stagedTargets[0];

    // Step 2: Upload binary to staged URL
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'product-image.jpg');

    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Staged upload failed: ${uploadResponse.statusText}`);
    }

    // Step 3: Attach media to product
    const mediaData = await this.graphql<{
      productCreateMedia: {
        media: Array<{ id: string }>;
        mediaUserErrors: Array<{ field: string[]; message: string }>;
      }
    }>(`
      mutation($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media {
            ... on MediaImage { id }
          }
          mediaUserErrors { field message }
        }
      }
    `, {
      productId: toGid('Product', productId),
      media: [{
        originalSource: target.resourceUrl,
        mediaContentType: 'IMAGE',
      }]
    });

    if (mediaData.productCreateMedia.mediaUserErrors.length > 0) {
      throw new Error(`Media create error: ${mediaData.productCreateMedia.mediaUserErrors.map(e => e.message).join(', ')}`);
    }

    return mediaData.productCreateMedia.media[0].id;
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
    const optionValues: Array<{ optionName: string; name: string }> = [];
    if (options.option1) optionValues.push({ optionName: 'Color', name: options.option1 });
    if (options.option2) optionValues.push({ optionName: 'Weight', name: options.option2 });
    if (options.option3) optionValues.push({ optionName: 'Option3', name: options.option3 });

    const variantInput: Record<string, any> = {
      optionValues,
      inventoryPolicy: 'DENY',
      inventoryItem: { tracked: true },
    };

    if (options.image_id) {
      variantInput.mediaId = options.image_id;
    }

    const data = await this.graphql<{
      productVariantsBulkCreate: {
        productVariants: Array<{
          id: string;
          title: string;
          selectedOptions: Array<{ name: string; value: string }>;
          inventoryQuantity: number;
        }>;
        userErrors: Array<{ field: string[]; message: string }>;
      }
    }>(`
      mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
            title
            selectedOptions { name value }
            inventoryQuantity
          }
          userErrors { field message }
        }
      }
    `, {
      productId: toGid('Product', productId),
      variants: [variantInput]
    });

    if (data.productVariantsBulkCreate.userErrors.length > 0) {
      throw new Error(`Create variant error: ${data.productVariantsBulkCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    const v = data.productVariantsBulkCreate.productVariants[0];
    return {
      id: fromGid(v.id),
      product_id: productId,
      title: v.title,
      option1: v.selectedOptions.find(o => o.name === 'Color')?.value
            ?? v.selectedOptions[0]?.value ?? null,
      option2: v.selectedOptions.find(o => o.name === 'Weight')?.value
            ?? v.selectedOptions[1]?.value ?? null,
      option3: v.selectedOptions[2]?.value ?? null,
      inventory_quantity: v.inventoryQuantity || 0
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

export const shopifyClient = new ShopifyClient();
