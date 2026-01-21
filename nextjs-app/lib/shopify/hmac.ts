import crypto from 'crypto';

/**
 * Verifies the HMAC signature from Shopify OAuth callback.
 * Shopify signs the callback parameters with the client secret.
 */
export function verifyShopifyHmac(
  query: Record<string, string>,
  clientSecret: string
): boolean {
  const hmac = query.hmac;
  if (!hmac) {
    return false;
  }

  // Build the message string from query params (excluding hmac)
  const params = { ...query };
  delete params.hmac;

  // Sort parameters alphabetically and create query string
  const sortedKeys = Object.keys(params).sort();
  const message = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // Calculate expected HMAC
  const calculatedHmac = crypto
    .createHmac('sha256', clientSecret)
    .update(message)
    .digest('hex');

  // Compare using timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hmac, 'hex'),
    Buffer.from(calculatedHmac, 'hex')
  );
}

/**
 * Generates a random state string for CSRF protection.
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}
