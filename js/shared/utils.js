/**
 * 手写平滑滚动函数 (解决原生 behavior: smooth 被系统屏蔽的问题)
 * @param {number} targetPosition - 目标 Y 轴坐标
 * @param {number} duration - 动画持续时间 (ms)
 */
export function customSmoothScrollTo(targetPosition, duration = 800) {
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    let startTime = null;

    function animation(currentTime) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        
        // 缓动算法 (easeInOutQuad): 起步慢，中间快，结束慢
        const run = easeInOutQuad(timeElapsed, startPosition, distance, duration);
        
        window.scrollTo(0, run);

        if (timeElapsed < duration) {
            requestAnimationFrame(animation);
        } else {
            window.scrollTo(0, targetPosition); // 修正终点误差
        }
    }

    // t: current time, b: start value, c: change in value, d: duration
    function easeInOutQuad(t, b, c, d) {
        t /= d / 2;
        if (t < 1) return c / 2 * t * t + b;
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
    }

    requestAnimationFrame(animation);
}

/**
 * 等待 CSS Transition 结束的 Promise 封装
 * @param {HTMLElement} element 
 * @returns {Promise<void>}
 */
export function waitForTransition(element) {
    return new Promise(resolve => {
        const style = window.getComputedStyle(element);
        // Fail Fast: 如果没有 transition 或 display:none，立即解决
        if (style.transitionDuration === '0s' || style.display === 'none') {
            resolve();
            return;
        }

        const handler = () => {
            element.removeEventListener('transitionend', handler);
            resolve();
        };
        element.addEventListener('transitionend', handler, { once: true });
        
        // 安全兜底：防止 transitionend 未触发导致的死锁
        setTimeout(handler, 1000); 
    });
}

/**
 * 从马名中提取英文名 (用于图片路径)
 * @param {string} horseName - 马名字符串 (如 "火速姬|ハヤスギ|Hayasugi")
 * @returns {string} 提取到的英文名
 */
export function getEnglishName(horseName) {
    if (!horseName) return '';
    const nameParts = horseName.split('|');
    // 找到第一个主要由 ASCII 字符组成的片段
    return nameParts.find(p => /^[\u0020-\u007E]+$/.test(p.trim())) || '';
}

/**
 * 判断逝世地是否有效（用于计数）
 * 规则：
 * 1. 排除空、未公开、未公布、不详
 * 2. 排除包含"推定"的地址
 * 3. 必须包含具体的场所关键词（牧场、竞马场等）
 * 4. 必须包含行政区划（省、市、县、州等），确保写到最细分地址
 * @param {string} address - 逝世地地址
 * @returns {boolean}
 */
export function isValidDeathPlace(address) {
    // 🔧 开发者开关：设为 true 时输出逝世地验证日志
    const DEBUG_DEATH_PLACE = false;

    if (!address || typeof address !== 'string') {
        if (DEBUG_DEATH_PLACE) console.log('❌ 逝世地无效（空或非字符串）:', address);
        return false;
    }
    const cleanAddr = address.trim();

    // 1. 排除空、未公开
    if (["", "未公开", "未公布", "不详"].includes(cleanAddr)) {
        if (DEBUG_DEATH_PLACE) console.log('❌ 逝世地无效（空/未公开/不详）:', cleanAddr);
        return false;
    }

    // 2. 排除推定
    if (cleanAddr.includes("推定")) {
        if (DEBUG_DEATH_PLACE) console.log('❌ 逝世地无效（包含"推定"）:', cleanAddr);
        return false;
    }

    // 3. 必须包含特定场所关键词
    const placeKeywords = [
        // 中文
        '牧场', '竞马场', '赛马场', '马场', '诊疗所', '医院', '俱乐部', '基地', '中心', '公司', '大学', '学校', '自宅', '公园', '施設',
        '会', '站', '阵营', '马房', '场', '分场', '法人',  // 如"骏马会"、"种马站"、"Godolphin阵营"、"科尔姆·墨菲马房"、"コバン场"、"共和分场"、"NPO法人"
        // 英语
        'Farm', 'Stud', 'Racecourse', 'Clinic', 'Hospital', 'Club', 'Center', 'Centre', 
        'Stallion', 'Stable', 'Park', 'Sanctuary', 'Facility',
        'Coolmore',  // 著名牧场品牌名
        // 法语
        'Haras',  // 种马场
        // 印尼语
        'Gelanggang', 'Pacuan', 'Kuda',  // 赛马场相关
        // 瑞典语
        'Gård',  // 农场
        // 日语片假名（外来语）
        'ファーム', 'クラブ', 'センター', 'ステーション', 'ホスピタル', 'パーク', 'ステーブル'
    ];

    const matchedPlaceKeyword = placeKeywords.find(keyword => cleanAddr.includes(keyword));
    const hasPlace = !!matchedPlaceKeyword;
    
    if (!hasPlace) {
        if (DEBUG_DEATH_PLACE) console.log('❌ 逝世地无效（缺少场所关键词）:', cleanAddr);
        return false;
    }

    // 4. 必须包含行政区划关键词（确保写到最细分地址）
    const administrativeKeywords = [
        // 中文
        '省', '市', '区', '县', '郡', '町', '村', '州', '道', '府', '旗', '盟', '界',  // "界"如"新界"
        // 英语
        'State', 'County', 'Province', 'District', 'Region', 'Territory',
        // 其他
        'Prefecture', 'Canton', 'Oblast',  // 日本的"県"、瑞士的"州"、俄语区域等
        'kommun',  // 瑞典的"市镇"
        // 阿联酋
        'Dubai', '迪拜',
        // 瑞典地名（常见的）
        'Fjärdhundra', '菲尔德亨德拉', 'Uppland', 'Södermanland', 'Värmland', 'Dalarna'
    ];

    const matchedAdminKeyword = administrativeKeywords.find(keyword => cleanAddr.includes(keyword));
    const hasAdmin = !!matchedAdminKeyword;
    
    if (!hasAdmin) {
        if (DEBUG_DEATH_PLACE) console.log(`❌ 逝世地无效（缺少行政区划）: "${cleanAddr}" [场所关键词: ${matchedPlaceKeyword}]`);
        return false;
    }

    // 全部通过
    if (DEBUG_DEATH_PLACE) console.log(`✅ 逝世地有效: "${cleanAddr}" [场所: ${matchedPlaceKeyword}, 行政区划: ${matchedAdminKeyword}]`);
    return true;
}
