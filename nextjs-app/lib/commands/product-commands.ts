import { loadEvents, insertEvent } from '@/lib/db/user-db';
import { replayEvents } from './event-replay';
import {
  BeginCreateProductCommand,
  RecordProductColorCommand,
  SetEstimatedColorCommand,
  SetColorV2Command,
  FinishCreateProductCommand,
  RecordProductCreatedInShopifyCommand,
  RecordProductFailedInShopifyCommand,
  RecordProductImageProcessedCommand,
  RecordProductImageProcessingFailedCommand
} from '@/types/commands';

export function handleBeginCreateProduct(command: BeginCreateProductCommand): void {
  const { userId, aggregateId, shopifyProductId, shopifyProductTitle, photoBlob, photoMimeType } = command;

  // Load existing events (should be none for new aggregate)
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Cannot begin if already started
  if (state.status !== 'not-started') {
    throw new Error('Product creation already started');
  }

  // Convert base64 to buffer
  const photoBuffer = Buffer.from(photoBlob, 'base64');

  // Insert BeginProductCreated event
  insertEvent(userId, {
    aggregateId,
    eventType: 'BeginProductCreated',
    eventData: JSON.stringify({
      shopifyProductId,
      shopifyProductTitle,
      photoMimeType
    }),
    photoBlob: photoBuffer,
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductColor(command: RecordProductColorCommand): void {
  // DEPRECATED: This command is deprecated, use SetColorV2 instead
  throw new Error('This command is deprecated. Use SetColorV2 instead.');
}

export function handleSetEstimatedColor(command: SetEstimatedColorCommand): void {
  const { userId, aggregateId, color } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Insert ColorEstimated event
  insertEvent(userId, {
    aggregateId,
    eventType: 'ColorEstimated',
    eventData: JSON.stringify({ color }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleSetColorV2(command: SetColorV2Command): void {
  const { userId, aggregateId, colorName } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Insert ColorSetV2 event (no validations as requested)
  insertEvent(userId, {
    aggregateId,
    eventType: 'ColorSetV2',
    eventData: JSON.stringify({ colorName }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleFinishCreateProduct(command: FinishCreateProductCommand): void {
  const { userId, aggregateId, weight } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
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
  insertEvent(userId, {
    aggregateId,
    eventType: 'ProductWeightSet',
    eventData: JSON.stringify({ weight }),
    timestamp: Date.now(),
    version: currentVersion + 1
  });

  // Insert ProductReadyToBeCreated event
  insertEvent(userId, {
    aggregateId,
    eventType: 'ProductReadyToBeCreated',
    eventData: JSON.stringify({}),
    timestamp: Date.now(),
    version: currentVersion + 2
  });
}

export function handleRecordProductCreatedInShopify(command: RecordProductCreatedInShopifyCommand): void {
  const { userId, aggregateId, shopifyVariantId, createdAt } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must be in creating status
  if (state.status !== 'creating') {
    throw new Error('Product not in creating status');
  }

  // Insert ProductCreated event
  insertEvent(userId, {
    aggregateId,
    eventType: 'ProductCreated',
    eventData: JSON.stringify({ shopifyVariantId, createdAt }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductFailedInShopify(command: RecordProductFailedInShopifyCommand): void {
  const { userId, aggregateId, errorMessage, attemptNumber } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must be in creating status (or already failed and retrying)
  if (state.status !== 'creating' && state.status !== 'failed') {
    throw new Error('Product not in creating or failed status');
  }

  // Insert ProductCreateFailed event
  insertEvent(userId, {
    aggregateId,
    eventType: 'ProductCreateFailed',
    eventData: JSON.stringify({ errorMessage, attemptNumber }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductImageProcessed(command: RecordProductImageProcessedCommand): void {
  const { userId, aggregateId, imageBlob, mimeType, backgroundHex, model, sizePx } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Convert base64 to buffer
  const imageBuffer = Buffer.from(imageBlob, 'base64');

  // Insert ProductImageProcessed event
  insertEvent(userId, {
    aggregateId,
    eventType: 'ProductImageProcessed',
    eventData: JSON.stringify({ mimeType, backgroundHex, model, sizePx }),
    photoBlob: imageBuffer,
    timestamp: Date.now(),
    version: events.length + 1
  });
}

export function handleRecordProductImageProcessingFailed(command: RecordProductImageProcessingFailedCommand): void {
  const { userId, aggregateId, errorMessage, attemptNumber } = command;

  // Load existing events
  const events = loadEvents(userId, aggregateId);
  const state = replayEvents(events);

  // Validate: Must have started product creation
  if (state.status === 'not-started') {
    throw new Error('Product creation not started');
  }

  // Insert ProductImageProcessingFailed event
  insertEvent(userId, {
    aggregateId,
    eventType: 'ProductImageProcessingFailed',
    eventData: JSON.stringify({ errorMessage, attemptNumber }),
    timestamp: Date.now(),
    version: events.length + 1
  });
}
