import type { ManagedConversionFeedbackAdapter } from '../../adapter-types.ts';

export function createManualConversionFeedbackAdapter(): ManagedConversionFeedbackAdapter {
  return {
    key: 'manual',
    label: 'Manual Export',
    canHandle(destination) {
      return destination.delivery_mode === 'manual';
    },
    async deliver({ destination }) {
      return {
        status: 'manual',
        message: `${destination.destination_label} is ready for manual conversion export; no provider API was called.`,
        payload: {
          delivery_mode: destination.delivery_mode,
        },
      };
    },
  };
}
