'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { embeddedFetch } from '@/lib/embedded/api';
import { Spinner } from '@/components/Spinner';
import { WEIGHT_OPTIONS, descriptionsFromWeights, combineWeight } from '@/lib/utils/weight';
import { useProductImage } from '@/lib/hooks/useProductImage';

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

export default function EmbeddedProductDetail() {
  const [productState, setProductState] = useState<ProductState | null>(null);
  const [availableColors, setAvailableColors] = useState<string[]>([]);
  const [availableDescriptions, setAvailableDescriptions] = useState<string[]>([]);
  const [weightGrams, setWeightGrams] = useState('');
  const [rimDescription, setRimDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const params = useParams();
  const aggregateId = params.aggregateId as string;

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 2000);
    return () => clearInterval(interval);
  }, [aggregateId]);

  const imageUrl = useProductImage(
    aggregateId,
    productState?.imageProcessed ? 'processed' : 'original',
    embeddedFetch
  );

  useEffect(() => {
    if (productState?.shopifyProductId) {
      loadColorsAndWeights(productState.shopifyProductId);
    }
  }, [productState?.shopifyProductId]);

  async function loadState() {
    try {
      const response = await embeddedFetch(`/api/queries/product-state?aggregateId=${aggregateId}`);
      if (response.ok) {
        setProductState(await response.json());
      }
    } catch (error) {
      console.error('Failed to load product state:', error);
    }
  }

  async function loadColorsAndWeights(shopifyProductId: string) {
    try {
      const [colorsRes, weightsRes] = await Promise.all([
        embeddedFetch(`/api/queries/product-colors?productId=${shopifyProductId}`),
        embeddedFetch(`/api/queries/product-weights?shopifyProductId=${shopifyProductId}`)
      ]);
      if (colorsRes.ok) {
        setAvailableColors((await colorsRes.json()).colors);
      }
      if (weightsRes.ok) {
        setAvailableDescriptions(descriptionsFromWeights((await weightsRes.json()).weights));
      }
    } catch (error) {
      console.error('Failed to load colors/weights:', error);
    }
  }

  async function handleColorChange(newColor: string) {
    try {
      await embeddedFetch('/api/commands/set-color-v2', {
        method: 'POST',
        body: JSON.stringify({ aggregateId, colorName: newColor })
      });
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
    setLoading(true);
    setError('');
    try {
      const response = await embeddedFetch('/api/commands/finish-create-product', {
        method: 'POST',
        body: JSON.stringify({ aggregateId, weight: combineWeight(weightGrams, rimDescription) })
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to submit');
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (!productState) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-gray-500">
        <Spinner /><span>Loading...</span>
      </div>
    );
  }

  const canEdit = productState.status === 'data-entry';

  return (
    <div className="max-w-2xl mx-auto p-4">
      <button onClick={() => router.push('/embedded')} className="mb-4 text-blue-600 hover:text-blue-800">
        &larr; Back
      </button>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{productState.shopifyProductTitle}</h1>
          <p className="text-sm text-gray-500">{aggregateId}</p>
        </div>

        {imageUrl ? (
          <img src={imageUrl} alt="Disc" className="w-full max-w-md rounded-lg" />
        ) : (
          <div className="w-full max-w-md h-48 bg-gray-200 rounded-lg flex items-center justify-center gap-2 text-gray-500">
            <Spinner /><span>Loading image...</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          {canEdit ? (
            productState.color ? (
              <select
                value={productState.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
              >
                {(availableColors.length > 0 ? availableColors : [productState.color]).map(color => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 text-gray-600">
                <Spinner />
                <span>{productState.estimatedColor ? 'Matching to available colors...' : 'Estimating color from photo...'}</span>
              </div>
            )
          ) : (
            <div className="text-gray-900">{productState.color || 'Not set'}</div>
          )}
        </div>

        {canEdit ? (
          <div className="flex gap-3">
            <div className="w-32 shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-2">Weight</label>
              <select
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
              >
                <option value="">-- g --</option>
                {WEIGHT_OPTIONS.map(g => <option key={g} value={g}>{g}g</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Rim / foil description</label>
              <input
                type="text"
                value={rimDescription}
                onChange={(e) => setRimDescription(e.target.value)}
                placeholder="e.g., pink rim orange silver foil"
                list="embedded-description-options"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
              />
              <datalist id="embedded-description-options">
                {availableDescriptions.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Weight</label>
            <div className="text-gray-900">{productState.weight || 'Not set'}</div>
          </div>
        )}

        {error && <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        {productState.status === 'creating' && (
          <div className="p-3 bg-blue-100 text-blue-700 rounded text-sm flex items-center gap-2">
            <Spinner /><span>Creating in Shopify...</span>
          </div>
        )}
        {productState.status === 'created' && (
          <div className="p-3 bg-green-100 text-green-700 rounded text-sm">Successfully created in Shopify!</div>
        )}
        {productState.status === 'failed' && (
          <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
            Failed to create in Shopify: {productState.errorMessage}
          </div>
        )}

        {canEdit && !productState.imageProcessed &&
          (productState.imageProcessingFailureCount || 0) < MAX_IMAGE_PROCESSING_ATTEMPTS && (
          <div className="p-3 bg-blue-50 text-blue-700 rounded text-sm flex items-center gap-2">
            <Spinner /><span>Preparing image&hellip; centering the disc and replacing the background.</span>
          </div>
        )}
        {canEdit && !productState.imageProcessed &&
          (productState.imageProcessingFailureCount || 0) >= MAX_IMAGE_PROCESSING_ATTEMPTS && (
          <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
            Image processing failed: {productState.imageProcessingError}
          </div>
        )}

        {canEdit && (
          <button
            onClick={handleFinish}
            disabled={loading || !weightGrams || !productState.color || !productState.imageProcessed}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            <span>{loading ? 'Creating...' : 'Create in Shopify'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
