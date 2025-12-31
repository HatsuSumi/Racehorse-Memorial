import { CONFIG } from '../../config/config.js';

function _getSortableConfigForYear(year) {
    const cfg = CONFIG.sortableColumns ? CONFIG.sortableColumns[String(year)] : null;
    return cfg || {};
}

export function isColumnSortable(year, colKey) {
    const cfg = _getSortableConfigForYear(year);
    return !!(cfg && cfg[colKey]);
}

export function getColumnSortType(year, colKey) {
    const cfg = _getSortableConfigForYear(year);
    const spec = cfg ? cfg[colKey] : null;
    return spec ? spec.type : null;
}

export function getSortableColumnsForYear(year) {
    const cfg = _getSortableConfigForYear(year);
    return Object.keys(cfg || {});
}

function _toTimeOrNull(value, { allowFlex } = { allowFlex: false }) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;

    // 1) 标准 YYYY-MM-DD
    const mIso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mIso) {
        const y = Number(mIso[1]);
        const mo = Number(mIso[2]);
        const d = Number(mIso[3]);
        const t = Date.UTC(y, mo - 1, d);
        return Number.isFinite(t) ? t : null;
    }

    if (!allowFlex) return null;

    // 2) 宽松 YYYY/M/D（可能出现在“范围/不晚于”字符串中）
    const mSlash = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (mSlash) {
        const y = Number(mSlash[1]);
        const mo = Number(mSlash[2]);
        const d = Number(mSlash[3]);
        const t = Date.UTC(y, mo - 1, d);
        return Number.isFinite(t) ? t : null;
    }

    return null;
}

function _toAgeOrNull(value) {
    if (value == null) return null;
    const s = String(value).trim();
    const m = s.match(/(\d+)\s*岁/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}

function _toNumberOrNull(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;
    // 允许 "1,234" 这种格式；其余字符直接丢弃会有风险，所以这里只取“第一段数字”
    const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
}

function _extractComparableValue(type, raw) {
    switch (type) {
        case 'date':
            return _toTimeOrNull(raw, { allowFlex: false });
        case 'flexDate':
            return _toTimeOrNull(raw, { allowFlex: true });
        case 'age':
            return _toAgeOrNull(raw);
        case 'number':
            return _toNumberOrNull(raw);
        default:
            return null;
    }
}

export function sortDataForYear(data, year, sortState) {
    if (!Array.isArray(data)) return [];
    if (!sortState || !sortState.key || !sortState.direction) return [...data];

    const colKey = sortState.key;
    const direction = sortState.direction === 'desc' ? 'desc' : 'asc';
    const type = getColumnSortType(year, colKey);
    if (!type) return [...data];

    const sign = direction === 'desc' ? -1 : 1;
    const arr = [...data];

    // 稳定排序：记录原始 index 作为最后兜底
    const decorated = arr.map((row, idx) => {
        const raw = row ? row[colKey] : null;
        let v = null;

        switch (type) {
            case 'money':
                v = _moneyToBaseOrNull(raw);
                break;
            case 'record': {
                const metric = sortState.metric || 'winRate';
                const rec = _parseRecordOrNull(raw);
                v = _recordMetricOrNull(rec, metric);
                break;
            }
            default:
                v = _extractComparableValue(type, raw);
                break;
        }
        return { row, idx, v };
    });

    decorated.sort((a, b) => {
        const av = a.v;
        const bv = b.v;

        const aNull = av == null || !Number.isFinite(av);
        const bNull = bv == null || !Number.isFinite(bv);
        if (aNull && bNull) return a.idx - b.idx;
        if (aNull) return 1; // 无法解析的永远排最后
        if (bNull) return -1;

        if (av < bv) return -1 * sign;
        if (av > bv) return 1 * sign;
        return a.idx - b.idx;
    });

    return decorated.map(x => x.row);
}

/**
 * 从“战绩”原始字符串中提取指定指标的数值（用于 UI 展示/角标等）。
 * @param {unknown} raw - 原始战绩字符串（如 "37-11-4-3"）
 * @param {string} metric - 指标（winRate/placeRate/showRate/...）
 * @returns {number|null}
 */
export function getRecordMetricValueFromRaw(raw, metric) {
    const rec = _parseRecordOrNull(raw);
    return _recordMetricOrNull(rec, metric);
}

// ===================== 复杂类型：money / record =====================

function _detectCurrencyCode(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    // 优先匹配更长的中文词
    const map = [
        { re: /(瑞典克朗|SEK)\s*$/i, code: 'SEK' },
        { re: /(挪威克朗|NOK)\s*$/i, code: 'NOK' },
        { re: /(英镑|GBP)\s*$/i, code: 'GBP' },
        { re: /(欧元|EUR)\s*$/i, code: 'EUR' },
        { re: /(澳大利亚元|澳元|A\$|AUD)\s*$/i, code: 'AUD' },
        { re: /(港币|港元|HKD)\s*$/i, code: 'HKD' },
        { re: /(美元|美金|USD)\s*$/i, code: 'USD' },
        { re: /(日圆|日元|円|JPY)\s*$/i, code: 'JPY' },
        // “元”非常歧义（欧元/港元也以“元”结尾），因此仅作为最后兜底
        { re: /(人民币|CNY|RMB|元)\s*$/i, code: 'CNY' }
    ];
    for (const it of map) {
        if (it.re.test(s)) return it.code;
    }
    return null;
}

function _stripCurrency(raw) {
    return String(raw ?? '')
        .replace(/(瑞典克朗|SEK|挪威克朗|NOK|英镑|GBP|欧元|EUR|澳大利亚元|澳元|A\$|AUD|港币|港元|HKD|美元|美金|USD|日圆|日元|円|JPY|人民币|CNY|RMB|元)\s*$/i, '')
        .trim();
}

function _parseChineseNumberWithUnits(str) {
    // 支持：6亿6126万8000 / 6320万8079 / 8000
    const s = String(str ?? '').replace(/,/g, '').trim();
    if (!s) return null;

    let total = 0;
    let rest = s;

    const yi = rest.match(/(\d+(?:\.\d+)?)\s*亿/);
    if (yi) {
        total += Number(yi[1]) * 1e8;
        rest = rest.replace(yi[0], '');
    }

    const wan = rest.match(/(\d+(?:\.\d+)?)\s*万/);
    if (wan) {
        total += Number(wan[1]) * 1e4;
        rest = rest.replace(wan[0], '');
    }

    const tailDigits = rest.match(/-?\d+(?:\.\d+)?/);
    if (tailDigits) {
        total += Number(tailDigits[0]);
    }

    return Number.isFinite(total) ? total : null;
}

function _moneyToBaseOrNull(raw) {
    const currency = _detectCurrencyCode(raw);
    if (!currency) return null;

    const rates = CONFIG.exchangeRates && CONFIG.exchangeRates.rates ? CONFIG.exchangeRates.rates : null;
    if (!rates || typeof rates[currency] !== 'number') return null;

    const n = _parseChineseNumberWithUnits(_stripCurrency(raw));
    if (n == null) return null;

    return n * rates[currency];
}

function _parseRecordOrNull(raw) {
    const s = String(raw ?? '').trim();
    // 37-11-4-3
    const m = s.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
    if (!m) return null;
    const starts = Number(m[1]);
    const win = Number(m[2]);
    const second = Number(m[3]);
    const third = Number(m[4]);
    if (![starts, win, second, third].every(Number.isFinite)) return null;
    return { starts, win, second, third };
}

function _recordMetricOrNull(rec, metric) {
    if (!rec) return null;
    const { starts, win, second, third } = rec;
    if (!Number.isFinite(starts) || starts <= 0) {
        if (metric === 'starts' || metric === 'win' || metric === 'second' || metric === 'third') {
            return Number.isFinite(starts) ? starts : null;
        }
        return null;
    }

    const placed = win + second;
    const showed = win + second + third;
    const unplaced = starts - showed;

    switch (metric) {
        case 'winRate': return win / starts;
        case 'starts': return starts;
        case 'win': return win;
        case 'second': return second;
        case 'third': return third;
        case 'placeRate': return placed / starts;
        case 'showRate': return showed / starts;
        case 'unplaced': return unplaced;
        default: return null;
    }
}
