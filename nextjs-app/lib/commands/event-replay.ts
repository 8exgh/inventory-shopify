import { Event, ProductState } from '@/types/events';

export function replayEvents(events: Event[]): ProductState {
  let state: ProductState = { status: 'not-started' };

  for (const event of events) {
    const eventData = JSON.parse(event.event_data);

    switch (event.event_type) {
      case 'BeginProductCreated':
        state = {
          ...state,
          status: 'data-entry',
          shopifyProductId: eventData.shopifyProductId,
          shopifyProductTitle: eventData.shopifyProductTitle,
          photoMimeType: eventData.photoMimeType
        };
        break;

      case 'ColorEstimated':
        state = { ...state, estimatedColor: eventData.color };
        break;

      case 'ColorSetV2':
        state = { ...state, color: eventData.colorName };
        break;

      case 'ProductWeightSet':
        state = { ...state, weight: eventData.weight };
        break;

      case 'ProductReadyToBeCreated':
        state = { ...state, status: 'creating' };
        break;

      case 'ProductCreated':
        state = {
          ...state,
          status: 'created',
          shopifyVariantId: eventData.shopifyVariantId
        };
        break;

      case 'ProductCreateFailed':
        state = {
          ...state,
          status: 'failed',
          errorMessage: eventData.errorMessage,
          failureCount: (state.failureCount || 0) + 1
        };
        break;
    }
  }

  return state;
}
