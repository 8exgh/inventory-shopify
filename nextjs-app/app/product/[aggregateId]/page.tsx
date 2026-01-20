'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Header } from '@/components/Header';

interface ProductState {
  status: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  estimatedColor?: { r: number; g: number; b: number };
  color?: string;
  weight?: string;
  errorMessage?: string;
}

export default function ProductDetail() {
  const [productState, setProductState] = useState<ProductState | null>(null);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [availableWeights, setAvailableWeights] = useState<string[]>([]);
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const router = useRouter();
  const params = useParams();
  const aggregateId = params.aggregateId as string;

  // Load available colors from localStorage on mount
  useEffect(() => {
    const storedColors = localStorage.getItem(`colors-${aggregateId}`);
    if (storedColors) {
      setAvailableColors(JSON.parse(storedColors));
    }
  }, [aggregateId]);

  // Load product image
  useEffect(() => {
    loadProductImage();

    // Cleanup object URL on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [aggregateId]);

  async function loadProductImage() {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      const response = await fetch(
        `/api/queries/product-image?userId=${userId}&aggregateId=${aggregateId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      }
    } catch (error) {
      console.error('Failed to load product image:', error);
    }
  }

  useEffect(() => {
    loadProductState();
    const interval = setInterval(loadProductState, 1000);
    return () => clearInterval(interval);
  }, [aggregateId]);

  // Load available weights when we have shopifyProductId
  useEffect(() => {
    if (productState?.shopifyProductId) {
      loadProductWeights(productState.shopifyProductId);
    }
  }, [productState?.shopifyProductId]);

  async function loadProductState() {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      const response = await fetch(
        `/api/queries/product-state?userId=${userId}&aggregateId=${aggregateId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setProductState(data);
      }
    } catch (error) {
      console.error('Failed to load product state:', error);
    }
  }

  async function loadProductWeights(shopifyProductId: string) {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      const response = await fetch(
        `/api/queries/product-weights?userId=${userId}&shopifyProductId=${shopifyProductId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setAvailableWeights(data.weights);
      }
    } catch (error) {
      console.error('Failed to load product weights:', error);
    }
  }

  async function handleColorChange(newColor: string) {
    // Update color via SetColorV2 command
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      await fetch('/api/commands/set-color-v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          aggregateId,
          colorName: newColor
        })
      });

      // Optimistically update UI
      if (productState) {
        setProductState({ ...productState, color: newColor });
      }
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  }

  async function handleFinish() {
    if (!weight) {
      setError('Please enter a weight');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      const response = await fetch('/api/commands/finish-create-product', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          aggregateId,
          weight
        })
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to finish product');
        setLoading(false);
        return;
      }

      // Product is now being created in Shopify
      // Continue polling to show status updates
    } catch (error: any) {
      setError(error.message || 'An error occurred');
      setLoading(false);
    }
  }

  if (!productState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  const canEdit = productState.status === 'data-entry';
  const isCreating = productState.status === 'creating';
  const isCreated = productState.status === 'created';
  const isFailed = productState.status === 'failed';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto p-4">
        <div className="mb-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {productState.shopifyProductTitle}
          </h1>
          <p className="text-sm text-gray-500 mb-6">ID: {aggregateId}</p>

          <div className="space-y-6">
            <div>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Product"
                  className="w-full max-w-md rounded-lg"
                />
              ) : (
                <div className="w-full max-w-md h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-500">Loading image...</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color
              </label>

              {/* Color preview rectangle */}
              {productState.estimatedColor && (
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="w-20 h-20 rounded-md border-2 border-gray-300 shadow-sm"
                    style={{
                      backgroundColor: `rgb(${productState.estimatedColor.r}, ${productState.estimatedColor.g}, ${productState.estimatedColor.b})`
                    }}
                  />
                  <div className="text-xs text-gray-500">
                    Estimated from photo<br />
                    RGB({productState.estimatedColor.r}, {productState.estimatedColor.g}, {productState.estimatedColor.b})
                  </div>
                </div>
              )}

              {canEdit ? (
                productState.estimatedColor && productState.color ? (
                  <select
                    value={productState.color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  >
                    {availableColors.length > 0 ? (
                      availableColors.map(color => (
                        <option key={color} value={color}>{color}</option>
                      ))
                    ) : (
                      <option value={productState.color}>{productState.color}</option>
                    )}
                  </select>
                ) : (
                  <div className="text-gray-600">
                    {!productState.estimatedColor && 'Estimating color from photo...'}
                    {productState.estimatedColor && !productState.color && 'Matching to available colors...'}
                  </div>
                )
              ) : (
                <div className="text-gray-900">{productState.color || 'Not set'}</div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weight
              </label>
              {canEdit ? (
                <>
                  <input
                    type="text"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g., 168G RED PRISM Foil"
                    list="weight-options"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                  <datalist id="weight-options">
                    {availableWeights.map(w => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </>
              ) : (
                <div className="text-gray-900">{productState.weight || 'Not set'}</div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            {isCreating && (
              <div className="p-3 bg-blue-100 text-blue-700 rounded text-sm">
                Creating in Shopify...
              </div>
            )}

            {isCreated && (
              <div className="p-3 bg-green-100 text-green-700 rounded text-sm">
                Successfully created in Shopify!
              </div>
            )}

            {isFailed && (
              <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                Failed to create in Shopify: {productState.errorMessage}
              </div>
            )}

            {canEdit && (
              <button
                onClick={handleFinish}
                disabled={loading || !weight || !productState.estimatedColor || !productState.color}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400"
              >
                {loading ? 'Creating...' : 'Create in Shopify'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
