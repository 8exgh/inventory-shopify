export type EventType =
  | 'BeginProductCreated'
  | 'ColorEstimated'
  | 'ColorSetV2'
  | 'ProductWeightSet'
  | 'ProductReadyToBeCreated'
  | 'ProductCreated'
  | 'ProductCreateFailed'
  | 'ProductImageProcessed'
  | 'ProductImageProcessingFailed';

export interface BeginProductCreatedData {
  shopifyProductId: string;
  shopifyProductTitle: string;
  photoMimeType: string;
  // Optional: events created before the shared store DB lack it
  createdByUserId?: string;
}

export interface ColorEstimatedData {
  color: { r: number; g: number; b: number };
}

export interface ColorSetV2Data {
  colorName: string;
}

export interface ProductWeightSetData {
  weight: string;
}

export interface ProductReadyToBeCreatedData {}

export interface ProductCreatedData {
  shopifyVariantId: string;
  createdAt: number;
}

export interface ProductCreateFailedData {
  errorMessage: string;
  attemptNumber: number;
}

export interface ProductImageProcessedData {
  mimeType: string;
  backgroundHex: string;
  model: string;
  sizePx: number;
}

export interface ProductImageProcessingFailedData {
  errorMessage: string;
  attemptNumber: number;
}

export type EventData =
  | BeginProductCreatedData
  | ColorEstimatedData
  | ColorSetV2Data
  | ProductWeightSetData
  | ProductReadyToBeCreatedData
  | ProductCreatedData
  | ProductCreateFailedData
  | ProductImageProcessedData
  | ProductImageProcessingFailedData;

// Matches database columns with snake case
export interface Event {
  id: number;
  aggregate_id: string;
  event_type: EventType;
  event_data: string; // JSON
  photo_blob: Buffer | null;
  timestamp: number;
  version: number;
}

export interface ProductState {
  status: 'not-started' | 'data-entry' | 'creating' | 'created' | 'failed';
  shopifyProductId?: string;
  shopifyProductTitle?: string;
  photoMimeType?: string;
  createdByUserId?: string;
  estimatedColor?: { r: number; g: number; b: number };
  color?: string;
  weight?: string;
  shopifyVariantId?: string;
  errorMessage?: string;
  failureCount?: number;
  imageProcessed?: boolean;
  processedImageMimeType?: string;
  imageProcessingFailureCount?: number;
  imageProcessingError?: string;
}
