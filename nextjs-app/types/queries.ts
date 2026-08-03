export interface ShopifyProduct {
  id: string;
  title: string;
}

export interface ProductTask {
  aggregateId: string;
}

export interface ProductDetails {
  shopifyProductId: string;
  shopifyProductTitle: string;
  estimatedColor: { r: number; g: number; b: number } | null;
  color: string | null;
  weight: string | null;
}

export interface ProductStateResult {
  status: 'data-entry' | 'creating' | 'created' | 'failed';
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

export interface StoreProduct {
  aggregateId: string;
  status: 'data-entry' | 'creating' | 'created' | 'failed';
  shopifyProductTitle: string;
  createdByUserId?: string;
}
