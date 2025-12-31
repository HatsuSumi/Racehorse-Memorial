// 数据缓存池：存储已加载的年份数据
const dataCache = {};

/**
 * 加载特定年份的数据
 * @param {number|string} year - 年份
 * @returns {Promise<Array>} 返回数据数组
 */
export async function loadData(year) {
    // 性能优化：优先从内存缓存读取
    if (dataCache[year]) {
        return dataCache[year];
    }

    // 缓存未命中，发起网络请求
    // 添加时间戳防止浏览器强缓存 (仅对首次请求有效)
    const response = await fetch(`data/${year}.json?t=${new Date().getTime()}`);
    
    if (!response.ok) {
        throw new Error(`无法加载 ${year} 年数据`);
    }

    const data = await response.json();
    
    // 写入缓存
    dataCache[year] = data;
    
    return data;
}
