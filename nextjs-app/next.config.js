/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    return [
      {
        // Embedded app must render inside the Shopify admin iframe
        source: '/embedded/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors https://admin.shopify.com https://*.myshopify.com;'
          }
        ]
      }
    ];
  }
}

module.exports = nextConfig
