export interface BeginCreateProductCommand {
  userId: string;
  aggregateId: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  photoBlob: string; // base64
  photoMimeType: string;
}

export interface RecordProductColorCommand {
  userId: string;
  aggregateId: string;
  color: { r: number; g: number; b: number };
}

export interface SetEstimatedColorCommand {
  userId: string;
  aggregateId: string;
  color: { r: number; g: number; b: number };
}

export interface SetColorV2Command {
  userId: string;
  aggregateId: string;
  colorName: string;
}

export interface FinishCreateProductCommand {
  userId: string;
  aggregateId: string;
  weight: string;
}

export interface RecordProductCreatedInShopifyCommand {
  userId: string;
  aggregateId: string;
  shopifyVariantId: string;
  createdAt: number;
}

export interface RecordProductFailedInShopifyCommand {
  userId: string;
  aggregateId: string;
  errorMessage: string;
  attemptNumber: number;
}
