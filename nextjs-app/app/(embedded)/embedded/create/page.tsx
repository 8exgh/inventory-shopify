'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { embeddedFetch } from '@/lib/embedded/api';
import { Spinner } from '@/components/Spinner';

interface ShopifyProduct {
  id: string;
  title: string;
}

export default function EmbeddedCreate() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);
  const [photo, setPhoto] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const response = await embeddedFetch('/api/queries/shopify-products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setPhoto(base64.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!selectedProduct || !photo) {
      setError('Select a product and add a photo');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const aggregateId = uuidv4();
      const response = await embeddedFetch('/api/commands/begin-create-product', {
        method: 'POST',
        body: JSON.stringify({
          aggregateId,
          shopifyProductId: selectedProduct.id,
          shopifyProductTitle: selectedProduct.title,
          photoBlob: photo,
          photoMimeType: 'image/jpeg'
        })
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to start disc intake');
        setLoading(false);
        return;
      }
      router.push(`/embedded/product/${aggregateId}`);
    } catch (error: any) {
      setError(error.message || 'An error occurred');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <button onClick={() => router.push('/embedded')} className="mb-4 text-blue-600 hover:text-blue-800">
        &larr; Back
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Add a disc</h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
            <select
              value={selectedProduct?.id || ''}
              onChange={(e) => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            >
              <option value="">-- Select a product --</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>{product.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Disc photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhoto}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            {photo && (
              <img src={`data:image/jpeg;base64,${photo}`} alt="Preview" className="mt-4 max-w-full h-auto rounded-md" />
            )}
          </div>

          {error && <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={loading || !selectedProduct || !photo}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            <span>{loading ? 'Uploading...' : 'Next: color & weight'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
