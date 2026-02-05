import { fetchTiingoBarsRaw, fetchTwelveDataBarsRaw } from './raw-providers.mjs';
import { fetchEodhdBarsRaw } from './eodhd-adapter.mjs';

const adapters = {
    tiingo: {
        fetchBars: fetchTiingoBarsRaw
    },
    twelvedata: {
        fetchBars: fetchTwelveDataBarsRaw
    },
    eodhd: {
        fetchBars: fetchEodhdBarsRaw
    }
};

export function getAdapter(id) {
    const adapter = adapters[id];
    if (!adapter) return null;
    return adapter;
}

export async function fetchBarsViaAdapter(id, symbol, env, options = {}) {
    const adapter = getAdapter(id);
    if (!adapter) {
        return {
            ok: false,
            provider: id,
            error: { code: 'ADAPTER_NOT_FOUND', message: `No adapter for ${id}` }
        };
    }
    return adapter.fetchBars(symbol, env, options);
}
