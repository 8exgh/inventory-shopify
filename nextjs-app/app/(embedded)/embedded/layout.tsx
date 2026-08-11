import type { Metadata } from 'next'
import '../../globals.css'

export const metadata: Metadata = {
  title: 'DiscReload',
}

// Root layout for the embedded (Shopify admin) surface. App Bridge must be
// the FIRST script in <head> (App Store req 2.2.3), configured via the
// shopify-api-key meta tag.
export default function EmbeddedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.SHOPIFY_CLIENT_ID || ''} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  )
}
