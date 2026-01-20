'use client';

import { useState, useEffect } from 'react';

export function Header() {
  const [shopUrl, setShopUrl] = useState<string>('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchShopInfo(token);
    }
  }, []);

  async function fetchShopInfo(token: string) {
    try {
      const response = await fetch('/api/queries/shop-info', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setShopUrl(data.shopUrl);
      }
    } catch (error) {
      console.error('Failed to fetch shop info:', error);
    }
  }

  if (!shopUrl) return null;

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <span className="text-lg font-semibold text-gray-900">Disc Golf Inventory</span>
        <a
          href={shopUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
        >
          {shopUrl}
        </a>
      </div>
    </header>
  );
}
