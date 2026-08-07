'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { Spinner } from '@/components/Spinner';
import { WEIGHT_OPTIONS, descriptionsFromWeights, combineWeight } from '@/lib/utils/weight';

interface ProductState {
  status: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  estimatedColor?: { r: number; g: number; b: number };
  color?: string;
  weight?: string;
  errorMessage?: string;
  imageProcessed?: boolean;
  imageProcessingFailureCount?: number;
  imageProcessingError?: string;
}

const MAX_IMAGE_PROCESSING_ATTEMPTS = 5;

export default function ProductDetail() {
  const [productState, setProductState] = useState<ProductState | null>(null);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [availableDescriptions, setAvailableDescriptions] = useState<string[]>([]);
  const [weightGrams, setWeightGrams] = useState('');
  const [rimDescription, setRimDescription] = useState('');
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
    loadProductImage('original');

    // Cleanup object URL on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [aggregateId]);

  // Swap in the centered image once the background processor has produced it
  useEffect(() => {
    if (productState?.imageProcessed) {
      loadProductImage('processed');
    }
  }, [productState?.imageProcessed]);

  async function loadProductImage(variant: 'original' | 'processed') {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(
        `/api/queries/product-image?aggregateId=${aggregateId}&variant=${variant}`,
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

      const response = await fetch(
        `/api/queries/product-state?aggregateId=${aggregateId}`,
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

      const response = await fetch(
        `/api/queries/product-weights?shopifyProductId=${shopifyProductId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setAvailableDescriptions(descriptionsFromWeights(data.weights));
      }
    } catch (error) {
      console.error('Failed to load product weights:', error);
    }
  }

  async function handleColorChange(newColor: string) {
    // Update color via SetColorV2 command
    try {
      const token = localStorage.getItem('token');

      await fetch('/api/commands/set-color-v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
    if (!weightGrams) {
      setError('Please select a weight');
      return;
    }

    // Recombine into the variant value format: "179g pink rim orange silver foil"
    const weight = combineWeight(weightGrams, rimDescription);

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      const response = await fetch('/api/commands/finish-create-product', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
                <div className="w-full max-w-md h-64 bg-gray-200 rounded-lg flex items-center justify-center gap-2 text-gray-500">
                  <Spinner />
                  <span>Loading image...</span>
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
                  <div className="flex items-center gap-2 text-gray-600">
                    <Spinner />
                    <span>
                      {!productState.estimatedColor && 'Estimating color from photo...'}
                      {productState.estimatedColor && !productState.color && 'Matching to available colors...'}
                    </span>
                  </div>
                )
              ) : (
                <div className="text-gray-900">{productState.color || 'Not set'}</div>
              )}
            </div>

            <div>
              {canEdit ? (
                <div className="flex gap-3">
                  <div className="w-32 shrink-0">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Weight
                    </label>
                    <select
                      value={weightGrams}
                      onChange={(e) => setWeightGrams(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="">-- g --</option>
                      {WEIGHT_OPTIONS.map(g => (
                        <option key={g} value={g}>{g}g</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rim / foil description
                    </label>
                    <input
                      type="text"
                      value={rimDescription}
                      onChange={(e) => setRimDescription(e.target.value)}
                      placeholder="e.g., pink rim orange silver foil"
                      list="description-options"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                    <datalist id="description-options">
                      {availableDescriptions.map(d => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weight
                  </label>
                  <div className="text-gray-900">{productState.weight || 'Not set'}</div>
                </>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            {isCreating && (
              <div className="p-3 bg-blue-100 text-blue-700 rounded text-sm flex items-center gap-2">
                <Spinner />
                <span>Creating in Shopify...</span>
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

            {canEdit && !productState.imageProcessed &&
              (productState.imageProcessingFailureCount || 0) < MAX_IMAGE_PROCESSING_ATTEMPTS && (
              <div className="p-3 bg-blue-50 text-blue-700 rounded text-sm flex items-center gap-2">
                <Spinner />
                <span>Preparing image&hellip; centering the disc and replacing the background.</span>
              </div>
            )}

            {/* Shopify creation is gated on the processed image, so an exhausted
                retry budget blocks the product entirely and must be visible. */}
            {canEdit && !productState.imageProcessed &&
              (productState.imageProcessingFailureCount || 0) >= MAX_IMAGE_PROCESSING_ATTEMPTS && (
              <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                Image processing failed after {productState.imageProcessingFailureCount} attempts:{' '}
                {productState.imageProcessingError}
                <div className="mt-1 text-xs">
                  This product cannot be created in Shopify until the image is processed.
                </div>
              </div>
            )}

            {canEdit && (
              <button
                onClick={handleFinish}
                disabled={loading || !weightGrams || !productState.estimatedColor || !productState.color || !productState.imageProcessed}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {loading && <Spinner />}
                <span>{loading ? 'Creating...' : 'Create in Shopify'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
