export type EventType =
  | 'BeginProductCreated'
  | 'ColorEstimated'
  | 'ProductWeightSet'
  | 'ProductReadyToBeCreated'
  | 'ProductCreated'
  | 'ProductCreateFailed';

export interface BeginProductCreatedData {
  shopifyProductId: string;
  shopifyProductTitle: string;
  photoMimeType: string;
}

export interface ColorEstimatedData {
  color: { r: number; g: number; b: number };
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

export type EventData =
  | BeginProductCreatedData
  | ColorEstimatedData
  | ProductWeightSetData
  | ProductReadyToBeCreatedData
  | ProductCreatedData
  | ProductCreateFailedData;

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
  color?: { r: number; g: number; b: number };
  weight?: string;
  shopifyVariantId?: string;
  errorMessage?: string;
  failureCount?: number;
}
