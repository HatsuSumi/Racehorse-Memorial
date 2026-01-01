import { CONFIG } from './config/config.js';
import { customSmoothScrollTo, waitForTransition } from './shared/utils.js';
import * as DataService from './services/data-service.js';
import * as UIRenderer from './renderers/ui-renderer.js';
import { TooltipService } from './features/tooltip/tooltip.js';
import { SearchService } from './features/search/search.js';
import { getSortableColumnsForYear } from './features/sort/sort.js';
import { initThemeController } from './controllers/theme-controller.js';
import { initMobileMenuController } from './controllers/mobile-menu.js';
import { initQuickNavController } from './controllers/quick-nav.js';
import { initResponsiveSearchPlacementController } from './controllers/responsive-search-placement.js';
import { initExchangeRateController } from './controllers/exchange-rate-controller.js';
import { renderSortHint } from './renderers/sort-hint-renderer.js';
import { createRecordSortModal } from './features/sort/record-sort-modal.js';
import { createSortController } from './controllers/sort-controller.js';

// 状态管理
let currentYear = CONFIG.defaultYear;
let searchService = null; // 搜索服务实例
let currentData = null; // 当前年份的原始数据（不在此处做 in-place sort）
let lastExchangeRatesUpdatedAt = null; // 供 sort-hint ⓘ 展示
let sortController = null;
let recordSortModal = null;

// ================= 初始化 =================
async function init() {
    try {
        UIRenderer.initUIEvents();

        initThemeController({
            updateThemeUI: UIRenderer.updateThemeUI,
            themeToggleEl: UIRenderer.dom.themeToggle
        });

        initMobileMenuController({
            sidebarEl: UIRenderer.dom.sidebar,
            overlayEl: UIRenderer.dom.overlay,
            menuToggleEl: UIRenderer.dom.menuToggle
        });

        initQuickNavController({
            smoothScrollTo: customSmoothScrollTo,
            topBtn: document.getElementById('btn-top'),
            midBtn: document.getElementById('btn-mid'),
            botBtn: document.getElementById('btn-bot')
        });

        initResponsiveSearchPlacementController();

        recordSortModal = createRecordSortModal({
            getCurrentData: () => currentData,
            getCurrentYear: () => currentYear,
            onSelected: ({ metric, direction }) => {
                if (!sortController) return;
                sortController.setRecordSort(metric, direction);
            }
        });

        sortController = createSortController({
            getCurrentYear: () => currentYear,
            getCurrentData: () => currentData,
            renderTable: (data, year, sortState) => UIRenderer.renderTable(data, year, sortState),
            renderHint: (year) => updateSortHint(year),
            reapplySearch: () => {
                if (searchService && searchService.input && searchService.input.value.trim()) {
                    searchService.search();
                }
            },
            openRecordSortModal: () => recordSortModal.open()
        });
        sortController.bind(UIRenderer.dom.tableWrapper);

        initExchangeRateController({
            exchangeRatesConfig: CONFIG.exchangeRates,
            onUpdated: ({ fetchedAt }) => {
                if (fetchedAt) lastExchangeRatesUpdatedAt = fetchedAt;

                // 若当前已经按“奖金”排序，则用新汇率立即重排刷新
                const st = sortController ? sortController.getSortState() : null;
                if (currentData && st && st.key === '奖金') {
                    const sorted = sortController.applySort(currentData);
                    UIRenderer.renderTable(sorted, currentYear, st);
                }

                updateSortHint(currentYear);
            }
        });

        updateSortHint(currentYear);
        
        // Tooltip 初始化 (Fail Fast)
        if (!TooltipService) {
            throw new Error("[Critical] TooltipService module not loaded!");
        }
        new TooltipService().init();
        
        // 搜索服务初始化
        if (!SearchService) {
            console.warn("SearchService module missing.");
        } else {
            searchService = new SearchService();
        }

        // 渲染初始 UI
        UIRenderer.renderSidebar(currentYear, switchYear);
        UIRenderer.updateVizLinkYear(currentYear);
        UIRenderer.renderReferences(currentYear);
        
        // 加载初始数据
        await loadAndRender(currentYear);

    } catch (e) {
        console.error('Initialization failed:', e);
        alert('系统初始化失败，请检查控制台。');
    }
}

// ================= 业务流程 =================

/**
 * 切换年份
 */
function switchYear(year) {
    if (year === currentYear) return;
    currentYear = year;
    currentData = null;
    if (sortController) sortController.reset(); // 切年后重置排序（每年可排序列可能不同）
    updateSortHint(year);
    
    // 重置搜索状态
    if (searchService) searchService.reset();
    
    // 更新侧边栏状态
    UIRenderer.updateSidebarActiveState(year);
    UIRenderer.updateVizLinkYear(year);
    
    // 更新标题
    UIRenderer.dom.pageTitle.textContent = `${year}年去世的现役与退役赛马名录`;
    
    // 更新参考文献 (带淡出效果)
    const refContainer = UIRenderer.dom.referencesContainer;
    refContainer.classList.add('fade-out');
    
    // 等待动画结束后渲染新内容
    waitForTransition(refContainer).then(() => {
        UIRenderer.renderReferences(year);
        refContainer.classList.remove('fade-out');
    });

    // 加载并渲染表格
    loadAndRender(year);
}

/**
 * 加载数据 -> 计算统计 -> 渲染表格
 */
async function loadAndRender(year) {
    const tableContainer = document.querySelector('.data-table-container');
    
    // 1. 表格淡出
    tableContainer.classList.add('fade-out');
    
    // 等待淡出动画
    await waitForTransition(tableContainer);

    // 显示 Loading
    UIRenderer.toggleLoading(true);

    try {
        // 2. 获取数据 (DataService)
        const data = await DataService.loadData(year);
        currentData = data;
        
        // 3. 渲染表格 (UIRenderer)
        const st = sortController ? sortController.getSortState() : null;
        const sorted = sortController ? sortController.applySort(data) : data;
        UIRenderer.renderTable(sorted, year, st);
        updateSortHint(year);

        // 如果用户已有搜索输入，排序后重新应用高亮（体验更连续）
        if (searchService && searchService.input && searchService.input.value.trim()) {
            searchService.search();
        }
        
    } catch (error) {
        console.error(error);
        UIRenderer.showError(year, error.message);
    } finally {
        // 4. 表格淡入
        tableContainer.classList.remove('fade-out');
    }
}

function updateSortHint(year) {
    const el = document.getElementById('sort-hint');
    if (!el) throw new Error('[App] #sort-hint not found');

    const cols = getSortableColumnsForYear(year);
    renderSortHint({
        el,
        year,
        sortableColumns: cols,
        exchangeRatesConfig: CONFIG.exchangeRates,
        updatedAt: lastExchangeRatesUpdatedAt
    });
}

// 启动应用
init();
