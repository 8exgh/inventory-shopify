import { loadEvents, loadAllEvents, getPhotoBlob } from '@/lib/db/tenant-db';
import { getTenantIds } from '@/lib/db/system';
import { replayEvents } from '@/lib/commands/event-replay';
import { ProductStateResult, StoreProduct, ProductTask, ProductDetails } from '@/types/queries';
import { Event } from '@/types/events';

function groupEventsByAggregate(events: Event[]): Map<string, Event[]> {
  const eventsByAggregate: Map<string, Event[]> = new Map();
  for (const event of events) {
    if (!eventsByAggregate.has(event.aggregate_id)) {
      eventsByAggregate.set(event.aggregate_id, []);
    }
    eventsByAggregate.get(event.aggregate_id)!.push(event);
  }
  return eventsByAggregate;
}

export function getProductState(tenantId: string, aggregateId: string): ProductStateResult | null {
  const events = loadEvents(tenantId, aggregateId);
  if (events.length === 0) {
    return null;
  }

  const state = replayEvents(events);

  if (state.status === 'not-started') {
    return null;
  }

  return {
    status: state.status as 'data-entry' | 'creating' | 'created' | 'failed',
    shopifyProductId: state.shopifyProductId!,
    shopifyProductTitle: state.shopifyProductTitle!,
    estimatedColor: state.estimatedColor,
    color: state.color,
    weight: state.weight,
    errorMessage: state.errorMessage,
    imageProcessed: state.imageProcessed || false,
    imageProcessingFailureCount: state.imageProcessingFailureCount || 0,
    imageProcessingError: state.imageProcessingError
  };
}

export function getStoreProducts(tenantId: string): StoreProduct[] {
  const eventsByAggregate = groupEventsByAggregate(loadAllEvents(tenantId));

  // Replay each aggregate's events and build product list
  const products: StoreProduct[] = [];
  for (const [aggregateId, events] of eventsByAggregate) {
    const state = replayEvents(events);
    if (state.status !== 'not-started' && state.shopifyProductTitle) {
      products.push({
        aggregateId,
        status: state.status as 'data-entry' | 'creating' | 'created' | 'failed',
        shopifyProductTitle: state.shopifyProductTitle,
        createdByUserId: state.createdByUserId
      });
    }
  }

  return products;
}

export function getProductsNeedingColorEstimation(): ProductTask[] {
  const tasks: ProductTask[] = [];

  for (const tenantId of getTenantIds()) {
    const eventsByAggregate = groupEventsByAggregate(loadAllEvents(tenantId));

    // Find aggregates that have BeginProductCreated but no ColorEstimated
    for (const [aggregateId, events] of eventsByAggregate) {
      const hasBegun = events.some(e => e.event_type === 'BeginProductCreated');
      const hasColor = events.some(e => e.event_type === 'ColorEstimated');

      if (hasBegun && !hasColor) {
        tasks.push({ tenantId, aggregateId });
      }
    }
  }

  return tasks;
}

export const MAX_IMAGE_PROCESSING_ATTEMPTS = 5;

export function getProductsNeedingImageProcessing(): ProductTask[] {
  const tasks: ProductTask[] = [];

  for (const tenantId of getTenantIds()) {
    const eventsByAggregate = groupEventsByAggregate(loadAllEvents(tenantId));

    // Find aggregates that have a photo but no processed image, and have not
    // exhausted their retries
    for (const [aggregateId, events] of eventsByAggregate) {
      const state = replayEvents(events);

      const hasBegun = events.some(e => e.event_type === 'BeginProductCreated');
      const hasProcessed = events.some(e => e.event_type === 'ProductImageProcessed');
      const failureCount = state.imageProcessingFailureCount || 0;

      if (hasBegun && !hasProcessed && failureCount < MAX_IMAGE_PROCESSING_ATTEMPTS) {
        tasks.push({ tenantId, aggregateId });
      }
    }
  }

  return tasks;
}

export function getProductsToCreateInShopify(): ProductTask[] {
  const tasks: ProductTask[] = [];

  for (const tenantId of getTenantIds()) {
    const eventsByAggregate = groupEventsByAggregate(loadAllEvents(tenantId));

    // Find aggregates that are ready but not created and have fewer than 5 failures
    for (const [aggregateId, events] of eventsByAggregate) {
      const state = replayEvents(events);

      const hasReadyEvent = events.some(e => e.event_type === 'ProductReadyToBeCreated');
      const hasCreatedEvent = events.some(e => e.event_type === 'ProductCreated');
      // Shopify receives the processed image, so creation waits for it
      const hasProcessedImage = events.some(e => e.event_type === 'ProductImageProcessed');
      const failureCount = state.failureCount || 0;

      if (hasReadyEvent && !hasCreatedEvent && hasProcessedImage && failureCount < 5) {
        tasks.push({ tenantId, aggregateId });
      }
    }
  }

  return tasks;
}

export function getProductDetailsForShopify(tenantId: string, aggregateId: string): ProductDetails | null {
  const events = loadEvents(tenantId, aggregateId);
  if (events.length === 0) {
    return null;
  }

  const state = replayEvents(events);

  if (!state.shopifyProductId || !state.shopifyProductTitle) {
    return null;
  }

  return {
    shopifyProductId: state.shopifyProductId,
    shopifyProductTitle: state.shopifyProductTitle,
    estimatedColor: !state.estimatedColor ? null : state.estimatedColor,
    color: !state.color ? null : state.color,
    weight: !state.weight ? null : state.weight
  };
}

export function getProductImage(
  tenantId: string,
  aggregateId: string,
  variant: 'original' | 'processed' = 'original'
): { blob: Buffer; mimeType: string } | null {
  const events = loadEvents(tenantId, aggregateId);
  if (events.length === 0) {
    return null;
  }

  const state = replayEvents(events);

  const eventType = variant === 'processed' ? 'ProductImageProcessed' : 'BeginProductCreated';
  const mimeType = variant === 'processed' ? state.processedImageMimeType : state.photoMimeType;
  const photoBlob = getPhotoBlob(tenantId, aggregateId, eventType);

  if (!photoBlob || !mimeType) {
    return null;
  }

  return {
    blob: photoBlob,
    mimeType
  };
}
