import { loadEvents, insertEvent } from '@/lib/db/tenant-db';
import { replayEvents } from './event-replay';
import {
  BeginCreateProductCommand,
  SetEstimatedColorCommand,
  SetColorV2Command,
  FinishCreateProductCommand,
  RecordProductCreatedInShopifyCommand,
  RecordProductFailedInShopifyCommand,
  RecordProductImageProcessedCommand,
  RecordProductImageProcessingFailedCommand
} from '@/types/commands';

export function handleBeginCreateProduct(tenantId: string, command: BeginCreateProductCommand): void {
  const { aggregateId, shopifyProductId, shopifyProductTitle, photoBlob, photoMimeType, createdByUserId } = command;

  // Load existing events (should be none for new aggregate)
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Cannot begin if already started
  if (state.status !== 'not-started') {
    throw new Error('Product creation already started');
  }

  // Convert base64 to buffer
  const photoBuffer = Buffer.from(photoBlob, 'base64');

  // Insert BeginProductCreated event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'BeginProductCreated',
    eventData: JSON.stringify({
      shopifyProductId,
      shopifyProductTitle,
      photoMimeType,
      createdByUserId
    }),
    photoBlob: photoBuffer,
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleSetEstimatedColor(tenantId: string, command: SetEstimatedColorCommand): void {
  const { aggregateId, color } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Insert ColorEstimated event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ColorEstimated',
    eventData: JSON.stringify({ color }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleSetColorV2(tenantId: string, command: SetColorV2Command): void {
  const { aggregateId, colorName } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Insert ColorSetV2 event (no validations as requested)
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ColorSetV2',
    eventData: JSON.stringify({ colorName }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleFinishCreateProduct(tenantId: string, command: FinishCreateProductCommand): void {
  const { aggregateId, weight } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Validate: Cannot finish if already creating/created
  if (state.status === 'creating' || state.status === 'created') {
    throw new Error('Product already submitted for creation');
  }

  const currentVersion = events.length;

  // Insert ProductWeightSet event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ProductWeightSet',
    eventData: JSON.stringify({ weight }),
    timestamp: Date.now(),
    version: currentVersion + 1
  });

  // Insert ProductReadyToBeCreated event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ProductReadyToBeCreated',
    eventData: JSON.stringify({}),
    timestamp: Date.now(),
    version: currentVersion + 2
  });
}

export function handleRecordProductCreatedInShopify(tenantId: string, command: RecordProductCreatedInShopifyCommand): void {
  const { aggregateId, shopifyVariantId, createdAt } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must be in creating status
  if (state.status !== 'creating') {
    throw new Error('Product not in creating status');
  }

  // Insert ProductCreated event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ProductCreated',
    eventData: JSON.stringify({ shopifyVariantId, createdAt }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductFailedInShopify(tenantId: string, command: RecordProductFailedInShopifyCommand): void {
  const { aggregateId, errorMessage, attemptNumber } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must be in creating status (or already failed and retrying)
  if (state.status !== 'creating' && state.status !== 'failed') {
    throw new Error('Product not in creating or failed status');
  }

  // Insert ProductCreateFailed event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ProductCreateFailed',
    eventData: JSON.stringify({ errorMessage, attemptNumber }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductImageProcessed(tenantId: string, command: RecordProductImageProcessedCommand): void {
  const { aggregateId, imageBlob, mimeType, backgroundHex, model, sizePx } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Convert base64 to buffer
  const imageBuffer = Buffer.from(imageBlob, 'base64');

  // Insert ProductImageProcessed event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ProductImageProcessed',
    eventData: JSON.stringify({ mimeType, backgroundHex, model, sizePx }),
    photoBlob: imageBuffer,
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductImageProcessingFailed(tenantId: string, command: RecordProductImageProcessingFailedCommand): void {
  const { aggregateId, errorMessage, attemptNumber } = command;

  // Load existing events
  const events = loadEvents(tenantId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Insert ProductImageProcessingFailed event
  insertEvent(tenantId, {
    aggregateId,
    eventType: 'ProductImageProcessingFailed',
    eventData: JSON.stringify({ errorMessage, attemptNumber }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}
