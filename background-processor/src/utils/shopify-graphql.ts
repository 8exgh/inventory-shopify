// GraphQL Admin API client. Public apps must use GraphQL exclusively
// (App Store requirement 2.2.4); every Shopify call goes through here.
function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-10';
}

export class ShopifyGraphqlError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ShopifyGraphqlError';
  }
}

export async function shopifyGraphql<T = any>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://${shop}/admin/api/${getShopifyApiVersion()}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: variables || {} })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new ShopifyGraphqlError(`GraphQL request failed: ${response.status} ${response.statusText} - ${text}`);
  }

  const body = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (body.errors && body.errors.length > 0) {
    throw new ShopifyGraphqlError(
      `GraphQL errors: ${body.errors.map(e => e.message).join('; ')}`,
      body.errors
    );
  }

  if (!body.data) {
    throw new ShopifyGraphqlError('GraphQL response contained no data');
  }

  return body.data;
}

// Throws when a mutation payload carries userErrors
export function assertNoUserErrors(
  payload: { userErrors?: Array<{ field?: string[] | null; message: string }> } | null | undefined,
  context: string
): void {
  const errors = payload?.userErrors;
  if (errors && errors.length > 0) {
    throw new ShopifyGraphqlError(
      `${context}: ${errors.map(e => `${(e.field || []).join('.')} ${e.message}`.trim()).join('; ')}`,
      errors
    );
  }
}

// Numeric REST-era ids <-> GraphQL GIDs. Stored ids (shopifyProductId,
// location_id) predate the migration and may be plain numbers.
export function toGid(resource: 'Product' | 'ProductVariant' | 'Location' | 'MediaImage', id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/${resource}/${id}`;
}

export function fromGid(gid: string): string {
  const idx = gid.lastIndexOf('/');
  return idx === -1 ? gid : gid.substring(idx + 1);
}
