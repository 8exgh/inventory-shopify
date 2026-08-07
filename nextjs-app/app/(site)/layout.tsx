import type { Metadata } from 'next'
import '../globals.css'
import { BuildInfoFooter } from '@/components/BuildInfoFooter'
import { FeedbackFooter } from '@/components/FeedbackFooter'

export const metadata: Metadata = {
  title: 'Disc Golf Inventory Manager',
  description: 'Shopify inventory management for disc golf products',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <FeedbackFooter />
        <BuildInfoFooter />
      </body>
    </html>
  )
}
