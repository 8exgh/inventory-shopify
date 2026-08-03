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

// Client-side mirror of the server's validation, purely for input feedback
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function ShopifyConnection({ role, onConnectionChange }: ShopifyConnectionProps) {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopInput, setShopInput] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);

  const isAdmin = role === 'admin';
  const shopInputValid = SHOP_DOMAIN_PATTERN.test(shopInput.trim());

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

  function handleConnect() {
    const token = localStorage.getItem('token');
    if (!token || !shopInputValid) {
      return;
    }
    const shop = shopInput.trim().toLowerCase();
    // Redirect to the OAuth login endpoint; the admin approves the app on
    // Shopify and comes back via the callback
    window.location.href =
      `/api/auth/shopify/login?token=${encodeURIComponent(token)}&shop=${encodeURIComponent(shop)}`;
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
        <div className="flex items-center justify-between">
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
          {isAdmin && (
            !showConnectForm ? (
              <button
                onClick={() => {
                  setShopInput(status.shop || '');
                  setShowConnectForm(true);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Reconnect / change store
              </button>
            ) : (
              <ConnectForm
                shopInput={shopInput}
                setShopInput={setShopInput}
                shopInputValid={shopInputValid}
                onConnect={handleConnect}
              />
            )
          )}
        </div>
      </div>
    );
  }

  // Not connected
  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="flex items-center justify-center space-x-3 mb-2">
          <div className="h-3 w-3 bg-red-500 rounded-full"></div>
          <span className="text-sm font-medium text-gray-900">
            Shopify store not connected
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Waiting for an admin to connect the Shopify store. You will be able to
          add discs once the store is connected.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center space-x-3 mb-3">
        <div className="h-3 w-3 bg-red-500 rounded-full"></div>
        <span className="text-sm font-medium text-gray-900">
          Connect your Shopify store to get started
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Enter your store's <span className="font-mono">myshopify.com</span> domain
        and approve the app on Shopify. This is a one-time setup; the
        authorization does not expire.
      </p>
      <ConnectForm
        shopInput={shopInput}
        setShopInput={setShopInput}
        shopInputValid={shopInputValid}
        onConnect={handleConnect}
      />
    </div>
  );
}

function ConnectForm({
  shopInput,
  setShopInput,
  shopInputValid,
  onConnect
}: {
  shopInput: string;
  setShopInput: (value: string) => void;
  shopInputValid: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex items-center space-x-2">
      <input
        type="text"
        value={shopInput}
        onChange={(e) => setShopInput(e.target.value)}
        placeholder="your-store.myshopify.com"
        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
      />
      <button
        onClick={onConnect}
        disabled={!shopInputValid}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        Connect to Shopify
      </button>
    </div>
  );
}
