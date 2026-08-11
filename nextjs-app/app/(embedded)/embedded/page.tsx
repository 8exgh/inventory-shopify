'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { embeddedFetch, ensureProvisioned } from '@/lib/embedded/api';
import { Spinner } from '@/components/Spinner';

interface Product {
  aggregateId: string;
  status: string;
  shopifyProductTitle: string;
}

export default function EmbeddedDashboard() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [needsPlan, setNeedsPlan] = useState(false);
  const [planUrl, setPlanUrl] = useState('');

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    try {
      await ensureProvisioned();

      // Shopify sends the merchant back here with charge_id right after they
      // approve a plan, so skip the cached status on that first load.
      const justApproved = new URLSearchParams(window.location.search).has('charge_id');
      const subResponse = await embeddedFetch(
        `/api/queries/subscription-status${justApproved ? '?refresh=1' : ''}`
      );
      if (subResponse.ok) {
        const sub = await subResponse.json();
        if (!sub.subscribed) {
          setNeedsPlan(true);
          setPlanUrl(sub.planUrl || '');
          return;
        }
      }

      const response = await embeddedFetch('/api/queries/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products);
      }
    } catch (error: any) {
      setBootError(error.message || 'Failed to load');
    } finally {
      setBooting(false);
    }
  }

  function statusColor(status: string) {
    switch (status) {
      case 'data-entry': return 'bg-yellow-100 text-yellow-800';
      case 'creating': return 'bg-blue-100 text-blue-800';
      case 'created': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-gray-500">
        <Spinner />
        <span>Loading...</span>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="p-6">
        <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{bootError}</div>
      </div>
    );
  }

  if (needsPlan) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Choose your plan</h1>
          <p className="text-sm text-gray-500 mb-6">
            DiscReload is $9/month with a 14-day free trial. Pick your
            plan to start photographing discs.
          </p>
          <button
            onClick={() => planUrl && window.open(planUrl, '_top')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            View plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">DiscReload</h1>
        <div className="space-x-3">
          <Link
            href="/embedded/create"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Add a disc
          </Link>
          <Link
            href="/embedded/staff"
            className="inline-block bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
          >
            Staff accounts
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-6 text-center text-gray-500">
                  No discs yet. Click "Add a disc" to photograph your first one -
                  or invite staff and have them use the mobile site.
                </td>
              </tr>
            ) : (
              products.map(product => (
                <tr key={product.aggregateId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {product.shopifyProductTitle}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor(product.status)}`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link href={`/embedded/product/${product.aggregateId}`} className="text-blue-600 hover:text-blue-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Tip: restockers can photograph discs from their phones at{' '}
        <span className="font-mono">inventory-reload.fusenv.com</span> using staff accounts
        you create under "Staff accounts".
      </p>
    </div>
  );
}
