'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { ShopifyConnection } from '@/components/ShopifyConnection';

interface Product {
  aggregateId: string;
  status: string;
  shopifyProductTitle: string;
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_missing_params: 'Shopify authorization failed: missing parameters.',
  oauth_state_mismatch: 'Shopify authorization failed: state mismatch. Please try again.',
  oauth_shop_mismatch: 'Shopify authorization failed: shop mismatch. Please try again.',
  oauth_no_user: 'Shopify authorization failed: session expired. Please log in and try again.',
  oauth_not_admin: 'Only an admin can connect the Shopify store.',
  oauth_invalid_hmac: 'Shopify authorization failed: invalid signature.',
  oauth_token_exchange: 'Shopify authorization failed while exchanging the access token.',
  oauth_location_fetch: 'Connected to Shopify but failed to read the store location. Please try again.',
  oauth_error: 'Shopify authorization failed. Please try again.'
};

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }

    // Decode JWT to get user role
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUserRole(payload.role || '');
    } catch (error) {
      console.error('Failed to decode token:', error);
    }

    // Surface the OAuth callback result (redirected with query params).
    // Read from window to avoid a Suspense boundary for useSearchParams.
    const searchParams = new URLSearchParams(window.location.search);
    const oauthError = searchParams.get('error');
    if (searchParams.get('shopify') === 'connected') {
      setBanner({ kind: 'success', text: 'Shopify store connected.' });
    } else if (oauthError && OAUTH_ERROR_MESSAGES[oauthError]) {
      setBanner({ kind: 'error', text: OAUTH_ERROR_MESSAGES[oauthError] });
    }

    loadStatusAndProducts();
  }, []);

  async function loadStatusAndProducts() {
    try {
      const token = localStorage.getItem('token');

      const statusResponse = await fetch('/api/queries/shopify-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let connected = false;
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        connected = !!statusData.connected;
      }
      setShopifyConnected(connected);

      if (connected) {
        const response = await fetch('/api/queries/products', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setProducts(data.products);
        }
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setShopifyConnected(false);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    router.push('/');
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'data-entry': return 'bg-yellow-100 text-yellow-800';
      case 'creating': return 'bg-blue-100 text-blue-800';
      case 'created': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto p-4">
        {banner && (
          <div
            className={`mb-4 p-3 rounded text-sm ${
              banner.kind === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
            }`}
          >
            {banner.text}
          </div>
        )}
        <div className="mb-6">
          <ShopifyConnection role={userRole} onConnectionChange={setShopifyConnected} />
        </div>
        {shopifyConnected ? (
          <>
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <div className="space-x-4">
                <button
                  onClick={() => router.push('/create-product')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Create Product
                </button>
                {userRole === 'admin' && (
                  <button
                    onClick={() => router.push('/admin/users')}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
                  >
                    Manage Users
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                >
                  Logout
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        No products yet. Click "Create Product" to get started.
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.aggregateId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {product.shopifyProductTitle}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(product.status)}`}>
                            {product.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                          {product.aggregateId.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => router.push(`/product/${product.aggregateId}`)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={handleLogout}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
