import {
  defineManagedConversionProvider,
  type ManagedConversionProviderDefinition,
} from '../../provider-definition.ts';

type ManualExportConfig = {
  mode: 'live';
};

type ManualExportRequest = {
  delivery_mode: 'manual';
};

export const manualExportProviderDefinition = defineManagedConversionProvider({
  key: 'manual_export',
  label: 'Manual Export',
  modes: ['live'],
  configFields: [],
  parseConfig: () => ({ mode: 'live' }),
  getMode: (config) => config.mode,
  buildPayload({ context }) {
    return {
      ok: true,
      request: {
        delivery_mode: 'manual',
      },
      signalKeys: context.item.signal_keys,
      warnings:
        context.destination.delivery_mode === 'manual'
          ? []
          : ['Manual export destination is not configured with manual delivery mode.'],
    };
  },
  async deliver({ context }) {
    return {
      status: 'manual',
      message: `${context.destination.destination_label} is ready for manual conversion export; no provider API was called.`,
      payload: {
        delivery_mode: context.destination.delivery_mode,
      },
    };
  },
} satisfies ManagedConversionProviderDefinition<ManualExportConfig, ManualExportRequest>);
