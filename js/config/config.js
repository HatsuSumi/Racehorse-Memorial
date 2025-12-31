// ================= 配置区 =================
export const CONFIG = {
    // 这里列出所有要在侧边栏显示的年份
    availableYears: [2025, 2026, 2027, 2028], 
    defaultYear: 2025,
    // 只有在 csvHeaders 中配置了的年份，才会被认为是“可用”的
    // 没有配置的年份将显示为禁用状态
    csvHeaders: {
        "2025": [
            "序号", "图片", "马名", "所属", "出生", "逝世", "父", "祖父", "母", "母父", 
            "逝世地", "享年", "死因", "战绩", "奖金", "主胜鞍", "备注"
        ]
    },

    /**
     * 按年份配置“可排序列”
     * - 只声明你认为“有意义”的数字/日期类排序
     * - key 必须与 csvHeaders 的列名完全一致
     *
     * type:
     * - date: YYYY-MM-DD
     * - flexDate: 支持 YYYY-MM-DD / YYYY/M/D / 范围 / 不晚于...
     * - age: 形如 "32岁"
     * - number: 纯数字（或带逗号的数字字符串）
     */
    sortableColumns: {
        "2025": {
            "出生": { type: "date" },
            "逝世": { type: "flexDate" },
            "享年": { type: "age" },

            // 复杂排序：按配置汇率折算后排序
            "奖金": { type: "money" },

            // 复杂排序：点击表头弹窗选择指标/升降序
            "战绩": { type: "record" }
        }
    },

    /**
     * 奖金折算汇率配置（用于“奖金”排序）
     * - base: 统一折算到哪个币种（用于提示/可读性）
     * - rates: 1 单位 currency = rates[currency] 单位 base
     *
     * 例：base=CNY，rates.USD=7.20 表示 1 美元 ≈ 7.20 元
     *
     * 你可以按需要随时更新这组汇率（排序结果会随配置变化）。
     */
    exchangeRates: {
        base: "JPY",
        rates: {
            // 1 单位 currency ≈ rates[currency] 日圆
            JPY: 1,
            USD: 155.8,
            AUD: 103.0,
            HKD: 20.02,
            CNY: 22.13,
            EUR: 182.5,
            GBP: 208.6,
            SEK: 16.73,
            NOK: 15.26
        }
    },
    // 按年份配置参考文献
    references: {
        "2025": [
            "https://dir.netkeiba.com/keibamatome/detail.html?no=4630",
            "https://meiba.jp/news/list/2/all",
            "https://ja.wikipedia.org/wiki/2025%E5%B9%B4%E3%81%AE%E6%97%A5%E6%9C%AC%E7%AB%B6%E9%A6%AC",
            "https://mag-p.com/2451/",
            "https://zh.wikipedia.org/wiki/Category:2025%E5%B9%B4%E9%80%9D%E4%B8%96%E7%9A%84%E5%8B%95%E7%89%A9",
            "https://en.wikipedia.org/wiki/Category:2025_racehorse_deaths",
            "https://sv.wikipedia.org/wiki/Kategori:H%C3%A4star_avlidna_2025",
            "https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Animal_mort_en_2025",
            "https://en.wikipedia.org/wiki/Category:2025_animal_deaths",
            "https://ko.wikipedia.org/wiki/%EB%B6%84%EB%A5%98:2025%EB%85%84_%EC%A3%BD%EC%9D%80_%EA%B2%BD%EC%A3%BC%EB%A7%88",
            "以及直接在Google搜索site:www.jra.go.jp/news (死亡 OR 永眠 OR 死去 OR 予後不良 OR R.I.P OR 天国 OR 冥福) after:2025-01-01 before:2026-01-01的结果"
        ]
    },
    // 参考文献默认显示的条数阈值
    maxVisibleReferences: 3,

    /**
     * 图片序号覆盖配置
     * - 用于处理后续补充的马匹，JSON序号与图片文件名序号不一致的情况
     * - 按年份分组，key 为 JSON 中的序号，value 为图片文件名中的序号
     * 
     * 例：JSON中序号16的马，图片文件名是 15_HorseName.jpg
     * 则配置：{ "2025": { 16: 15 } }
     */
    imageSerialOverride: {
        "2025": {
            // 示例：
            // 16: 15,
            // 20: 18
        }
    },

    /**
     * 按年份配置“可视化页面内容”
     * - 这里配置的是“要显示哪些图表/面板”（不是列名）
     * - 可视化页会根据当年配置的 panels 动态渲染图表卡片
     * - 这样每年的可视化内容可以不一样（例如 2026 新增“性别/毛色”）
     *
     * 如果会“改列名”（例如 2026 把“逝世”改成“逝世日期”）
     * 则需要配置 columnsByYear，把“规范字段名”映射到当年真实列名（Fail Fast：缺映射/缺列名直接报错）
     *
     * panels（中文面板名，见 viz.js 内置面板定义）：
     * - 月份分布（逝世列 flexDate 口径）
     * - 享年分布（逐岁）
     * - 主胜鞍分布（G1 / G2-G3 / 无分级胜鞍）
     * - 性别分布（需要数据字段：性别）
     * - 毛色分布（需要数据字段：毛色）
     * - 品种分布（需要数据字段：品种）
     * - 死因分布（基于“死因（用于统计）”列，标签以 | 分隔，支持多标签计数）
     * - 殒命赛场分布（平地/障碍）（同样基于“死因（用于统计）”列中的 殒命赛场/... 标签）
     */
    visualizations: {
        byYear: {
            "2025": ["月份分布", "享年分布", "主胜鞍分布", "殒命赛场分布", "死因分布", "时间统计"],
        },

        /**
         * 按年份配置"规范字段名 -> 当年真实列名"的映射
         * - 规范字段名（左侧）是可视化代码内部使用的稳定 key
         * - 真实列名（右侧）必须存在于对应年份的数据源中（可视化允许使用"隐藏列"，不要求出现在 csvHeaders）
         *
         * 例：如果 2026 把"逝世"列改名为"逝世日期"，则写：
         * "2026": { "逝世": "逝世日期", ... }
         */
        columnsByYear: {
            "2025": {
                "逝世": "逝世",
                "享年": "享年",
                "主胜鞍": "主胜鞍",
                "死因（用于统计）": "死因（用于统计）",
                "马名": "马名"
            }
        }
    }
};
