'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { embeddedFetch } from '@/lib/embedded/api';
import { Spinner } from '@/components/Spinner';

// Landing target after plan approval on the Shopify-hosted pricing page:
// refresh the cached subscription status, then continue to the app.
export default function EmbeddedWelcome() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await embeddedFetch('/api/queries/subscription-status?refresh=1');
      } catch (error) {
        console.error('Subscription refresh failed:', error);
      }
      router.replace('/embedded');
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center gap-2 text-gray-500">
      <Spinner />
      <span>Setting up your subscription...</span>
    </div>
  );
}
