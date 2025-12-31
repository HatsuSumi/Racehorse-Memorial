// ================= 主题配置与工具函数 =================

/**
 * Hex转RGB工具函数 (补全依赖)
 */
function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

/**
 * 判断颜色是否为浅色（使用YIQ亮度算法）
 */
function isLightColor(color, threshold = 155) {
    if (typeof color !== 'string') return false;

    // 提取颜色字符串中的第一个十六进制颜色（支持渐变）
    const match = color.match(/#([0-9a-fA-F]{6})/);
    if (!match) return false;

    // 使用统一的颜色转换工具函数
    const { r, g, b } = hexToRgb('#' + match[1]);

    // 计算相对亮度（YIQ算法）
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > threshold;
}

// 背景渐变数组
const BACKGROUNDS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    'linear-gradient(135deg, #ff9a56 0%, #ff6a88 50%, #ff99ac 100%)',
    'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)',
    'linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%)',
    'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
    'linear-gradient(135deg, #05ffa3 0%, #00d4ff 100%)',
    'linear-gradient(135deg, #fdbb2d 0%, #22c1c3 100%)',
    'linear-gradient(135deg, #ff6a00 0%, #ee0979 100%)',
    'linear-gradient(135deg, #2196f3 0%, #00bcd4 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 90%, #2bff88 100%)',
    'linear-gradient(135deg, #434343 0%, #000000 100%)',
    'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
    'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
    'linear-gradient(135deg, #d32f2f 0%, #7b1fa2 100%)',
    'linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)',
    'linear-gradient(135deg, #f83600 0%, #f9d423 100%)',
    'linear-gradient(135deg, #ff512f 0%, #dd2476 100%)',
    'linear-gradient(135deg, #ffc107 0%, #ff6f00 100%)',
    'linear-gradient(135deg, #ff758c 0%, #ff7eb3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%)'
];

const LIGHT_TEXT_COLORS = ['#ffffff', '#f0f0f0', '#e3f2fd', '#fce4ec', '#e8f5e9', '#fff3e0', '#f3e5f5', '#e0f7fa', '#fffde7', '#fafafa'];
const DARK_TEXT_COLORS = ['#000000', '#1a237e', '#4a148c', '#1b5e20', '#6d1b07', '#33691e', '#004d40', '#212121', '#880e4f', '#311b92', '#263238', '#3e2723'];

const ANIMATIONS = ['scale-fade', 'slide-up', 'slide-down', 'bounce', 'rotate-fade', 'blur-fade'];

// 模块级状态，用于避免重复（替代原类的实例属性）
let lastBackground = null;
let lastTextColor = null;
let lastAnimation = null;

/**
 * 获取随机主题预设
 * @returns {Object} { background, textColor, animation }
 */
export function getRandomPreset() {
    let background;
    do {
        background = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
    } while (background === lastBackground && BACKGROUNDS.length > 1);
    lastBackground = background;

    const isLight = isLightColor(background, 155);
    const textColorPool = isLight ? DARK_TEXT_COLORS : LIGHT_TEXT_COLORS;
    
    let textColor;
    do {
        textColor = textColorPool[Math.floor(Math.random() * textColorPool.length)];
    } while (textColor === lastTextColor && textColorPool.length > 1);
    lastTextColor = textColor;

    let animation;
    do {
        animation = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
    } while (animation === lastAnimation && ANIMATIONS.length > 1);
    lastAnimation = animation;

    return { background, textColor, animation };
}
