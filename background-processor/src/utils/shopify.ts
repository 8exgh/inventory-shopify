export function getShopifyShopDomain(): string {
  return process.env.SHOPIFY_SHOP_DOMAIN || '';
}

export function getShopifyAccessToken(): string {
  return process.env.SHOPIFY_ACCESS_TOKEN || '';
}

export function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2026-01';
}

export function getShopifyLocationId(): string {
  return process.env.SHOPIFY_LOCATION_ID || '';
}

export function toGid(resource: string, numericId: string): string {
  return `gid://shopify/${resource}/${numericId}`;
}

export function fromGid(gid: string): string {
  return gid.split('/').pop()!;
}

function getGraphqlUrl(): string {
  return `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}/graphql.json`;
}

function getHeaders(): Record<string, string> {
  return {
    'X-Shopify-Access-Token': getShopifyAccessToken(),
    'Content-Type': 'application/json',
  };
}

export async function graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const response = await fetch(getGraphqlUrl(), {
    method: 'POST',
    headers: getHeaders(),
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
