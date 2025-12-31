import { getExchangeRatesEntry, setExchangeRatesEntry } from '../shared/storage.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function _isPlainObject(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
}

function _toUpperCodes(codes) {
    const arr = Array.isArray(codes) ? codes : [];
    return Array.from(new Set(arr.map(x => String(x || '').trim().toUpperCase()).filter(Boolean)));
}

export function getCachedExchangeRates(base, ttlMs = DEFAULT_TTL_MS) {
    return getExchangeRatesEntry(base, ttlMs);
}

export function setCachedExchangeRates(base, rates) {
    return setExchangeRatesEntry(base, rates, Date.now());
}

function _withTimeoutSignal(timeoutMs) {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) return { signal: undefined, cleanup: () => {} };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(t)
    };
}

/**
 * 从 Frankfurter 拉取“以 base 为基准”的最新汇率。
 * 注意：Frankfurter 返回的是 1 base = x currency。
 * 我们项目内部需要的是 1 currency = x base，所以这里会做一次取倒数。
 */
export async function fetchLatestExchangeRatesFromFrankfurter(base, currencies, { timeoutMs = 5000 } = {}) {
    const b = String(base || '').trim().toUpperCase();
    if (!b) throw new Error('[ExchangeRateService] base is empty');

    const list = _toUpperCodes(currencies).filter(c => c !== b);

    // 没有要拉的币种：只返回 base=1
    if (list.length === 0) {
        return { rates: { [b]: 1 } };
    }

    const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(b)}&symbols=${encodeURIComponent(list.join(','))}`;

    const { signal, cleanup } = _withTimeoutSignal(timeoutMs);
    let res = null;
    try {
        res = await fetch(url, { method: 'GET', cache: 'no-store', signal });
    } finally {
        cleanup();
    }
    if (!res.ok) throw new Error(`[ExchangeRateService] rate api failed: ${res.status}`);

    const json = await res.json();
    if (!_isPlainObject(json) || !_isPlainObject(json.rates)) {
        throw new Error('[ExchangeRateService] invalid rate api response');
    }

    const apiRates = json.rates;

    const out = { [b]: 1 };
    for (const code of list) {
        const v = Number(apiRates[code]);
        if (!Number.isFinite(v) || v <= 0) continue;
        out[code] = 1 / v;
    }

    return { rates: out };
}

/**
 * 若缓存过期则尝试获取最新汇率。
 * 成功：返回最新 rates
 * 失败：返回 null（调用方应回退到 config 静态汇率）
 */
export async function refreshExchangeRatesIfNeeded({ base, currencies, ttlMs = DEFAULT_TTL_MS, force = false, timeoutMs = 5000 } = {}) {
    const b = String(base || '').trim().toUpperCase();
    if (!b) return null;

    if (!force) {
        const cached = getCachedExchangeRates(b, ttlMs);
        if (cached && cached.rates) return cached.rates;
    }

    try {
        const { rates } = await fetchLatestExchangeRatesFromFrankfurter(b, currencies, { timeoutMs });
        if (!_isPlainObject(rates) || typeof rates[b] !== 'number') return null;

        setCachedExchangeRates(b, rates);
        return rates;
    } catch (e) {
        console.warn('[ExchangeRateService] fetch latest failed, fallback to static config.', e);
        return null;
    }
}
