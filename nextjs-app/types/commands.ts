export interface BeginCreateProductCommand {
  aggregateId: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  photoBlob: string; // base64
  photoMimeType: string;
  createdByUserId: string;
}

export interface SetEstimatedColorCommand {
  aggregateId: string;
  color: { r: number; g: number; b: number };
}

export interface SetColorV2Command {
  aggregateId: string;
  colorName: string;
}

export interface FinishCreateProductCommand {
  aggregateId: string;
  weight: string;
}

export interface RecordProductCreatedInShopifyCommand {
  aggregateId: string;
  shopifyVariantId: string;
  createdAt: number;
}

export interface RecordProductFailedInShopifyCommand {
  aggregateId: string;
  errorMessage: string;
  attemptNumber: number;
}

export interface RecordProductImageProcessedCommand {
  aggregateId: string;
  imageBlob: string; // base64
  mimeType: string;
  backgroundHex: string;
  model: string;
  sizePx: number;
}

export interface RecordProductImageProcessingFailedCommand {
  aggregateId: string;
  errorMessage: string;
  attemptNumber: number;
}
