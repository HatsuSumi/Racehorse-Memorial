const APP_STORAGE_KEY = 'Racehorse-Memorial';

function _safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch (_) {
        return null;
    }
}

function _isPlainObject(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
}

function _defaultState() {
    return {
        theme: null,
        exchangeRates: {}
    };
}

function _loadState() {
    let raw = null;
    try {
        raw = localStorage.getItem(APP_STORAGE_KEY);
    } catch (_) {
        return _defaultState();
    }

    if (!raw) return _defaultState();

    const parsed = _safeJsonParse(raw);
    if (!_isPlainObject(parsed)) return _defaultState();

    const state = _defaultState();
    if (typeof parsed.theme === 'string') state.theme = parsed.theme;
    if (_isPlainObject(parsed.exchangeRates)) state.exchangeRates = parsed.exchangeRates;
    return state;
}

function _saveState(state) {
    if (!_isPlainObject(state)) return false;
    try {
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (_) {
        return false;
    }
}

export function getTheme() {
    const state = _loadState();
    return typeof state.theme === 'string' ? state.theme : null;
}

export function setTheme(theme) {
    const t = typeof theme === 'string' ? theme : null;
    const state = _loadState();
    state.theme = t;
    return _saveState(state);
}

export function getExchangeRatesEntry(base, ttlMs) {
    const b = String(base || '').trim().toUpperCase();
    if (!b) return null;

    const state = _loadState();
    const entry = state.exchangeRates ? state.exchangeRates[b] : null;
    if (!_isPlainObject(entry)) return null;

    const fetchedAt = Number(entry.fetchedAt);
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;

    const rates = entry.rates;
    if (!_isPlainObject(rates)) return null;

    if (typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0) {
        const age = Date.now() - fetchedAt;
        if (age < 0 || age > ttlMs) return null;
    }

    return { fetchedAt, rates };
}

export function setExchangeRatesEntry(base, rates, fetchedAt = Date.now()) {
    const b = String(base || '').trim().toUpperCase();
    if (!b) return false;
    if (!_isPlainObject(rates)) return false;

    const fa = Number(fetchedAt);
    const ts = Number.isFinite(fa) && fa > 0 ? fa : Date.now();

    const state = _loadState();
    const nextExchange = _isPlainObject(state.exchangeRates) ? state.exchangeRates : {};
    nextExchange[b] = { fetchedAt: ts, rates };
    state.exchangeRates = nextExchange;
    return _saveState(state);
}
