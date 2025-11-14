export interface ShopifyProduct {
  id: string;
  title: string;
}

export interface ProductTask {
  userId: string;
  aggregateId: string;
}

export interface ProductDetails {
  shopifyProductId: string;
  shopifyProductTitle: string;
  color: { r: number; g: number; b: number };
  weight: string;
}

export interface ProductStateResult {
  status: 'data-entry' | 'creating' | 'created' | 'failed';
  shopifyProductId: string;
  shopifyProductTitle: string;
  color?: { r: number; g: number; b: number };
  weight?: string;
  errorMessage?: string;
}

export interface UserProduct {
  aggregateId: string;
  status: 'data-entry' | 'creating' | 'created' | 'failed';
  shopifyProductTitle: string;
}
