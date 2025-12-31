import { getColumnSortType, isColumnSortable, sortDataForYear } from '../features/sort/sort.js';

export function createSortController({
    getCurrentYear,
    getCurrentData,
    renderTable,
    renderHint,
    reapplySearch,
    openRecordSortModal
} = {}) {
    if (typeof getCurrentYear !== 'function') throw new Error('[SortController] getCurrentYear must be a function');
    if (typeof getCurrentData !== 'function') throw new Error('[SortController] getCurrentData must be a function');
    if (typeof renderTable !== 'function') throw new Error('[SortController] renderTable must be a function');
    if (typeof renderHint !== 'function') throw new Error('[SortController] renderHint must be a function');
    if (typeof reapplySearch !== 'function') throw new Error('[SortController] reapplySearch must be a function');
    if (typeof openRecordSortModal !== 'function') throw new Error('[SortController] openRecordSortModal must be a function');

    let sortState = null; // { key, direction, metric? }
    let _tableWrapperEl = null;

    function _getHorizontalScrollLeft() {
        const el = _tableWrapperEl || document.getElementById('table-wrapper');
        const scroller = el ? el.querySelector('.table-scroll') : null;
        return scroller ? scroller.scrollLeft : 0;
    }

    function _restoreHorizontalScrollLeft(scrollLeft) {
        const el = _tableWrapperEl || document.getElementById('table-wrapper');
        const scroller = el ? el.querySelector('.table-scroll') : null;
        if (!scroller) return;

        scroller.scrollLeft = scrollLeft;
        // 移动端/部分浏览器：下一帧再补一次，避免重渲染/聚焦导致回弹
        try {
            requestAnimationFrame(() => {
                const s2 = (el || document.getElementById('table-wrapper'))?.querySelector?.('.table-scroll');
                if (s2) s2.scrollLeft = scrollLeft;
            });
        } catch (_) {
            // ignore
        }
    }

    function getSortState() {
        return sortState;
    }

    function reset() {
        sortState = null;
    }

    function applySort(data) {
        const year = getCurrentYear();
        return sortDataForYear(data, year, sortState);
    }

    function setRecordSort(metric, direction) {
        const scrollLeft = _getHorizontalScrollLeft();
        sortState = { key: '战绩', metric, direction };
        const data = getCurrentData();
        if (!data) return;
        const year = getCurrentYear();
        const sorted = sortDataForYear(data, year, sortState);
        renderTable(sorted, year, sortState);
        renderHint(year);
        reapplySearch();
        _restoreHorizontalScrollLeft(scrollLeft);
    }

    function bind(tableWrapperEl) {
        if (!tableWrapperEl) throw new Error('[SortController] tableWrapperEl is required');
        _tableWrapperEl = tableWrapperEl;

        tableWrapperEl.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('button.sort-header') : null;
            if (!btn) return;

            const key = btn.dataset.sortKey;
            if (!key) return;

            const year = getCurrentYear();
            if (!isColumnSortable(year, key)) return;

            const data = getCurrentData();
            if (!data) return;

            const type = getColumnSortType(year, key);
            if (type === 'record') {
                openRecordSortModal();
                return;
            }

            const scrollLeft = _getHorizontalScrollLeft();
            if (!sortState || sortState.key !== key) {
                sortState = { key, direction: 'asc' };
            } else {
                sortState = {
                    key,
                    direction: sortState.direction === 'asc' ? 'desc' : 'asc'
                };
            }

            const sorted = sortDataForYear(data, year, sortState);
            renderTable(sorted, year, sortState);
            renderHint(year);
            reapplySearch();
            _restoreHorizontalScrollLeft(scrollLeft);
        });
    }

    return {
        bind,
        reset,
        getSortState,
        applySort,
        setRecordSort
    };
}
