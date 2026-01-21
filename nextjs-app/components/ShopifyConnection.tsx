'use client';

import { useState, useEffect } from 'react';

interface ShopifyStatus {
  connected: boolean;
  shop?: string;
  expiresAt?: number;
}

export function ShopifyConnection() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch('/api/queries/shopify-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to check Shopify status:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleConnect() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('Not logged in');
      return;
    }
    // Redirect to OAuth login endpoint with auth header
    window.location.href = `/api/auth/shopify/login?token=${encodeURIComponent(token)}`;
  }

  function formatExpiresAt(expiresAt: number): string {
    const now = Date.now();
    const diff = expiresAt - now;

    if (diff <= 0) {
      return 'Expired';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="animate-pulse flex items-center space-x-3">
          <div className="h-4 w-4 bg-gray-200 rounded-full"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {status?.connected ? (
            <>
              <div className="h-3 w-3 bg-green-500 rounded-full"></div>
              <div>
                <span className="text-sm font-medium text-gray-900">
                  Connected to Shopify
                </span>
                {status.shop && (
                  <p className="text-xs text-gray-500">{status.shop}</p>
                )}
                {status.expiresAt && (
                  <p className="text-xs text-gray-400">
                    {formatExpiresAt(status.expiresAt)}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="h-3 w-3 bg-red-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">
                Shopify not connected
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleConnect}
          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
            status?.connected
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {status?.connected ? 'Reconnect' : 'Connect to Shopify'}
        </button>
      </div>
    </div>
  );
}
