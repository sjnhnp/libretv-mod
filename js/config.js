// 全局常量配置
const PROXY_URL = '/proxy/'; // 适用于 Cloudflare, Netlify (带重写), Vercel (带重写)
const SEARCH_HISTORY_KEY = 'videoSearchHistory';
const MAX_HISTORY_ITEMS = 5;

// 密码保护配置
window.PASSWORD_CONFIG = window.PASSWORD_CONFIG || {
    localStorageKey: 'passwordVerified',
    verificationTTL: 90 * 24 * 60 * 60 * 1000, // 90天验证有效期
};

// 网站信息配置
const SITE_CONFIG = {
    name: 'x',
    url: '',
    description: '',
    logo: 'https://images.icon-icons.com/38/PNG/512/retrotv_5520.png',
    version: '1.0.3'
};

// API站点配置（按功能分类）
const API_SITES = {
    // 影视资源
    heimuer: {
        api: 'https://json.heimuer.xyz',
        name: '黑木耳',
        detail: 'https://heimuer.tv',
    },
    ffzy: {
        api: 'http://ffzy5.tv',
        name: '非凡影视',
        detail: 'http://ffzy5.tv',
    },

    tyyszy: { api: 'https://tyyszy.com', name: '天涯资源' },
    zy360: { api: 'https://360zy.com', name: '360资源' },
    wolong: { api: 'https://wolongzyw.com', name: '卧龙资源' },
    hwba: { api: 'https://cjhwba.com', name: '华为吧资源' },
    jisu: { api: 'https://jszyapi.com', name: '极速资源', detail: 'https://jszyapi.com' },
    dbzy: { api: 'https://dbzy.com', name: '豆瓣资源' },
    bfzy: { api: 'https://bfzyapi.com', name: '暴风资源' },
    mozhua: { api: 'https://mozhuazy.com', name: '魔爪资源' },
    mdzy: { api: 'https://www.mdzyapi.com', name: '魔都资源' },
    ruyi: { api: 'https://cj.rycjapi.com', name: '如意资源' },
    zuid: { api: 'https://api.zuidapi.com', name: '最大资源' },
    yinghua: { api: 'https://m3u8.apiyhzy.com', name: '樱花资源' },
    baidu: { api: 'https://api.apibdzy.com', name: '百度云资源' },
    wujin: { api: 'https://api.wujinapi.me', name: '无尽资源' }
};

// 聚合搜索配置
const AGGREGATED_SEARCH_CONFIG = {
    enabled: true,
    timeout: 8000, // 单个源超时时间（毫秒）
    maxResults: 10000,
    parallelRequests: true,
    showSourceBadges: true
};

// API请求配置
const API_CONFIG = {
    search: {
        path: '/api.php/provide/vod/?ac=videolist&wd=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    },
    detail: {
        path: '/api.php/provide/vod/?ac=videolist&ids=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    }
};

// 正则表达式模式
const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

// 自定义播放器URL
const CUSTOM_PLAYER_URL = 'player.html'; // 使用相对路径引用本地player.html

// 默认配置值（便于维护）
const DEFAULTS = {
    enablePreloading: true, // 预加载
    preloadCount: 2,       // 预加载集数
    debugMode: false       // 调试模式
};

// 播放器配置
const PLAYER_CONFIG = {
    autoplay: true,
    allowFullscreen: true,
    width: '100%',
    height: '600',
    timeout: 15000, // 播放器加载超时时间
    filterAds: true, // 是否启用广告过滤
    autoPlayNext: true, // 默认启用自动连播功能
    adFilteringEnabled: true, // 默认开启分片广告过滤
    adFilteringStorage: 'adFilteringEnabled', // 存储广告过滤设置的键名
    enablePreloading: getBoolConfig('enablePreloading', DEFAULTS.enablePreloading),
    preloadCount: getIntConfig('preloadCount', DEFAULTS.preloadCount, 1, 10),
    debugMode: getBoolConfig('preloadDebugMode', DEFAULTS.debugMode),
};

window.PLAYER_CONFIG = PLAYER_CONFIG;

// 错误消息本地化
const ERROR_MESSAGES = {
    NETWORK_ERROR: '网络连接错误，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长',
    API_ERROR: 'API接口返回错误，请尝试更换数据源',
    PLAYER_ERROR: '播放器加载失败，请尝试其他视频源',
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试'
};

// 安全配置
const SECURITY_CONFIG = {
    enableXSSProtection: true,  // 启用XSS保护
    sanitizeUrls: true,         // 清理URL
    maxQueryLength: 100        // 最大搜索长度
};

// 自定义API配置
const CUSTOM_API_CONFIG = {
    separator: ',',           // 分隔符
    maxSources: 5,           // 最大允许的自定义源数量
    testTimeout: 5000,       // 测试超时时间(毫秒)
    namePrefix: 'Custom-',    // 自定义源名称前缀
    validateUrl: true,        // 验证URL格式
    cacheResults: true,       // 缓存测试结果
    cacheExpiry: 5184000000, // 缓存过期时间(2个月)
    adultPropName: 'isAdult'  // 成人内容标记属性名
};

// 隐藏内置黄色采集站API的变量
const HIDE_BUILTIN_ADULT_APIS = true;

// 获取布尔配置值
function getBoolConfig(key, def) {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'true';
}

// 获取整数配置值
function getIntConfig(key, def, min = 0, max = 10) {
    const v = parseInt(localStorage.getItem(key));
    return (!isNaN(v) && v >= min && v <= max) ? v : def;
}
