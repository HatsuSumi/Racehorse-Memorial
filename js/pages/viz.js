import { CONFIG } from '../config/config.js';
import { loadData } from '../services/data-service.js';
import { initThemeController } from '../controllers/theme-controller.js';
import { TooltipService } from '../features/tooltip/tooltip.js';

const UNKNOWN_MONTH_BUCKET = '不确定（跨月/无法解析）';
const UNKNOWN_AGE_BUCKET = '未知';
const UNKNOWN_VALUE = '未知';
const PIE_RADIUS_DEFAULT = ['40%', '68%'];
const PIE_RADIUS_SOLID = '68%';

const CAUSE_TOOLTIP_TEXT =
    '- 心脏类疾病：包含心力衰竭、急性心力衰竭、心脏麻痹、心脏病等关键词\n'
    + '- 事故：放牧事故，所有的殒命赛场，以及包含“相撞/碰撞/迎面相撞/事故/意外/失蹄/摔倒/跌倒/打滑/绊倒”等关键词\n'
    + '- 蹄部问题：包含蹄叶炎及其他蹄部相关疾病\n'
    + '- 病死（不明病种）：包含“因病去世/身体状况变差/症状恶化/无法站立”等但未说明具体病种\n'
    + '- 产科：分娩/产后/产下相关但信息不足（例如“产下XXX后不久去世”）\n'
    + '- 严重伤势：包含“受创/灾难性损伤/受创不良于行\n'
    + '备注：“推定为...”内容已忽略，不参与计数。';

function _isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function _requirePlainObject(v, name) {
    if (!_isPlainObject(v)) throw new Error(`[Viz] ${name} must be an object`);
    return v;
}

function _requireArray(v, name) {
    if (!Array.isArray(v)) throw new Error(`[Viz] ${name} must be an array`);
    return v;
}

function _requireString(v, name) {
    if (typeof v !== 'string') throw new Error(`[Viz] ${name} must be a string`);
    return v;
}

function _requireFiniteNumber(v, name) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`[Viz] ${name} must be a finite number`);
    return n;
}


const PANEL_DEFS = {
    // 注意：面板名 ≠ 列名。每个面板会声明自己依赖哪些"列名（字段）"
    // requires 使用"规范字段名"（可在 config.js 的 visualizations.columnsByYear 做按年映射）
    '月份分布': { type: 'chart', id: 'month', title: '月份分布', requires: ['逝世'] },
    '享年分布': { type: 'chart', id: 'age', title: '享年分布', requires: ['享年'] },
    '主胜鞍分布': { type: 'chart', id: 'mainWins', title: '主胜鞍分布', requires: ['主胜鞍'] },
    '性别分布': { type: 'chart', id: 'gender', title: '性别分布', requires: ['性别'] },
    '毛色分布': { type: 'chart', id: 'coat', title: '毛色分布', requires: ['毛色'] },
    '品种分布': { type: 'chart', id: 'breed', title: '品种分布', requires: ['品种'] },
    '死因分布': {
        type: 'chart',
        id: 'cause',
        title: '死因分布',
        requires: ['死因（用于统计）']
    },
    '殒命赛场分布': {
        type: 'chart',
        id: 'raceDeath',
        title: '殒命赛场分布',
        requires: ['死因（用于统计）']
    },
    '时间统计': {
        type: 'stats',
        id: 'timeStats',
        title: '时间统计',
        requires: ['逝世', '马名']
    }
};

function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`[Viz] #${id} not found`);
    return el;
}

function _getPanelsForYear(year) {
    _requirePlainObject(CONFIG, 'CONFIG');
    const vis = _requirePlainObject(CONFIG.visualizations, 'CONFIG.visualizations');
    const byYear = _requirePlainObject(vis.byYear, 'CONFIG.visualizations.byYear');

    const list = byYear[String(year)];
    _requireArray(list, `CONFIG.visualizations.byYear["${year}"]`);

    for (const name of list) {
        if (!PANEL_DEFS[name]) throw new Error(`[Viz] Unknown panel "${name}" for year ${year}`);
    }

    return list;
}

function _getVizColumnMapForYearOrThrow(year) {
    _requirePlainObject(CONFIG, 'CONFIG');
    const vis = _requirePlainObject(CONFIG.visualizations, 'CONFIG.visualizations');
    const byYear = _requirePlainObject(vis.columnsByYear, 'CONFIG.visualizations.columnsByYear');
    const colMap = byYear[String(year)];
    return _requirePlainObject(colMap, `CONFIG.visualizations.columnsByYear["${year}"]`);
}

function _resolveColumnOrThrow(year, canonicalCol) {
    const colMap = _getVizColumnMapForYearOrThrow(year);
    const actual = colMap[canonicalCol];
    if (typeof actual !== 'string') throw new Error(`[Viz] Missing column mapping for "${canonicalCol}" in year ${year}`);
    if (actual.trim().length === 0) throw new Error(`[Viz] Empty column mapping for "${canonicalCol}" in year ${year}`);
    return actual;
}

function _assertPanelsColumnsSatisfied(year, panels) {
    _requireArray(panels, 'panels');
    for (const panelName of panels) {
        const def = PANEL_DEFS[panelName];
        if (!def) throw new Error(`[Viz] Unknown panel "${panelName}" (PANEL_DEFS missing)`);

        const requires = def.requires;
        _requireArray(requires, `PANEL_DEFS["${panelName}"].requires`);
        for (const col of requires) {
            // 这里不检查 csvHeaders（主表格列），因为可视化可能使用“隐藏列”（例如：死因（用于统计））
            _resolveColumnOrThrow(year, col);
        }
    }
}

function _assertRowsHaveColumns(year, rows, panels) {
    _requireArray(panels, 'panels');
    _requireArray(rows, 'rows');
    const needs = new Set();
    for (const p of panels) {
        const def = PANEL_DEFS[p];
        if (!def) throw new Error(`[Viz] Unknown panel "${p}" (PANEL_DEFS missing)`);
        if (def.type !== 'chart') continue;
        _requireArray(def.requires, `PANEL_DEFS["${p}"].requires`);
        for (const c of def.requires) needs.add(c);
    }
    if (needs.size === 0) throw new Error('[Viz] No required columns resolved (panels misconfigured?)');

    for (const canonical of needs) {
        const actual = _resolveColumnOrThrow(year, canonical);
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!_isPlainObject(r)) throw new Error(`[Viz] rows[${i}] must be an object`);
            if (!Object.prototype.hasOwnProperty.call(r, actual)) {
                throw new Error(`[Viz] Missing data column "${actual}" (canonical "${canonical}") at rows[${i}] in ${year}.json`);
            }
        }
    }
}

function _splitStatsTags(raw) {
    const s = _requireString(raw, '死因（用于统计）').trim();
    if (s.length === 0) return [];
    return s.split('|').map(x => x.trim()).filter(Boolean);
}

function _unique(arr) {
    return Array.from(new Set(arr));
}

function _extractPrefixed(tags, prefix) {
    const out = [];
    for (const t of tags) {
        if (!t.startsWith(prefix)) continue;
        out.push(t.slice(prefix.length));
    }
    return _unique(out);
}

function _getYearFromUrlOrDefault() {
    _requirePlainObject(CONFIG, 'CONFIG');
    const fallback = _requireFiniteNumber(CONFIG.defaultYear, 'CONFIG.defaultYear');

    const headers = _requirePlainObject(CONFIG.csvHeaders, 'CONFIG.csvHeaders');
    if (!Object.prototype.hasOwnProperty.call(headers, String(fallback))) {
        throw new Error(`[Viz] Missing CONFIG.csvHeaders["${fallback}"] for defaultYear`);
    }

    const u = new URL(window.location.href);
    const y = u.searchParams.get('year');
    if (y === null) return fallback;

    const n = _requireFiniteNumber(y, 'URLSearchParams.year');

    const availableYears = _requireArray(CONFIG.availableYears, 'CONFIG.availableYears').map((x) => _requireFiniteNumber(x, 'CONFIG.availableYears[]'));
    if (!availableYears.includes(n)) throw new Error(`[Viz] year=${n} not in CONFIG.availableYears`);
    if (!Object.prototype.hasOwnProperty.call(headers, String(n))) throw new Error(`[Viz] Missing CONFIG.csvHeaders["${n}"]`);

    return n;
}

function _setYearToUrl(year) {
    const u = new URL(window.location.href);
    u.searchParams.set('year', String(year));
    // 不刷新页面，方便图表平滑更新
    window.history.replaceState({}, '', u.toString());
}

function _isoOrSlashDates(text) {
    const s = _requireString(text, 'dateText');
    const re = /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/g;
    const out = [];
    let m;
    while ((m = re.exec(s)) !== null) {
        const y = _requireFiniteNumber(m[1], 'year');
        const mo = _requireFiniteNumber(m[2], 'month');
        const d = _requireFiniteNumber(m[3], 'day');
        if (mo < 1) throw new Error(`[Viz] Invalid month "${mo}" in "${s}"`);
        if (mo > 12) throw new Error(`[Viz] Invalid month "${mo}" in "${s}"`);
        if (d < 1) throw new Error(`[Viz] Invalid day "${d}" in "${s}"`);
        if (d > 31) throw new Error(`[Viz] Invalid day "${d}" in "${s}"`);
        out.push({ y, mo, d });
    }
    return out;
}

function getDeathMonthBucket(rawDeath) {
    const s = _requireString(rawDeath, '逝世').trim();
    if (s.length === 0) return UNKNOWN_MONTH_BUCKET;

    // 1) 不晚于X：取 X 的月份
    if (s.includes('不晚于')) {
        const dates = _isoOrSlashDates(s);
        if (dates.length >= 1) return `${dates[0].mo}月`;
        return UNKNOWN_MONTH_BUCKET;
    }

    // 2) A至B(期间)：同月取同月，跨月不确定
    if (s.includes('至')) {
        const dates = _isoOrSlashDates(s);
        if (dates.length >= 2) {
            const a = dates[0];
            const b = dates[1];
            if (a.y === b.y && a.mo === b.mo) return `${a.mo}月`;
            return UNKNOWN_MONTH_BUCKET;
        }
        // 有“至”但无法提取两端日期：仍视为不确定
        return UNKNOWN_MONTH_BUCKET;
    }

    // 3) 普通日期：取月份
    const dates = _isoOrSlashDates(s);
    if (dates.length >= 1) return `${dates[0].mo}月`;

    return UNKNOWN_MONTH_BUCKET;
}

function parseAge(rawAge) {
    const s = _requireString(rawAge, '享年').trim();
    if (s.length === 0) return null;
    const m = s.match(/(\d+)\s*岁/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return n;
}

function classifyMainWins(rawWins) {
    const s = _requireString(rawWins, '主胜鞍');
    
    // 一级赛：G1、Jpn1、JG1、地方G1等
    const hasG1 = s.includes('（G1）') || s.includes('（Jpn1）') || s.includes('（JG1）') || s.includes('（地方G1）');
    
    // 二三级赛：G2、G3、Jpn2、Jpn3、JG2、JG3、地方G2、地方G3、BG系列
    // 注意：表列赛（L、LR）和公开赛（OP）不算分级赛，不包含在内
    const hasG2G3 = s.includes('（G2）') || s.includes('（G3）') 
        || s.includes('（Jpn2）') || s.includes('（Jpn3）')
        || s.includes('（JG2）') || s.includes('（JG3）')
        || s.includes('（地方G2）') || s.includes('（地方G3）')
        || s.includes('（BG1）') || s.includes('（BG2）') || s.includes('（BG3）');

    if (hasG1) return 'G1';
    if (hasG2G3) return 'G2/G3';
    return '无分级胜鞍';
}

function _parseDeathDate(rawDeath) {
    const s = _requireString(rawDeath, '逝世').trim();
    if (s.length === 0) return null;
    
    // 复用现有的 _isoOrSlashDates 函数提取日期
    // 它已经支持 YYYY-MM-DD 和 YYYY/M/D 两种格式
    // 对于"不晚于XXX"和"至...期间"，也会提取其中的日期
    const dates = _isoOrSlashDates(s);
    if (dates.length === 0) return null;
    
    // 取第一个日期
    const first = dates[0];
    return new Date(first.y, first.mo - 1, first.d);
}

function _getWeekRange(date) {
    const weekday = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const monday = new Date(date);
    monday.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return { monday, sunday };
}

function _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function computeTimeStats(rows, year) {
    _requireArray(rows, 'rows');
    
    const colDeath = _resolveColumnOrThrow(year, '逝世');
    const colName = _resolveColumnOrThrow(year, '马名');
    
    // 精确日期：用于按天、按周、最长间隔统计
    const deathsByDate = new Map(); // Date timestamp -> [horse names]
    const deathsByWeek = new Map(); // "YYYY-MM-DD~YYYY-MM-DD" -> [horse names]
    const preciseDates = []; // 精确日期列表
    
    // 所有日期（包括不精确）：用于平均间隔统计
    const allDatesForAvg = new Set(); // 使用 Set 自动去重
    
    for (const row of rows) {
        const rawDeath = row[colDeath];
        const s = _requireString(rawDeath, '逝世').trim();
        if (s.length === 0) continue;
        
        const horseName = String(row[colName] || '未知');
        const isImprecise = s.includes('不晚于') || s.includes('至');
        
        const dateObj = _parseDeathDate(rawDeath);
        if (!dateObj) continue;
        
        const timestamp = dateObj.getTime();
        
        // 所有日期都计入平均间隔统计
        allDatesForAvg.add(timestamp);
        
        // 只有精确日期才参与按天、按周、最长间隔统计
        if (!isImprecise) {
            // 按天分组
            if (!deathsByDate.has(timestamp)) {
                deathsByDate.set(timestamp, []);
                preciseDates.push(dateObj);
            }
            deathsByDate.get(timestamp).push(horseName);
            
            // 按周分组
            const { monday, sunday } = _getWeekRange(dateObj);
            const weekKey = `${_formatDate(monday)}~${_formatDate(sunday)}`;
            if (!deathsByWeek.has(weekKey)) {
                deathsByWeek.set(weekKey, []);
            }
            // 避免同一匹马在同一周内重复计数
            const weekHorses = deathsByWeek.get(weekKey);
            if (!weekHorses.includes(horseName)) {
                weekHorses.push(horseName);
            }
        }
    }
    
    // 计算平均间隔（使用所有日期，包括不精确的）
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;
    const avgInterval = allDatesForAvg.size > 0 ? daysInYear / allDatesForAvg.size : null;
    
    // 如果没有精确日期，返回空统计（但保留平均间隔）
    if (preciseDates.length === 0) {
        return {
            maxDeathsInOneDay: null,
            maxDeathsInOneWeek: null,
            longestGap: null,
            avgInterval: avgInterval
        };
    }
    
    // 排序精确日期
    preciseDates.sort((a, b) => a.getTime() - b.getTime());
    
    // 1. 同一天最多
    let maxDayCount = 0;
    const maxDays = [];
    
    for (const [timestamp, horses] of deathsByDate.entries()) {
        if (horses.length > maxDayCount) {
            maxDayCount = horses.length;
            maxDays.length = 0;
            maxDays.push({ date: new Date(timestamp), horses });
        } else if (horses.length === maxDayCount) {
            maxDays.push({ date: new Date(timestamp), horses });
        }
    }
    
    // 2. 同一周最多
    let maxWeekCount = 0;
    const maxWeeks = [];
    
    for (const [weekKey, horses] of deathsByWeek.entries()) {
        if (horses.length > maxWeekCount) {
            maxWeekCount = horses.length;
            maxWeeks.length = 0;
            maxWeeks.push({ weekKey, horses });
        } else if (horses.length === maxWeekCount) {
            maxWeeks.push({ weekKey, horses });
        }
    }
    
    // 3. 最长间隔
    let maxGapDays = 0;
    let maxGapRange = null;
    
    for (let i = 0; i < preciseDates.length - 1; i++) {
        const current = preciseDates[i];
        const next = preciseDates[i + 1];
        const gapMs = next.getTime() - current.getTime();
        const gapDays = Math.floor(gapMs / (1000 * 60 * 60 * 24)) - 1; // 减1不包含两端
        
        if (gapDays > maxGapDays) {
            maxGapDays = gapDays;
            maxGapRange = { start: current, end: next };
        }
    }
    
    return {
        maxDeathsInOneDay: maxDayCount > 0 ? { count: maxDayCount, dates: maxDays } : null,
        maxDeathsInOneWeek: maxWeekCount > 0 ? { count: maxWeekCount, weeks: maxWeeks } : null,
        longestGap: maxGapDays > 0 && maxGapRange ? {
            days: maxGapDays,
            start: maxGapRange.start,
            end: maxGapRange.end
        } : null,
        avgInterval: avgInterval
    };
}

function _accCount(map, key) {
    if (!(map instanceof Map)) throw new Error('[Viz] _accCount map must be a Map');
    const raw = _requireString(key, 'bucketKey');
    let k = raw.trim();
    if (k.length === 0) k = UNKNOWN_VALUE;
    const prev = map.get(k);
    if (prev === undefined) {
        map.set(k, 1);
        return;
    }
    const n = _requireFiniteNumber(prev, 'prevCount');
    map.set(k, n + 1);
}

function aggregateForYear(rows, year, panels) {
    _requireArray(rows, 'rows');
    _requireArray(panels, 'panels');

    const needs = new Set();
    for (const panelName of panels) {
        const def = PANEL_DEFS[panelName];
        if (!def) throw new Error(`[Viz] Unknown panel "${panelName}" (PANEL_DEFS missing)`);
        if (def.type !== 'chart') continue;
        _requireArray(def.requires, `PANEL_DEFS["${panelName}"].requires`);
        for (const col of def.requires) needs.add(col);
    }

    const cols = {};
    for (const canonical of needs) {
        cols[canonical] = _resolveColumnOrThrow(year, canonical);
    }

    const needDeath = needs.has('逝世');
    const needAge = needs.has('享年');
    const needMainWins = needs.has('主胜鞍');
    const needGender = needs.has('性别');
    const needCoat = needs.has('毛色');
    const needBreed = needs.has('品种');
    const needCauseStats = needs.has('死因（用于统计）');

    const monthCounts = new Map();
    const ageCounts = new Map();
    const mainWinCounts = new Map();
    const genderCounts = new Map();
    const coatCounts = new Map();
    const breedCounts = new Map();
    const causeCounts = new Map();
    const raceDeathCounts = new Map();

    let knownAgeMin = null;
    let knownAgeMax = null;

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!_isPlainObject(r)) throw new Error(`[Viz] rows[${i}] must be an object`);

        if (needDeath) {
            const month = getDeathMonthBucket(r[cols['逝世']]);
            const prev = monthCounts.get(month);
            if (prev === undefined) monthCounts.set(month, 1);
            else monthCounts.set(month, _requireFiniteNumber(prev, 'monthCount') + 1);
        }

        if (needAge) {
            const age = parseAge(r[cols['享年']]);
            if (typeof age === 'number') {
                const k = String(age);
                const prev = ageCounts.get(k);
                if (prev === undefined) ageCounts.set(k, 1);
                else ageCounts.set(k, _requireFiniteNumber(prev, 'ageCount') + 1);

                if (knownAgeMin === null) knownAgeMin = age;
                else knownAgeMin = Math.min(knownAgeMin, age);

                if (knownAgeMax === null) knownAgeMax = age;
                else knownAgeMax = Math.max(knownAgeMax, age);
            } else {
                const prev = ageCounts.get(UNKNOWN_AGE_BUCKET);
                if (prev === undefined) ageCounts.set(UNKNOWN_AGE_BUCKET, 1);
                else ageCounts.set(UNKNOWN_AGE_BUCKET, _requireFiniteNumber(prev, 'ageUnknownCount') + 1);
            }
        }

        if (needMainWins) {
            const cls = classifyMainWins(r[cols['主胜鞍']]);
            const prev = mainWinCounts.get(cls);
            if (prev === undefined) mainWinCounts.set(cls, 1);
            else mainWinCounts.set(cls, _requireFiniteNumber(prev, 'mainWinsCount') + 1);
        }

        if (needGender) _accCount(genderCounts, r[cols['性别']]);
        if (needCoat) _accCount(coatCounts, r[cols['毛色']]);
        if (needBreed) _accCount(breedCounts, r[cols['品种']]);

        if (needCauseStats) {
            const tags = _splitStatsTags(r[cols['死因（用于统计）']]);
            const causes = _extractPrefixed(tags, '原因/');
            for (const c of causes) _accCount(causeCounts, c);

            const race = _extractPrefixed(tags, '殒命赛场/');
            for (const x of race) {
                if (x === '平地') _accCount(raceDeathCounts, x);
                if (x === '障碍') _accCount(raceDeathCounts, x);
                if (x === '赛前') _accCount(raceDeathCounts, x);
            }
        }
    }

    // months: 1..12 + 不确定
    const monthCats = [];
    const monthVals = [];
    if (needDeath) {
        for (let m = 1; m <= 12; m++) {
            const key = `${m}月`;
            monthCats.push(key);
            const v = monthCounts.get(key);
            if (v === undefined) monthVals.push(0);
            else monthVals.push(_requireFiniteNumber(v, `monthCounts["${key}"]`));
        }
        const unknownMonthValue = monthCounts.get(UNKNOWN_MONTH_BUCKET);
        let unknownMonthCount = 0;
        if (unknownMonthValue !== undefined) {
            unknownMonthCount = _requireFiniteNumber(unknownMonthValue, 'unknownMonthCount');
        }
        if (unknownMonthCount > 0) {
            monthCats.push(UNKNOWN_MONTH_BUCKET);
            monthVals.push(unknownMonthCount);
        }
    }

    // ages: 逐岁（min..max）+ 未知
    const ageCats = [];
    const ageVals = [];
    if (needAge) {
        if (knownAgeMin !== null && knownAgeMax !== null) {
            for (let a = knownAgeMin; a <= knownAgeMax; a++) {
                const key = String(a);
                ageCats.push(key);
                const v = ageCounts.get(key);
                if (v === undefined) ageVals.push(0);
                else ageVals.push(_requireFiniteNumber(v, `ageCounts["${key}"]`));
            }
        }
        ageCats.push(UNKNOWN_AGE_BUCKET);
        {
            const v = ageCounts.get(UNKNOWN_AGE_BUCKET);
            if (v === undefined) ageVals.push(0);
            else ageVals.push(_requireFiniteNumber(v, 'ageUnknownCount'));
        }
    }

    // main wins: stable order
    const mainData = [];
    if (needMainWins) {
        const mainCats = ['G1', 'G2/G3', '无分级胜鞍'];
        for (const name of mainCats) {
            const v = mainWinCounts.get(name);
            if (v === undefined) mainData.push({ name, value: 0 });
            else mainData.push({ name, value: _requireFiniteNumber(v, `mainWinCounts["${name}"]`) });
        }
    }

    const genderData = [];
    if (needGender) {
        for (const [name, value] of genderCounts.entries()) {
            genderData.push({ name, value: _requireFiniteNumber(value, 'genderCount') });
        }
        genderData.sort((a, b) => b.value - a.value);
    }

    const coatData = [];
    if (needCoat) {
        for (const [name, value] of coatCounts.entries()) {
            coatData.push({ name, value: _requireFiniteNumber(value, 'coatCount') });
        }
        coatData.sort((a, b) => b.value - a.value);
    }

    const breedData = [];
    if (needBreed) {
        for (const [name, value] of breedCounts.entries()) {
            breedData.push({ name, value: _requireFiniteNumber(value, 'breedCount') });
        }
        breedData.sort((a, b) => b.value - a.value);
    }

    const causeData = [];
    if (needCauseStats) {
        for (const [name, value] of causeCounts.entries()) {
            causeData.push({ name, value: _requireFiniteNumber(value, 'causeCount') });
        }
        causeData.sort((a, b) => b.value - a.value);
    }

    const raceDeathData = [];
    if (needCauseStats) {
        const names = ['平地', '障碍', '赛前'];
        for (const name of names) {
            const v = raceDeathCounts.get(name);
            if (v === undefined) raceDeathData.push({ name, value: 0 });
            else raceDeathData.push({ name, value: _requireFiniteNumber(v, `raceDeathCounts["${name}"]`) });
        }
    }

    return { monthCats, monthVals, ageCats, ageVals, mainData, genderData, coatData, breedData, causeData, raceDeathData };
}

function ensureEcharts() {
    const echarts = window.echarts;
    if (echarts === null) throw new Error('[Viz] ECharts not loaded (CDN failed?)');
    if (echarts === undefined) throw new Error('[Viz] ECharts not loaded (CDN failed?)');
    if (typeof echarts.init !== 'function') throw new Error('[Viz] ECharts not loaded (CDN failed?)');
    return echarts;
}

function getEchartsThemeName() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return 'dark';
    return null;
}

function buildCommonAxisOptions() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    let axisColor = '#666';
    let splitColor = 'rgba(0,0,0,0.06)';
    if (isDark) {
        axisColor = '#cfcfcf';
        splitColor = 'rgba(255,255,255,0.10)';
    }
    return {
        axisLabel: { color: axisColor },
        axisLine: { lineStyle: { color: splitColor } },
        splitLine: { lineStyle: { color: splitColor } }
    };
}

function _pct(value, total) {
    const v = _requireFiniteNumber(value, 'value');
    const t = _requireFiniteNumber(total, 'total');
    if (t <= 0) return '0.0%';
    return `${((v / t) * 100).toFixed(1)}%`;
}

function _renderBarChart(echarts, el, theme, axis, { cats, vals, color }) {
    _requireArray(cats, 'cats');
    _requireArray(vals, 'vals');
    _requirePlainObject(axis, 'axis');
    _requireString(color, 'color');

    const chart = echarts.init(el, theme);

    let total = 0;
    for (let i = 0; i < vals.length; i++) {
        total += _requireFiniteNumber(vals[i], `vals[${i}]`);
    }
    chart.setOption({
        tooltip: {
            trigger: 'axis',
            formatter: (params) => {
                let p0;
                if (Array.isArray(params)) {
                    if (params.length === 0) throw new Error('[Viz] tooltip params empty');
                    p0 = params[0];
                } else {
                    p0 = params;
                }
                if (!_isPlainObject(p0)) throw new Error('[Viz] tooltip param must be an object');

                let name = null;
                if (Object.prototype.hasOwnProperty.call(p0, 'axisValueLabel')) name = String(p0.axisValueLabel);
                else if (Object.prototype.hasOwnProperty.call(p0, 'name')) name = String(p0.name);
                if (name === null) throw new Error('[Viz] tooltip missing name');

                if (!Object.prototype.hasOwnProperty.call(p0, 'value')) throw new Error('[Viz] tooltip missing value');
                const value = _requireFiniteNumber(p0.value, 'tooltip.value');

                return `${name}<br/>数量：${value}（${_pct(value, total)}）`;
            }
        },
        grid: { left: 40, right: 18, top: 18, bottom: 56, containLabel: true },
        xAxis: { type: 'category', data: cats, ...axis },
        yAxis: { type: 'value', ...axis },
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 10 }],
        series: [{
            type: 'bar',
            data: vals,
            itemStyle: { color }
        }]
    }, { notMerge: true });
    return chart;
}

function _renderPieChart(echarts, el, theme, { data, radius }) {
    _requireArray(data, 'data');
    if (radius === undefined) throw new Error('[Viz] pie radius is required');
    if (radius === null) throw new Error('[Viz] pie radius is required');

    const chart = echarts.init(el, theme);
    chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}<br/>数量：{c}（{d}%）' },
        legend: { bottom: 0 },
        series: [{
            type: 'pie',
            radius,
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
            label: { formatter: '{b}: {c} ({d}%)' },
            data
        }]
    }, { notMerge: true });
    return chart;
}

function _renderVBarChart(echarts, el, theme, axis, { data, color }) {
    // data: [{ name, value }...]，竖向条形图（全量显示 + 横向滚动条）
    _requireArray(data, 'data');
    _requirePlainObject(axis, 'axis');
    _requireString(color, 'color');

    const list = data.slice();

    for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!_isPlainObject(it)) throw new Error(`[Viz] data[${i}] must be an object`);
        if (!Object.prototype.hasOwnProperty.call(it, 'name')) throw new Error(`[Viz] data[${i}].name missing`);
        if (!Object.prototype.hasOwnProperty.call(it, 'value')) throw new Error(`[Viz] data[${i}].value missing`);
        _requireString(String(it.name), `data[${i}].name`);
        _requireFiniteNumber(it.value, `data[${i}].value`);
    }

    list.sort((a, b) => _requireFiniteNumber(b.value, 'b.value') - _requireFiniteNumber(a.value, 'a.value'));

    const cats = [];
    const vals = [];
    let total = 0;
    for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const name = String(it.name).trim();
        if (name.length === 0) throw new Error(`[Viz] data[${i}].name empty`);
        const v = _requireFiniteNumber(it.value, `data[${i}].value`);
        cats.push(name);
        vals.push(v);
        total += v;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    let labelColor = '#222';
    if (isDark) labelColor = '#f2f2f2';

    const chart = echarts.init(el, theme);
    chart.setOption({
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params) => {
                let p0;
                if (Array.isArray(params)) {
                    if (params.length === 0) throw new Error('[Viz] tooltip params empty');
                    p0 = params[0];
                } else {
                    p0 = params;
                }
                if (!_isPlainObject(p0)) throw new Error('[Viz] tooltip param must be an object');

                let name = null;
                if (Object.prototype.hasOwnProperty.call(p0, 'axisValueLabel')) name = String(p0.axisValueLabel);
                else if (Object.prototype.hasOwnProperty.call(p0, 'name')) name = String(p0.name);
                if (name === null) throw new Error('[Viz] tooltip missing name');

                if (!Object.prototype.hasOwnProperty.call(p0, 'value')) throw new Error('[Viz] tooltip missing value');
                const value = _requireFiniteNumber(p0.value, 'tooltip.value');

                return `${name}<br/>数量：${value}（${_pct(value, total)}）`;
            }
        },
        grid: { left: 44, right: 18, top: 18, bottom: 96, containLabel: true },
        xAxis: {
            type: 'category',
            data: cats,
            ...axis,
            axisLabel: {
                color: _requirePlainObject(axis.axisLabel, 'axis.axisLabel').color,
                rotate: 45,
                hideOverlap: true
            }
        },
        yAxis: { type: 'value', ...axis },
        // x 轴方向滚动：inside + slider（类别多时可录屏可读）
        dataZoom: [
            { type: 'inside', xAxisIndex: 0 },
            { type: 'slider', xAxisIndex: 0, height: 18, bottom: 10 }
        ],
        series: [{
            type: 'bar',
            data: vals,
            itemStyle: { color },
            label: {
                show: true,
                position: 'top',
                color: labelColor,
                formatter: '{c}'
            }
        }]
    }, { notMerge: true });
    return chart;
}

function _disposeAll(echarts, domMap) {
    for (const k of Object.keys(domMap)) {
        const el = domMap[k];
        if (!el) throw new Error(`[Viz] domMap["${k}"] is missing`);
        const inst = echarts.getInstanceByDom(el);
        if (inst) inst.dispose();
    }
}

function renderCharts(panels, domMap, agg) {
    const echarts = ensureEcharts();

    const theme = getEchartsThemeName();
    const axis = buildCommonAxisOptions();

    // 主题变化时要销毁重建，否则 echarts theme 不生效
    _disposeAll(echarts, domMap);

    const charts = {};

    for (const panelName of panels) {
        const def = PANEL_DEFS[panelName];
        if (!def) throw new Error(`[Viz] Unknown panel "${panelName}" (PANEL_DEFS missing)`);
        if (def.type !== 'chart') continue;

        const el = domMap[panelName];
        if (!el) throw new Error(`[Viz] Chart dom missing for panel "${panelName}"`);

        switch (def.id) {
            case 'month':
                charts.month = _renderBarChart(echarts, el, theme, axis, {
                    cats: agg.monthCats,
                    vals: agg.monthVals,
                    color: '#3498db'
                });
                break;
            case 'age':
                charts.age = _renderBarChart(echarts, el, theme, axis, {
                    cats: agg.ageCats,
                    vals: agg.ageVals,
                    color: '#2ecc71'
                });
                break;
            case 'mainWins':
                charts.mainWins = _renderPieChart(echarts, el, theme, { data: agg.mainData, radius: PIE_RADIUS_DEFAULT });
                break;
            case 'gender':
                charts.gender = _renderPieChart(echarts, el, theme, { data: agg.genderData, radius: PIE_RADIUS_DEFAULT });
                break;
            case 'coat':
                charts.coat = _renderPieChart(echarts, el, theme, { data: agg.coatData, radius: PIE_RADIUS_DEFAULT });
                break;
            case 'breed':
                charts.breed = _renderPieChart(echarts, el, theme, { data: agg.breedData, radius: PIE_RADIUS_DEFAULT });
                break;
            case 'cause':
                charts.cause = _renderVBarChart(echarts, el, theme, axis, { data: agg.causeData, color: '#e67e22' });
                break;
            case 'raceDeath':
                charts.raceDeath = _renderPieChart(echarts, el, theme, { data: agg.raceDeathData, radius: PIE_RADIUS_SOLID });
                break;
            default:
                throw new Error(`[Viz] Unsupported chart id "${def.id}" for panel "${panelName}"`);
        }
    }

    return charts;
}

function updateThemeUI(theme) {
    const icon = $('theme-icon');
    const text = $('theme-text');
    if (theme === 'dark') {
        icon.textContent = '☀️';
        text.textContent = '拥抱光明';
    } else {
        icon.textContent = '🌙';
        text.textContent = '堕入黑暗';
    }
}

async function run() {
    // init custom year select
    const yearContainer = $('viz-year-select-container');
    const yearTrigger = $('viz-year-trigger');
    const yearOptionsList = yearContainer.querySelector('.select-options');
    const yearValueText = yearTrigger.querySelector('.selected-value');

    const optTpl = $('viz-year-option-template');
    if (!(optTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #viz-year-option-template must be a <template>');

    _requirePlainObject(CONFIG, 'CONFIG');
    const vis = _requirePlainObject(CONFIG.visualizations, 'CONFIG.visualizations');
    const byYear = _requirePlainObject(vis.byYear, 'CONFIG.visualizations.byYear');

    const yearKeys = Object.keys(byYear);
    if (yearKeys.length === 0) throw new Error('[Viz] CONFIG.visualizations.byYear is empty');

    const headers = _requirePlainObject(CONFIG.csvHeaders, 'CONFIG.csvHeaders');

    const years = [];
    for (let i = 0; i < yearKeys.length; i++) {
        const k = yearKeys[i];
        const y = _requireFiniteNumber(k, `CONFIG.visualizations.byYear key "${k}"`);
        const panelsForYear = byYear[k];
        _requireArray(panelsForYear, `CONFIG.visualizations.byYear["${k}"]`);
        if (!Object.prototype.hasOwnProperty.call(headers, String(y))) {
            throw new Error(`[Viz] Missing CONFIG.csvHeaders["${y}"] for visualization year ${y}`);
        }
        years.push(y);
    }

    years.sort((a, b) => a - b);
    
    // Render Options
    yearOptionsList.replaceChildren();
    for (const y of years) {
        const first = optTpl.content.firstElementChild;
        if (!first) throw new Error('[Viz] viz-year-option-template has no content');
        const li = first.cloneNode(true);
        if (!(li instanceof HTMLLIElement)) throw new Error('[Viz] viz-year-option-template must contain an <li>');
        li.dataset.value = String(y);
        li.textContent = `${y}年`;
        yearOptionsList.appendChild(li);
    }

    let currentYear = _getYearFromUrlOrDefault();
    if (!years.includes(currentYear)) throw new Error(`[Viz] currentYear ${currentYear} not in visualization years`);
    
    // UI Helpers
    function updateYearUI(year) {
        yearValueText.textContent = `${year}年`;
        const options = yearOptionsList.querySelectorAll('.select-option');
        for (const opt of options) {
            if (Number(opt.dataset.value) === year) {
                opt.setAttribute('aria-selected', 'true');
            } else {
                opt.setAttribute('aria-selected', 'false');
            }
        }
    }
    
    function openMenu() {
        yearContainer.classList.add('open');
        yearTrigger.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        yearContainer.classList.remove('open');
        yearTrigger.setAttribute('aria-expanded', 'false');
    }

    // Init UI
    updateYearUI(currentYear);

    // Event Listeners
    yearTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = yearContainer.classList.contains('open');
        if (isOpen) closeMenu();
        else openMenu();
    });

    yearOptionsList.addEventListener('click', async (e) => {
        const li = e.target.closest('.select-option');
        if (!li) return;
        
        const val = Number(li.dataset.value);
        if (!Number.isFinite(val)) return;

        // update UI immediately
        updateYearUI(val);
        closeMenu();

        if (val !== currentYear) {
            await renderForYear(val);
        }
    });

    document.addEventListener('click', (e) => {
        if (!yearContainer.contains(e.target)) {
            closeMenu();
        }
    });

    // theme
    initThemeController({
        updateThemeUI,
        themeToggleEl: $('theme-toggle')
    });

    // TooltipService：入口模块负责 import + init（与 app.js 架构一致）
    if (!TooltipService) throw new Error('[Viz] TooltipService module not loaded');
    const tooltipTpl = $('tooltip-template');
    if (!(tooltipTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #tooltip-template must be a <template>');
    new TooltipService().init();

    let panels = [];
    let domMap = {};
    let charts = {};
    let resizeHandler = null;

    const noteTpl = $('viz-note-trigger-template');
    if (!(noteTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #viz-note-trigger-template must be a <template>');
    if (!noteTpl.content || !noteTpl.content.firstElementChild) throw new Error('[Viz] #viz-note-trigger-template is empty');

    function _buildPanelsForYear(year) {
        const grid = $('viz-grid');
        const chartTpl = $('viz-chart-card-template');
        const statsTpl = $('viz-stats-card-template');
        if (!(chartTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #viz-chart-card-template must be a <template>');
        if (!(statsTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #viz-stats-card-template must be a <template>');

        panels = _getPanelsForYear(year);
        _assertPanelsColumnsSatisfied(year, panels);
        domMap = {};

        grid.replaceChildren();
        const frag = document.createDocumentFragment();

        for (const key of panels) {
            const def = PANEL_DEFS[key];
            if (!def) throw new Error(`[Viz] Unknown panel "${key}" (PANEL_DEFS missing)`);

            if (def.type === 'chart') {
                const node = chartTpl.content.cloneNode(true);
                const cardEl = node.querySelector('.viz-card');
                const titleEl = node.querySelector('.viz-card-title');
                const chartEl = node.querySelector('.viz-chart');
                const noteEl = node.querySelector('.viz-chart-note');
                if (!cardEl) throw new Error('[Viz] .viz-card not found in chart card template');
                if (!titleEl) throw new Error('[Viz] .viz-card-title not found in chart card template');
                if (!chartEl) throw new Error('[Viz] .viz-chart not found in chart card template');
                if (!noteEl) throw new Error('[Viz] .viz-chart-note not found in chart card template');

                _requireString(def.title, `PANEL_DEFS["${key}"].title`);
                if (def.title.trim().length === 0) throw new Error(`[Viz] PANEL_DEFS["${key}"].title is empty`);
                titleEl.textContent = def.title;
                chartEl.id = `chart-${def.id}`;
                chartEl.setAttribute('aria-label', `${def.title}图表`);
                // "死因分布"独占一行（跨两列）
                if (def.id === 'cause') {
                    cardEl.classList.add('viz-card-full');
                }

                // "死因分布"：用 ⓘ Tooltip 触发器展示说明
                if (def.id === 'cause') {
                    const fragNote = noteTpl.content.cloneNode(true);
                    const trigger = fragNote.querySelector('.viz-note-trigger');
                    if (!(trigger instanceof HTMLButtonElement)) throw new Error('[Viz] .viz-note-trigger must be a <button>');
                    trigger.dataset.tooltip = CAUSE_TOOLTIP_TEXT;

                    noteEl.replaceChildren(fragNote);
                    noteEl.hidden = false;
                } else {
                    noteEl.textContent = '';
                    noteEl.hidden = true;
                }
                domMap[key] = chartEl;
                frag.appendChild(node);
            } else if (def.type === 'stats') {
                const node = statsTpl.content.cloneNode(true);
                const cardEl = node.querySelector('.viz-stats-card');
                const titleEl = node.querySelector('.viz-stats-card-title');
                const bodyEl = node.querySelector('.viz-stats-card-body');
                if (!cardEl) throw new Error('[Viz] .viz-stats-card not found in stats card template');
                if (!titleEl) throw new Error('[Viz] .viz-stats-card-title not found in stats card template');
                if (!bodyEl) throw new Error('[Viz] .viz-stats-card-body not found in stats card template');

                _requireString(def.title, `PANEL_DEFS["${key}"].title`);
                if (def.title.trim().length === 0) throw new Error(`[Viz] PANEL_DEFS["${key}"].title is empty`);
                titleEl.textContent = def.title;
                bodyEl.id = `stats-${def.id}`;
                
                // 时间统计独占一行
                if (def.id === 'timeStats') {
                    cardEl.classList.add('viz-card-full');
                }
                
                domMap[key] = bodyEl;
                frag.appendChild(node);
            } else {
                throw new Error(`[Viz] Unsupported panel type "${def.type}" for "${key}"`);
            }
        }

        grid.appendChild(frag);
    }

    async function renderForYear(year) {
        currentYear = year;
        _setYearToUrl(year);

        _buildPanelsForYear(year);

        // 加载数据
        const rows = await loadData(year);
        _assertRowsHaveColumns(year, rows, panels);
        const agg = aggregateForYear(rows, year, panels);
        
        // 计算时间统计
        const timeStats = computeTimeStats(rows, year);

        charts = renderCharts(panels, domMap, agg);
        renderStats(panels, domMap, timeStats);

        // 仅保留一个 resize 监听，避免重复绑定
        if (resizeHandler !== null) {
            window.removeEventListener('resize', resizeHandler);
        }
        resizeHandler = () => {
            const keys = Object.keys(charts);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const inst = charts[k];
                if (inst === null) throw new Error(`[Viz] charts["${k}"] is null`);
                if (inst === undefined) throw new Error(`[Viz] charts["${k}"] is undefined`);
                if (typeof inst.resize !== 'function') throw new Error(`[Viz] charts["${k}"].resize is not a function`);
                inst.resize();
            }
        };
        window.addEventListener('resize', resizeHandler, { passive: true });
    }
    
    function renderStats(panels, domMap, timeStats) {
        for (const panelName of panels) {
            const def = PANEL_DEFS[panelName];
            if (!def || def.type !== 'stats') continue;
            
            const el = domMap[panelName];
            if (!el) throw new Error(`[Viz] Stats dom missing for panel "${panelName}"`);
            
            if (def.id === 'timeStats') {
                _renderTimeStats(el, timeStats);
            }
        }
    }
    
    function _renderTimeStats(container, stats) {
        container.replaceChildren();
        
        if (!stats.maxDeathsInOneDay && !stats.maxDeathsInOneWeek && !stats.longestGap && !stats.avgInterval) {
            container.textContent = '暂无数据';
            return;
        }
        
        const itemTpl = $('viz-stats-item-template');
        const detailLineTpl = $('stats-detail-line-template');
        if (!(itemTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #viz-stats-item-template must be a <template>');
        if (!(detailLineTpl instanceof HTMLTemplateElement)) throw new Error('[Viz] #stats-detail-line-template must be a <template>');
        
        const frag = document.createDocumentFragment();
        
        // 1. 同一天最多
        if (stats.maxDeathsInOneDay) {
            const { count, dates } = stats.maxDeathsInOneDay;
            const item = itemTpl.content.cloneNode(true);
            const labelEl = item.querySelector('.stats-item-label');
            const valueEl = item.querySelector('.stats-item-value');
            const detailEl = item.querySelector('.stats-item-detail');
            
            labelEl.textContent = '同一天去世马匹最多';
            valueEl.textContent = `${count} 匹`;
            
            detailEl.replaceChildren();
            for (const { date, horses } of dates) {
                const dateStr = _formatDate(date);
                const line = detailLineTpl.content.cloneNode(true);
                const p = line.querySelector('p');
                const strong = line.querySelector('strong');
                
                strong.textContent = dateStr;
                p.appendChild(document.createTextNode(': '));
                p.appendChild(document.createTextNode(horses.join(', ')));
                
                detailEl.appendChild(line);
            }
            
            frag.appendChild(item);
        }
        
        // 2. 同一周最多
        if (stats.maxDeathsInOneWeek) {
            const { count, weeks } = stats.maxDeathsInOneWeek;
            const item = itemTpl.content.cloneNode(true);
            const labelEl = item.querySelector('.stats-item-label');
            const valueEl = item.querySelector('.stats-item-value');
            const detailEl = item.querySelector('.stats-item-detail');
            
            labelEl.textContent = '同一周去世马匹最多';
            valueEl.textContent = `${count} 匹`;
            
            detailEl.replaceChildren();
            for (const { weekKey, horses } of weeks) {
                const line = detailLineTpl.content.cloneNode(true);
                const p = line.querySelector('p');
                const strong = line.querySelector('strong');
                
                strong.textContent = weekKey;
                p.appendChild(document.createTextNode(': '));
                p.appendChild(document.createTextNode(horses.join(', ')));
                
                detailEl.appendChild(line);
            }
            
            frag.appendChild(item);
        }
        
        // 3. 最长间隔
        if (stats.longestGap) {
            const { days, start, end } = stats.longestGap;
            const item = itemTpl.content.cloneNode(true);
            const labelEl = item.querySelector('.stats-item-label');
            const valueEl = item.querySelector('.stats-item-value');
            const detailEl = item.querySelector('.stats-item-detail');
            
            labelEl.textContent = '最长无马匹去世间隔';
            valueEl.textContent = `${days} 天`;
            
            const startDate = new Date(start);
            startDate.setDate(startDate.getDate() + 1);
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() - 1);
            
            const startStr = _formatDate(startDate);
            const endStr = _formatDate(endDate);
            
            const line = detailLineTpl.content.cloneNode(true);
            const p = line.querySelector('p');
            
            p.textContent = `${startStr} ~ ${endStr}`;
            
            detailEl.replaceChildren(line);
            
            frag.appendChild(item);
        }
        
        // 4. 平均间隔
        if (stats.avgInterval !== null && stats.avgInterval !== undefined) {
            const item = itemTpl.content.cloneNode(true);
            const labelEl = item.querySelector('.stats-item-label');
            const valueEl = item.querySelector('.stats-item-value');
            const detailEl = item.querySelector('.stats-item-detail');
            
            labelEl.textContent = '平均每隔多少天有马匹去世';
            valueEl.textContent = `${stats.avgInterval.toFixed(2)} 天`;
            
            // 添加计算说明
            const noteTpl = $('stats-note-template');
            const note = noteTpl.content.cloneNode(true);
            const noteP = note.querySelector('.stats-note');
            noteP.textContent = '计算公式：年总天数 ÷ 去重后的逝世日期数量（而非去世马匹总数）。' +
                '原因：同一天去世的多匹马只占用一个日期，使用马匹总数会导致平均间隔失真。';
            detailEl.appendChild(note);
            
            frag.appendChild(item);
        }
        
        container.appendChild(frag);
    }


    // 主题切换后：重绘 echarts（让 dark theme 生效）
    $('theme-toggle').addEventListener('click', async () => {
        await renderForYear(currentYear);
    });

    // initial render
    await renderForYear(currentYear);
}

run();

