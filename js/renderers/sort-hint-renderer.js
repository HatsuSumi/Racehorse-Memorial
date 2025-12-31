const currencyNameMap = {
    JPY: '日圆',
    USD: '美元',
    AUD: '澳元',
    HKD: '港元',
    CNY: '人民币',
    EUR: '欧元',
    GBP: '英镑',
    SEK: '瑞典克朗',
    NOK: '挪威克朗'
};

function _fmtRate(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return null;
    const rounded = Math.round(v * 10000) / 10000;
    return String(rounded);
}

export function renderSortHint({ el, year, sortableColumns, exchangeRatesConfig, updatedAt }) {
    if (!el) throw new Error('[SortHintRenderer] el is required');

    const cols = Array.isArray(sortableColumns) ? sortableColumns : [];
    if (cols.length === 0) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }

    el.style.display = 'block';

    const base = exchangeRatesConfig && exchangeRatesConfig.base ? String(exchangeRatesConfig.base) : '';
    const baseUpper = base ? base.toUpperCase() : '';
    const baseText = baseUpper === 'JPY' ? '日圆' : baseUpper;

    // 不包含“奖金”：纯文本
    if (!cols.includes('奖金')) {
        el.textContent = `${cols.join('、')} 列可以通过点击表头进行排序。`;
        return;
    }

    // 包含“奖金”：模板 + ⓘ Tooltip
    const tpl = document.getElementById('sort-hint-money-template');
    if (!tpl) throw new Error('[SortHintRenderer] #sort-hint-money-template not found');

    const frag = tpl.content.cloneNode(true);
    const root = frag.firstElementChild;
    const textEl = root ? root.querySelector('.sort-hint-text') : null;
    const infoBtn = root ? root.querySelector('.sort-hint-info') : null;
    if (!root || !textEl || !infoBtn) {
        throw new Error('[SortHintRenderer] invalid #sort-hint-money-template (missing .sort-hint-text/.sort-hint-info)');
    }

    const basePart = baseText ? `为${baseText}` : '为基准货币';
    textEl.textContent = `${cols.join('、')} 列可以通过点击表头进行排序。不同货币已按配置汇率折算${basePart}。`;

    const lines = [];
    if (updatedAt && Number.isFinite(updatedAt)) {
        lines.push(`更新时间：${new Date(updatedAt).toLocaleString()}（本地时间）`);
    } else {
        lines.push('更新时间：未能获取最新汇率，已使用配置文件内汇率');
    }
    if (baseUpper) lines.push(`基准：${baseUpper}${baseUpper === 'JPY' ? '（日圆）' : ''}`);

    const rates = exchangeRatesConfig && exchangeRatesConfig.rates ? exchangeRatesConfig.rates : null;
    if (rates && typeof rates === 'object') {
        const keys = Object.keys(rates).map(k => String(k).toUpperCase());
        keys.sort((a, b) => a.localeCompare(b));

        keys.forEach(code => {
            const v = _fmtRate(rates[code]);
            if (!v) return;

            const rhs = baseText || baseUpper || 'base';
            const cn = currencyNameMap[code];
            const left = cn ? `${cn}(${code})` : code;
            lines.push(`1${left}=${v}${rhs}`);
        });
    }

    infoBtn.dataset.tooltip = lines.join('\n');
    el.replaceChildren(frag);
}
