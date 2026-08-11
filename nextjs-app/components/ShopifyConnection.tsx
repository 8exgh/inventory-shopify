'use client';

import { useState, useEffect } from 'react';

interface ShopifyStatus {
  connected: boolean;
  shop?: string;
}

interface ShopifyConnectionProps {
  role: string;
  onConnectionChange?: (connected: boolean) => void;
}

// Read-only status card. Connecting a store happens by installing the app
// from the Shopify App Store (managed installation) - never from here.
export function ShopifyConnection({ role, onConnectionChange }: ShopifyConnectionProps) {
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
        onConnectionChange?.(!!data.connected);
      }
    } catch (error) {
      console.error('Failed to check Shopify status:', error);
    } finally {
      setLoading(false);
    }
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

  if (status?.connected) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-3">
          <div className="h-3 w-3 bg-green-500 rounded-full"></div>
          <div>
            <span className="text-sm font-medium text-gray-900">
              Connected to Shopify
            </span>
            {status.shop && (
              <p className="text-xs text-gray-500">{status.shop}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 text-center">
      <div className="flex items-center justify-center space-x-3 mb-2">
        <div className="h-3 w-3 bg-red-500 rounded-full"></div>
        <span className="text-sm font-medium text-gray-900">
          Shopify store not connected
        </span>
      </div>
      <p className="text-sm text-gray-500">
        {role === 'admin'
          ? 'Install (or reinstall) DiscReload from the Shopify App Store, then open it once in your Shopify admin.'
          : 'Waiting for your store admin to install the app from the Shopify App Store.'}
      </p>
    </div>
  );
}
