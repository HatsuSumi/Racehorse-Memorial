import { CONFIG } from '../config/config.js';
import { getEnglishName, isValidDeathPlace } from '../shared/utils.js';
import { getRecordMetricValueFromRaw, isColumnSortable } from '../features/sort/sort.js';

// DOM 元素引用
export const dom = {
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menu-toggle'),
    overlay: document.getElementById('overlay'),
    yearNav: document.getElementById('year-nav'),
    tableWrapper: document.getElementById('table-wrapper'),
    pageTitle: document.getElementById('page-title'),
    referencesContainer: document.getElementById('references-container'), 
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    themeText: document.getElementById('theme-text')
};

const _APP_READY_CLASS = 'app-ready';

function _setAppReady(isReady) {
    try {
        document.documentElement.classList.toggle(_APP_READY_CLASS, !!isReady);
    } catch (_) {
        // ignore
    }
}

let _eventsBound = false;

function _getTemplateOrThrow(id) {
    const tpl = document.getElementById(id);
    if (!tpl) throw new Error(`[UIRenderer] #${id} not found`);
    return tpl;
}

function _cloneTemplateFirstElementOrThrow(templateId) {
    const tpl = _getTemplateOrThrow(templateId);
    const el = tpl.content.firstElementChild;
    if (!el) throw new Error(`[UIRenderer] #${templateId} is empty`);
    return el.cloneNode(true);
}

function _appendRichTextWithBoldAndLineBreaks(parentEl, rawText) {
    const brTemplate = _getTemplateOrThrow('table-br-template');
    const boldTemplate = _getTemplateOrThrow('table-bold-template');

    const text = String(rawText ?? '');
    const lines = text.includes('|') ? text.split('|').map(s => s.trim()) : [text];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];

        // **加粗**：用 DOM 节点拼，不用字符串拼接渲染
        const re = /\*\*(.+?)\*\*/g;
        let lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
            const before = line.slice(lastIndex, m.index);
            if (before) parentEl.appendChild(document.createTextNode(before));

            const b = boldTemplate.content.firstElementChild.cloneNode(true);
            b.textContent = m[1];
            parentEl.appendChild(b);

            lastIndex = m.index + m[0].length;
        }

        const after = line.slice(lastIndex);
        if (after) parentEl.appendChild(document.createTextNode(after));

        if (li < lines.length - 1) {
            parentEl.appendChild(brTemplate.content.firstElementChild.cloneNode(true));
        }
    }
}

/**
 * 初始化 UI 事件（只绑定一次）
 * - 不依赖 window 全局挂载
 * - 用事件委托处理动态渲染内容
 */
export function initUIEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    // 1) 表格缩略图 -> 打开模态框（事件委托）
    dom.tableWrapper.addEventListener('click', (e) => {
        const img = e.target && e.target.closest ? e.target.closest('img.thumbnail') : null;
        if (!img) return;
        openModal(img.src);
    });

    // 2) 参考文献展开/收起（事件委托）
    dom.referencesContainer.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.ref-expand-btn') : null;
        if (!btn) return;
        toggleReferences();
    });

    // 3) 模态框关闭按钮
    const modalClose = document.getElementById('modal-close');
    if (!modalClose) {
        throw new Error('[UIRenderer] #modal-close not found');
    }
    modalClose.addEventListener('click', () => closeModal());

    // 4) 点击遮罩关闭（点到 modal 背景本身）
    const modal = document.getElementById('image-modal');
    if (!modal) {
        throw new Error('[UIRenderer] #image-modal not found');
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

/**
 * 渲染侧边栏年份导航
 * @param {number} currentYear 
 * @param {Function} onYearClick - 点击回调函数
 */
export function renderSidebar(currentYear, onYearClick) {
    dom.yearNav.replaceChildren();

    const template = document.getElementById('sidebar-item-template');
    const fragment = document.createDocumentFragment();

    // 可视化入口：放在年份列表顶部，并携带当前年份参数
    const vizTpl = document.getElementById('viz-entry-template');
    if (!vizTpl) throw new Error('[UIRenderer] #viz-entry-template not found');
    const vizFrag = vizTpl.content.cloneNode(true);
    const vizA = vizFrag.querySelector('#viz-link');
    if (!vizA) throw new Error('[UIRenderer] #viz-link not found in #viz-entry-template');
    vizA.href = `viz.html?year=${currentYear}`;
    vizA.setAttribute('aria-label', `打开${currentYear}年数据可视化页面`);
    fragment.appendChild(vizFrag);

    CONFIG.availableYears.forEach(year => {
        const clone = template.content.cloneNode(true);
        const btn = clone.querySelector('button');
        
        const isAvailable = !!CONFIG.csvHeaders[year];
        
        if (year === currentYear) btn.classList.add('active');
        if (!isAvailable) btn.classList.add('disabled');
        
        btn.textContent = `${year}年`;
        
        if (isAvailable) {
            btn.onclick = () => {
                if (onYearClick) onYearClick(year);
                if (window.innerWidth <= 768) {
                    dom.sidebar.classList.remove('active');
                    dom.overlay.classList.remove('active');
                }
            };
        } else {
            btn.dataset.tooltip = "尚未到来";
            btn.style.cursor = "not-allowed";
            btn.style.opacity = "0.5";
        }
        
        fragment.appendChild(clone);
    });

    dom.yearNav.appendChild(fragment);
}

export function updateVizLinkYear(year) {
    const a = document.getElementById('viz-link');
    if (!a) return;
    a.href = `viz.html?year=${year}`;
    a.setAttribute('aria-label', `打开${year}年数据可视化页面`);
}

/**
 * 更新侧边栏按钮的激活状态
 */
export function updateSidebarActiveState(year) {
    const btns = dom.yearNav.querySelectorAll('.year-btn');
    btns.forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(year));
    });
}

/**
 * 渲染参考文献
 */
export function renderReferences(year) {
    const refs = CONFIG.references[year];
    const container = dom.referencesContainer;
    
    if (!refs || refs.length === 0) {
        container.replaceChildren();
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const refsTemplate = document.getElementById('references-template');
    const refItemTemplate = document.getElementById('ref-item-template');
    if (!refsTemplate) throw new Error('[UIRenderer] #references-template not found');
    if (!refItemTemplate) throw new Error('[UIRenderer] #ref-item-template not found');

    const refsFragment = refsTemplate.content.cloneNode(true);
    const listEl = refsFragment.querySelector('.ref-list');
    if (!listEl) throw new Error('[UIRenderer] .ref-list not found in #references-template');

    const expandBtn = refsFragment.querySelector('.ref-expand-btn');
    if (refs.length <= CONFIG.maxVisibleReferences && expandBtn) {
        expandBtn.remove();
    }

    const itemsFragment = document.createDocumentFragment();
    refs.forEach(ref => {
        const itemFrag = refItemTemplate.content.cloneNode(true);
        const li = itemFrag.querySelector('li.ref-item');
        const a = itemFrag.querySelector('a.ref-link');
        const span = itemFrag.querySelector('span.ref-text');

        if (!li) throw new Error('[UIRenderer] li.ref-item not found in #ref-item-template');
        if (!a) throw new Error('[UIRenderer] a.ref-link not found in #ref-item-template');
        if (!span) throw new Error('[UIRenderer] span.ref-text not found in #ref-item-template');

        const isUrl = typeof ref === 'string' && ref.startsWith('http');
        if (isUrl) {
            a.href = ref;
            a.textContent = ref;
            span.remove();
        } else {
            span.textContent = String(ref ?? '');
            a.remove();
        }

        itemsFragment.appendChild(itemFrag);
    });

    listEl.appendChild(itemsFragment);
    container.replaceChildren(refsFragment);
}

/**
 * 展开/收起参考文献
 */
export function toggleReferences() {
    const wrapper = document.getElementById('ref-wrapper');
    const arrow = document.querySelector('.ref-arrow');
    const isExpanded = wrapper.classList.contains('expanded');
    
    wrapper.classList.toggle('expanded');
    arrow.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
}

/**
 * 渲染主数据表格
 * @param {Array} data - 表格数据
 * @param {number} year - 当前年份
 */
export function renderTable(data, year, sortState = null) {
    if (!data || data.length === 0) {
        const emptyEl = _cloneTemplateFirstElementOrThrow('table-empty-template');
        dom.tableWrapper.replaceChildren(emptyEl);
        _setAppReady(true);
        return;
    }

    const configuredHeaders = CONFIG.csvHeaders[year];
    
    if (!configuredHeaders) {
        console.error(`Missing configuration: No CSV headers defined for year ${year}`);
        showError(year, '配置缺失：未找到表头定义');
        return;
    }

    // 1. 克隆骨架
    const wrapperTemplate = document.getElementById('table-scroll-wrapper-template');
    const wrapperFragment = wrapperTemplate.content.cloneNode(true);
    const scrollDiv = wrapperFragment.querySelector('.table-scroll');
    const headerRow = wrapperFragment.querySelector('thead tr');
    const tbody = wrapperFragment.querySelector('tbody');

    // 2. 初始化实时计数器 (Running Counter)
    const runningCounts = {
        '父': {},
        '祖父': {},
        '母': {},
        '母父': {},
        '逝世地': {}
    };

    // 3. 生成表头
    const thTemplate = document.getElementById('table-header-cell-template');
    const keys = configuredHeaders;

    keys.forEach(key => {
        const thFragment = thTemplate.content.cloneNode(true);
        const th = thFragment.firstElementChild;

        const sortable = isColumnSortable(year, key);
        const btn = th.querySelector('.sort-header');
        const label = th.querySelector('.sort-label');
        const indicator = th.querySelector('.sort-indicator');

        if (!btn || !label || !indicator) {
            throw new Error('[UIRenderer] invalid #table-header-cell-template (missing .sort-header/.sort-label/.sort-indicator)');
        }

        if (!sortable) {
            // 不可排序：保持为普通表头（不放按钮，避免样式变化）
            btn.remove();
            th.textContent = key;
            th.removeAttribute('aria-sort');
        } else {
            label.textContent = key;
            btn.dataset.sortKey = key;
            th.classList.add('sortable');
            th.setAttribute('aria-sort', 'none');

            if (sortState && sortState.key === key) {
                const dir = sortState.direction === 'desc' ? 'desc' : 'asc';
                indicator.classList.add('active');
                indicator.classList.toggle('desc', dir === 'desc');
                th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
            } else {
                indicator.classList.remove('active');
                indicator.classList.remove('desc');
            }
        }

        if (key === '序号') th.classList.add('index-cell');
        if (key === '马名') th.classList.add('horse-name-cell');

        headerRow.appendChild(th);
    });

    // 4. 生成内容 (遍历并实时更新计数)
    const rowTemplate = document.getElementById('table-row-template');
    const cellTemplate = document.getElementById('table-cell-template');
    const photoTemplate = document.getElementById('table-photo-template');
    if (!photoTemplate) throw new Error('[UIRenderer] #table-photo-template not found');
    const countTemplate = document.getElementById('genealogy-count-template');
    if (!countTemplate) throw new Error('[UIRenderer] #genealogy-count-template not found');
    const recordMetricBadgeTemplate = document.getElementById('record-metric-badge-template');
    if (!recordMetricBadgeTemplate) throw new Error('[UIRenderer] #record-metric-badge-template not found');
    const rowsFragment = document.createDocumentFragment();

    data.forEach((row, index) => {
        const trFragment = rowTemplate.content.cloneNode(true);
        const tr = trFragment.firstElementChild;
        
        // 逐行延迟动画
        const delay = Math.min(index * 0.03, 1.0); 
        tr.style.animationDelay = `${delay}s`;

        keys.forEach(key => {
            const tdFragment = cellTemplate.content.cloneNode(true);
            const td = tdFragment.firstElementChild;

            // 样式类
            if (key === '序号') td.classList.add('index-cell');
            if (key === '马名') td.classList.add('horse-name-cell');
            if (key === '图片') td.classList.add('photo-cell');
            
            let content = row[key] || '';
            let countValue = null;

            // --- 实时计数逻辑开始 ---
            switch (key) {
                case '父':
                case '祖父':
                case '母':
                case '母父': {
                    if (typeof content === 'string' && content.trim() !== '') {
                        const name = content.trim();
                        // 计数 + 1
                        runningCounts[key][name] = (runningCounts[key][name] || 0) + 1;
                        const currentCount = runningCounts[key][name];

                        // 只有第 2 次及以上出现时才显示角标
                        if (currentCount > 1) {
                            countValue = currentCount;
                        }
                    }
                    break;
                }
                case '逝世地': {
                    // 逝世地需要先通过有效性校验
                    if (isValidDeathPlace(content)) {
                        const place = content.trim();
                        // 计数 + 1
                        runningCounts['逝世地'][place] = (runningCounts['逝世地'][place] || 0) + 1;
                        const currentCount = runningCounts['逝世地'][place];

                        // 只有第 2 次及以上出现时才显示角标
                        if (currentCount > 1) {
                            countValue = currentCount;
                        }
                    }
                    break;
                }
                default:
                    break;
            }
            // --- 实时计数逻辑结束 ---
            
            // 图片列特殊处理
            if (key === '图片') {
                const img = photoTemplate.content.firstElementChild.cloneNode(true);
                
                // 检查是否有图片（默认为 true，如果数据中未标记则认为有图片）
                const hasPhoto = row['hasPhoto'] !== false;
                
                if (hasPhoto) {
                    // 尝试加载马匹特定图片
                    const englishName = getEnglishName(row['马名']);
                    const jsonSerial = row['序号'];
                    
                    // 检查是否有自定义序号覆盖
                    const yearOverrides = CONFIG.imageSerialOverride[year];
                    const imageSerial = (yearOverrides && yearOverrides[jsonSerial] !== undefined)
                        ? yearOverrides[jsonSerial]
                        : jsonSerial;
                    
                    const serial = String(imageSerial).padStart(2, '0');
                    const imgPath = `images/${year}/${serial}_${englishName}.jpg`;
                    img.src = imgPath;

                    img.addEventListener('error', () => {
                        // 如果图片加载失败，使用默认图
                        img.src = 'images/default-horse.jpg';
                        // 如果默认图也加载失败，显示占位符
                        img.addEventListener('error', () => {
                            td.replaceChildren('-');
                        }, { once: true });
                    }, { once: true });
                } else {
                    // 直接使用默认图，不产生 404 错误
                    img.src = 'images/default-horse.jpg';
                    // 如果默认图也加载失败，显示占位符
                    img.addEventListener('error', () => {
                        td.replaceChildren('-');
                    }, { once: true });
                }

                td.replaceChildren(img);
            } else if (typeof content === 'string') {
                // 纯 DOM 拼装：支持 | 换行、**加粗**，避免字符串拼接渲染
                td.replaceChildren();
                _appendRichTextWithBoldAndLineBreaks(td, content);

                // 追加实时计算出的角标（只在第 2 次及以上）
                if (countValue && countValue > 1) {
                    td.appendChild(document.createTextNode(' '));
                    const badge = countTemplate.content.firstElementChild.cloneNode(true);
                    badge.textContent = `*${countValue}`;
                    td.appendChild(badge);
                }

                // 若当前正在按“战绩”排序，则在“战绩”单元格追加“所选指标”的角标
                // - 比例类：直接显示百分比（胜率/连对率/三甲率）
                // - 次数类：显示“占总场的百分比”（如 1着占比）
                // - 总场：不显示角标（避免与战绩字符串首位重复）
                if (key === '战绩' && sortState && sortState.key === '战绩') {
                    const metric = sortState.metric || 'winRate';
                    const v = getRecordMetricValueFromRaw(content, metric);
                    if (typeof v === 'number' && Number.isFinite(v)) {
                        const el = recordMetricBadgeTemplate.content.firstElementChild.cloneNode(true);
                        switch (metric) {
                            // 比例类：直接显示百分比（胜率/连对率/三甲率）
                            case 'winRate':
                            case 'placeRate':
                            case 'showRate': {
                                const pct = Math.round(v * 1000) / 10; // 1 位小数
                                el.textContent = `${pct}%`;
                                break;
                            }
                            // 次数类：显示“占总场的百分比”（如 1着占比）
                            case 'win':
                            case 'second':
                            case 'third':
                            case 'unplaced': {
                                const starts = getRecordMetricValueFromRaw(content, 'starts');
                                if (typeof starts === 'number' && Number.isFinite(starts) && starts > 0) {
                                    const ratio = v / starts;
                                    const pct = Math.round(ratio * 1000) / 10; // 1 位小数
                                    el.textContent = `${pct}%`;
                                } else {
                                    // 无法计算占比则不显示
                                    el.textContent = '';
                                }
                                break;
                            }
                            // 总场：不显示角标（避免与战绩字符串首位重复）
                            case 'starts':
                                el.textContent = '';
                                break;
                            // 其他：默认显示整数
                            default:
                                el.textContent = `${Math.round(v)}`;
                                break;
                        }
                        if (el.textContent) td.appendChild(el);
                    }
                }
            } else {
                td.textContent = content;
            }
            
            tr.appendChild(td);
        });
        rowsFragment.appendChild(tr);
    });

    tbody.appendChild(rowsFragment);
    
    dom.tableWrapper.replaceChildren(scrollDiv);
    _setAppReady(true);
}

/**
 * 更新主题 UI
 */
export function updateThemeUI(theme) {
    if (theme === 'dark') {
        dom.themeIcon.textContent = '☀️';
        dom.themeText.textContent = '拥抱光明';
    } else {
        dom.themeIcon.textContent = '🌙';
        dom.themeText.textContent = '堕入黑暗';
    }
}

/**
 * 切换 Loading 状态
 */
export function toggleLoading(isLoading) {
    if (isLoading) {
        const loadingEl = _cloneTemplateFirstElementOrThrow('table-loading-template');
        dom.tableWrapper.replaceChildren(loadingEl);
        _setAppReady(false);
    }
}

/**
 * 显示错误信息
 */
export function showError(year, message) {
    const errorRoot = _cloneTemplateFirstElementOrThrow('table-error-template');
    const msgEl = errorRoot.querySelector('.error-message');
    if (!msgEl) throw new Error('[UIRenderer] .error-message not found in #table-error-template');
    msgEl.textContent = String(message ?? '');

    dom.tableWrapper.replaceChildren(errorRoot);
    _setAppReady(true);
}

// ================= 模态框逻辑 =================
export function openModal(src) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    modal.style.display = "block";
    modalImg.src = src;
    
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = "hidden";
}

export function closeModal() {
    const modal = document.getElementById('image-modal');
    
    // 定义清理函数
    const cleanup = () => {
        modal.style.display = "none";
        modal.classList.remove('closing');
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
    };

    modal.classList.add('closing');

    // 检查是否有有效的 CSS 动画
    // 如果 CSS 没加载或动画名为 none，不应等待 animationend，否则会导致 UI 锁死
    const style = window.getComputedStyle(modal);
    if (style.animationName === 'none' || style.display === 'none') {
        cleanup();
    } else {
        // 使用 animationend 确保与 CSS 动画完全同步
        modal.addEventListener('animationend', cleanup, { once: true });
    }
}
