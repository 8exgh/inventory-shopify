import { loadEvents, loadAllEvents, getPhotoBlob, getEventCount, getAllUserDatabases } from '@/lib/db/user-db';
import { replayEvents } from '@/lib/commands/event-replay';
import { ProductStateResult, UserProduct, ProductTask, ProductDetails } from '@/types/queries';
import { Event } from '@/types/events';

export function getProductState(userId: string, aggregateId: string): ProductStateResult | null {
  const events = loadEvents(userId, aggregateId);
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
    errorMessage: state.errorMessage
  };
}

export function getUserProducts(userId: string): UserProduct[] {
  const allEvents = loadAllEvents(userId);

  // Group events by aggregateId
  const eventsByAggregate: Map<string, Event[]> = new Map();
  for (const event of allEvents) {
    if (!eventsByAggregate.has(event.aggregate_id)) {
      eventsByAggregate.set(event.aggregate_id, []);
    }
    eventsByAggregate.get(event.aggregate_id)!.push(event);
  }

  // Replay each aggregate's events and build product list
  const products: UserProduct[] = [];
  for (const [aggregateId, events] of eventsByAggregate) {
    const state = replayEvents(events);
    if (state.status !== 'not-started' && state.shopifyProductTitle) {
      products.push({
        aggregateId,
        status: state.status as 'data-entry' | 'creating' | 'created' | 'failed',
        shopifyProductTitle: state.shopifyProductTitle
      });
    }
  }

  return products;
}

export function getProductsNeedingColorEstimation(): ProductTask[] {
  const tasks: ProductTask[] = [];
  const userIds = getAllUserDatabases();

  for (const userId of userIds) {
    const allEvents = loadAllEvents(userId);

    // Group events by aggregateId
    const eventsByAggregate: Map<string, Event[]> = new Map();
    for (const event of allEvents) {
      if (!eventsByAggregate.has(event.aggregate_id)) {
        eventsByAggregate.set(event.aggregate_id, []);
      }
      eventsByAggregate.get(event.aggregate_id)!.push(event);
    }

    // Find aggregates that have BeginProductCreated but no ColorEstimated
    for (const [aggregateId, events] of eventsByAggregate) {
      const hasBegun = events.some(e => e.event_type === 'BeginProductCreated');
      const hasColor = events.some(e => e.event_type === 'ColorEstimated');

      if (hasBegun && !hasColor) {
        tasks.push({ userId, aggregateId });
      }
    }
  }

  return tasks;
}

export function getProductsToCreateInShopify(): ProductTask[] {
  const tasks: ProductTask[] = [];
  const userIds = getAllUserDatabases();

  for (const userId of userIds) {
    const allEvents = loadAllEvents(userId);

    // Group events by aggregateId
    const eventsByAggregate: Map<string, Event[]> = new Map();
    for (const event of allEvents) {
      if (!eventsByAggregate.has(event.aggregate_id)) {
        eventsByAggregate.set(event.aggregate_id, []);
      }
      eventsByAggregate.get(event.aggregate_id)!.push(event);
    }

    // Find aggregates that are ready but not created and have fewer than 5 failures
    for (const [aggregateId, events] of eventsByAggregate) {
      const state = replayEvents(events);

      const hasReadyEvent = events.some(e => e.event_type === 'ProductReadyToBeCreated');
      const hasCreatedEvent = events.some(e => e.event_type === 'ProductCreated');
      const failureCount = state.failureCount || 0;

      if (hasReadyEvent && !hasCreatedEvent && failureCount < 5) {
        tasks.push({ userId, aggregateId });
      }
    }
  }

  return tasks;
}

export function getProductDetailsForShopify(userId: string, aggregateId: string): ProductDetails | null {
  const events = loadEvents(userId, aggregateId);
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

export function getProductImage(userId: string, aggregateId: string): { blob: Buffer; mimeType: string } | null {
  const events = loadEvents(userId, aggregateId);
  if (events.length === 0) {
    return null;
  }

  const state = replayEvents(events);
  const photoBlob = getPhotoBlob(userId, aggregateId);

  if (!photoBlob || !state.photoMimeType) {
    return null;
  }

  return {
    blob: photoBlob,
    mimeType: state.photoMimeType
  };
}
