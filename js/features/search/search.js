/**
 * 搜索服务模块
 * 负责处理搜索逻辑、高亮和导航
 */
import { customSmoothScrollTo } from '../../shared/utils.js';

export class SearchService {
    constructor() {
        // DOM 元素（Fail Fast：任何一个不存在都直接报错）
        this.input = document.getElementById('search-input');
        this.countDisplay = document.getElementById('search-count');
        this.container = document.getElementById('search-container');
        this.highlightTemplate = document.getElementById('search-highlight-template');

        if (!this.input) throw new Error('[SearchService] #search-input not found');
        if (!this.countDisplay) throw new Error('[SearchService] #search-count not found');
        if (!this.container) throw new Error('[SearchService] #search-container not found');
        if (!this.highlightTemplate) throw new Error('[SearchService] #search-highlight-template not found');
        if (!this.highlightTemplate.content || !this.highlightTemplate.content.firstElementChild) {
            throw new Error('[SearchService] #search-highlight-template is empty');
        }

        this.options = {
            wholeWord: document.getElementById('opt-whole-word'),
            ignoreCase: document.getElementById('opt-ignore-case'),
            ignoreKana: document.getElementById('opt-ignore-kana'),
            regex: document.getElementById('opt-regex')
        };

        // Fail Fast：选项不存在也直接报错（避免事件绑定时 NPE）
        Object.entries(this.options).forEach(([key, el]) => {
            if (!el) throw new Error(`[SearchService] missing option checkbox: ${key}`);
        });
        
        // 状态
        this.matches = []; // 存储所有匹配的 DOM 元素 (mark 标签)
        this.currentIndex = -1; // 当前选中的索引
        this.debounceTimer = null;
        this.isComposing = false; // 处理输入法 (IME) 状态

        // 能力检测：用于“全词匹配”的 Unicode 边界（需要 lookbehind + Unicode property escapes）
        this._supportsUnicodeWholeWord = (() => {
            try {
                // eslint-disable-next-line no-new
                new RegExp('(?<![\\p{L}\\p{N}_])a(?![\\p{L}\\p{N}_])', 'u');
                return true;
            } catch (_) {
                return false;
            }
        })();

        // 用于避免“正在淡出时又被显示”导致的误清空
        this._countHideToken = 0;
        
        // 绑定事件
        this._bindEvents();
    }

    _bindEvents() {
        // 输入框事件
        this.input.addEventListener('input', () => {
            if (!this.isComposing) this._debounceSearch();
        });
        
        // 处理中文输入法
        this.input.addEventListener('compositionstart', () => { this.isComposing = true; });
        this.input.addEventListener('compositionend', () => {
            this.isComposing = false;
            this._debounceSearch();
        });

        // 选项变更立即触发搜索
        Object.values(this.options).forEach(checkbox => {
            checkbox.addEventListener('change', () => this.search());
        });

        // 键盘导航
        this.input.addEventListener('keydown', this._handleKeydown.bind(this));
    }

    _debounceSearch() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.search(), 300);
    }

    _handleKeydown(e) {
        switch (e.key) {
            // Enter / ArrowDown: 下一个
            case 'Enter':
            case 'ArrowDown':
                e.preventDefault();
                this.navigate(1);
                break;
            // ArrowUp: 上一个
            case 'ArrowUp':
                e.preventDefault();
                this.navigate(-1);
                break;
            default:
                break;
        }
    }

    /**
     * 执行搜索
     */
    search() {
        const query = this.input.value.trim();
        this._clearHighlights();
        this.matches = [];
        this.currentIndex = -1;

        if (!query) {
            this._updateCount();
            return;
        }

        const tableBody = document.querySelector('#table-wrapper tbody');
        if (!tableBody) return;

        // 构建搜索正则
        let regex;
        try {
            regex = this._buildRegex(query);
            this.input.classList.remove('is-invalid'); // 移除错误样式（如果有）
            this.countDisplay.classList.remove('invalid');
        } catch (e) {
            console.warn('Invalid Regex:', e);
            this.input.classList.add('is-invalid'); // Fail Fast: 可视化报错

            // 计数位给出明确反馈（否则用户会觉得“坏了/没反应”）
            let hint = '条件无效';
            if (this.options.regex.checked) hint = '正则无效';
            if (typeof e?.message === 'string' && e.message.includes('全词匹配')) hint = '全词不支持';

            this._showCount(hint, false);
            this.countDisplay.classList.add('invalid');
            return;
        }

        // 遍历单元格进行搜索
        // 性能优化：只搜索可见的文本节点
        const walker = document.createTreeWalker(
            tableBody, 
            NodeFilter.SHOW_TEXT, 
            null, 
            false
        );

        let node;
        const nodesToHighlight = [];

        while (node = walker.nextNode()) {
            // 跳过已有的 mark 标签内的文本（防止重复高亮）以及 script/style 等
            if (node.parentNode.tagName === 'MARK' || 
                node.parentNode.tagName === 'SCRIPT' || 
                node.parentNode.tagName === 'STYLE') {
                continue;
            }

            const text = node.nodeValue;
            let normalizedText = text;
            
            // 如果开启忽略假名，对原文也进行归一化处理以便匹配
            if (this.options.ignoreKana.checked) {
                normalizedText = this._normalizeKana(text);
            }

            if (regex.test(normalizedText)) {
                nodesToHighlight.push({ node, text });
            }
        }

        // 批量应用高亮
        nodesToHighlight.forEach(({ node, text }) => {
            this._highlightNode(node, text, regex);
        });

        // 收集所有高亮元素
        this.matches = Array.from(tableBody.querySelectorAll('mark.search-highlight'));
        
        this._updateCount();
        
        // 如果有结果，自动选中第一个
        if (this.matches.length > 0) {
            this.navigate(1); // 这里的 1 代表初始化到第一个（索引0）
        }
    }

    /**
     * 高亮单个文本节点
     */
    _highlightNode(node, text, regex) {
        const parent = node.parentNode;
        const globalFlags = regex.flags.includes('g') ? regex.flags : (regex.flags + 'g');
        const globalRegex = new RegExp(regex.source, globalFlags);
        
        let matchResult;
        const matches = [];
        
        // 对原始文本进行匹配（注意：如果是 ignoreKana 且我们正确构建了混合正则，这里能匹配上）
        // 如果是 ignoreKana 且我们是把原文转成片假名再匹配的... 那就无法定位原文坐标了。
        // 所以最佳策略是：构建一个“混合正则”去匹配原文。
        
        while ((matchResult = globalRegex.exec(text)) !== null) {
            matches.push({
                start: matchResult.index,
                end: matchResult.index + matchResult[0].length
            });
        }

        if (matches.length === 0) return;

        // 从后往前切割，保持索引有效
        for (let i = matches.length - 1; i >= 0; i--) {
            const { start, end } = matches[i];
            node.splitText(end);
            const mid = node.splitText(start); // mid 是我们要高亮的部分
            
            const mark = this._cloneHighlightElement(mid.textContent);
            
            parent.replaceChild(mark, mid);
            node = node; // node 现在指向第一段 (splitText 剩下的前部分)
        }
    }

    /**
     * 通过 <template> 克隆生成高亮元素
     * @param {string} textContent
     * @returns {HTMLElement} mark 元素
     */
    _cloneHighlightElement(textContent) {
        const mark = this.highlightTemplate.content.firstElementChild.cloneNode(true);
        mark.textContent = textContent;
        return mark;
    }

    /**
     * 构建正则表达式
     */
    _buildRegex(query) {
        let pattern = query;
        // 注意：这里不加 g，避免 RegExp#test 的 lastIndex 状态污染（高亮阶段再单独加 g）
        let flags = '';

        if (this.options.ignoreCase.checked) {
            flags += 'i';
        }

        if (!this.options.regex.checked) {
            // 转义正则特殊字符
            pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // 忽略平/片假名：将 query 中的假名转换为 [平|片] 字符组
            if (this.options.ignoreKana.checked) {
                pattern = this._kanaToRegexPattern(pattern);
            }
        }

        if (this.options.wholeWord.checked) {
            // “全词匹配”的语义：关键词作为独立词出现（前后不能是字母/数字/_）
            // - 纯英文数字下划线：用 \b 足够
            // - 其他语言：用 Unicode 边界（需要 lookbehind + \p{} + u 标志）
            if (/^[a-zA-Z0-9_]+$/.test(query)) {
                pattern = `\\b${pattern}\\b`;
            } else {
                if (!this._supportsUnicodeWholeWord) {
                    throw new Error('当前浏览器不支持“全词匹配”(Unicode 边界)。请关闭该选项，或改用正则表达式。');
                }
                if (!flags.includes('u')) flags += 'u';
                pattern = `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`;
            }
        }

        return new RegExp(pattern, flags);
    }

    /**
     * 将字符串中的平/片假名转换为字符组正则
     * 例： "ア" -> "[アあ]"
     */
    _kanaToRegexPattern(str) {
        return str.split('').map(char => {
            const code = char.charCodeAt(0);
            // 平假名: 3040-309F
            // 片假名: 30A0-30FF
            if (code >= 0x3041 && code <= 0x3096) { // 平 -> [平片]
                const kata = String.fromCharCode(code + 0x60);
                return `[${char}${kata}]`;
            } else if (code >= 0x30A1 && code <= 0x30F6) { // 片 -> [平片]
                const hira = String.fromCharCode(code - 0x60);
                return `[${hira}${char}]`;
            }
            return char;
        }).join('');
    }

    /**
     * 归一化假名（辅助函数，暂未用到，保留备用）
     */
    _normalizeKana(str) {
        return str.replace(/[\u3041-\u3096]/g, function(match) {
            var code = match.charCodeAt(0) + 0x60;
            return String.fromCharCode(code);
        });
    }

    /**
     * 清除所有高亮
     */
    _clearHighlights() {
        const marks = document.querySelectorAll('mark.search-highlight');
        marks.forEach(mark => {
            const parent = mark.parentNode;
            // 用字符串替换，浏览器会自动创建 TextNode（避免显式 createTextNode）
            mark.replaceWith(mark.textContent);
            parent.normalize(); // 合并相邻文本节点，避免 splitText 混乱
        });
        this.matches = [];
        this.currentIndex = -1;
    }

    _showCount(text, isActive) {
        // 任何一次“显示”都应当使之前的淡出回调失效
        this._countHideToken++;

        this.countDisplay.textContent = text;
        this.countDisplay.classList.add('visible');
        this.countDisplay.classList.toggle('active', !!isActive);
    }

    _hideCount() {
        // 如果本来就没显示过，直接清空
        if (!this.countDisplay.classList.contains('visible')) {
            this.countDisplay.textContent = '';
            this.countDisplay.classList.remove('active');
            this.countDisplay.classList.remove('invalid');
            return;
        }

        // 先触发淡出（保留文本，让淡出可见）
        this.countDisplay.classList.remove('active');
        this.countDisplay.classList.remove('invalid');
        this.countDisplay.classList.remove('visible');

        const token = ++this._countHideToken;
        const el = this.countDisplay;
        const style = window.getComputedStyle(el);

        // Fail Fast：没有过渡则直接清空
        if (style.transitionDuration === '0s' || style.display === 'none') {
            el.textContent = '';
            return;
        }

        // 等淡出结束后再清空文本；若期间又显示，则不清空
        const onEnd = () => {
            if (token !== this._countHideToken) return;
            if (!el.classList.contains('visible')) el.textContent = '';
        };

        el.addEventListener('transitionend', onEnd, { once: true });
    }

    /**
     * 导航到结果
     * @param {number} direction 1 (next) or -1 (prev)
     */
    navigate(direction) {
        if (this.matches.length === 0) return;

        // 移除当前高亮
        if (this.currentIndex >= 0 && this.matches[this.currentIndex]) {
            this.matches[this.currentIndex].classList.remove('current');
        }

        // 计算新索引
        if (this.currentIndex === -1) {
            this.currentIndex = 0; // 初始状态
        } else {
            this.currentIndex = (this.currentIndex + direction + this.matches.length) % this.matches.length;
        }

        // 应用新高亮
        const currentMatch = this.matches[this.currentIndex];
        currentMatch.classList.add('current');

        // 滚动到视图
        this._smoothScrollToMatch(currentMatch);

        this._updateCount();
    }

    _smoothScrollToMatch(matchEl) {
        if (!matchEl || typeof matchEl.getBoundingClientRect !== 'function') return;

        // 1) 垂直：滚动窗口到居中
        const rect = matchEl.getBoundingClientRect();
        const targetY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
        customSmoothScrollTo(Math.max(0, targetY), 500);

        // 2) 水平：如果在可横向滚动的表格容器里，尽量把命中带到可视区域（可选）
        const scroller = matchEl.closest ? matchEl.closest('.table-scroll') : null;
        if (!scroller) return;

        const scrollerRect = scroller.getBoundingClientRect();
        const elRect = matchEl.getBoundingClientRect();
        const padding = 24;

        let targetLeft = scroller.scrollLeft;
        if (elRect.left < scrollerRect.left + padding) {
            targetLeft -= (scrollerRect.left + padding) - elRect.left;
        } else if (elRect.right > scrollerRect.right - padding) {
            targetLeft += elRect.right - (scrollerRect.right - padding);
        }

        targetLeft = Math.max(0, targetLeft);
        if (Math.abs(targetLeft - scroller.scrollLeft) < 1) return;

        try {
            scroller.scrollTo({ left: targetLeft, behavior: 'smooth' });
        } catch (_) {
            scroller.scrollLeft = targetLeft;
        }
    }

    _updateCount() {
        const total = this.matches.length;
        const hasQuery = !!this.input.value.trim();

        if (!hasQuery) {
            this._hideCount();
            return;
        }

        // 有输入就显示计数（0/0 也显示），有结果则高亮
        if (total === 0) {
            this._showCount('0/0', false);
        } else {
            const current = this.currentIndex + 1;
            this._showCount(`${current}/${total}`, true);
        }
    }
    
    /**
     * 重置搜索（切换年份时调用）
     */
    reset() {
        this.input.value = '';
        this._clearHighlights();
    }
}
