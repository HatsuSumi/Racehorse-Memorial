import { getExchangeRatesEntry } from '../shared/storage.js';
import { refreshExchangeRatesIfNeeded } from '../services/exchange-rate-service.js';

export function initExchangeRateController({ exchangeRatesConfig, onUpdated } = {}) {
    if (!exchangeRatesConfig) throw new Error('[ExchangeRateController] exchangeRatesConfig is required');
    if (typeof onUpdated !== 'function') throw new Error('[ExchangeRateController] onUpdated must be a function');

    const base = exchangeRatesConfig.base;
    const rates = exchangeRatesConfig.rates;
    if (!base || !rates) return { getUpdatedAt: () => null };

    let updatedAt = null;

    const cached = getExchangeRatesEntry(base);
    if (cached && cached.fetchedAt) {
        updatedAt = cached.fetchedAt;
    }

    // 每次打开页面都尝试更新一次（后台更新，不阻塞首屏）
    const currencies = Object.keys(rates || {});
    refreshExchangeRatesIfNeeded({ base, currencies, force: true, timeoutMs: 5000 }).then((latest) => {
        if (!latest) {
            onUpdated({ rates: null, fetchedAt: updatedAt });
            return;
        }

        // exchange-rate-service 会写入 storage；这里读取 fetchedAt 用于展示
        exchangeRatesConfig.rates = latest;
        const after = getExchangeRatesEntry(base);
        updatedAt = after && after.fetchedAt ? after.fetchedAt : Date.now();
        onUpdated({ rates: latest, fetchedAt: updatedAt });
    });

    return {
        getUpdatedAt: () => updatedAt
    };
}
