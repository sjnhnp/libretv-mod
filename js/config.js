// --- File: js/config.js ---
// 全局常量配置
const PROXY_URL = '/proxy/'; 
const SEARCH_HISTORY_KEY = 'videoSearchHistory'; 
const MAX_HISTORY_ITEMS = 5; // As per new.txt, old.txt had 30 for search history. You can adjust this.

// 密码保护配置 (from new.txt, assuming this is preferred)
window.PASSWORD_CONFIG = window.PASSWORD_CONFIG || { 
    localStorageKey: 'passwordVerified', 
    verificationTTL: 90 * 24 * 60 * 60 * 1000, // 90天验证有效期 
};

// 网站信息配置 (from new.txt)
const SITE_CONFIG = { 
    name: 'x', 
    url: '', 
    description: '', 
    logo: 'https://images.icon-icons.com/38/PNG/512/retrotv_5520.png', 
    version: '1.0.3' 
};

// API站点配置 (Structure from old.txt: `api` is the full base URL for the API endpoint)
const API_SITES = { 
    // 影视资源
    heimuer: { api: 'https://json.heimuer.xyz/api.php/provide/vod', name: '黑木耳', detail: 'https://heimuer.tv' }, 
    bfzy: { api: 'https://bfzyapi.com/api.php/provide/vod', name: '暴风资源' }, 
    tyyszy: { api: 'https://tyyszy.com/api.php/provide/vod', name: '天涯资源' }, 
    dbzy: { api: 'https://caiji.dbzy5.com/api.php/provide/vod', name: '豆瓣资源' }, 
    hwba: { api: 'https://cjhwba.com/api.php/provide/vod', name: '华为吧资源' }, 
    ruyi: { api: 'https://cj.rycjapi.com/api.php/provide/vod', name: '如意资源' }, 
    maotai: { api: 'https://caiji.maotaizy.cc/api.php/provide/vod', name: '茅台资源' }, 
    wolong: { api: 'https://wolongzyw.com/api.php/provide/vod', name: '卧龙资源' }, 
    dyttzy: { api: 'http://caiji.dyttzyapi.com/api.php/provide/vod', name: '电影天堂', detail: 'http://caiji.dyttzyapi.com' }, 
    zy360: { api: 'https://360zy.com/api.php/provide/vod', name: '360资源' }, 
    jisu: { api: 'https://jszyapi.com/api.php/provide/vod', name: '极速资源', detail: 'https://jszyapi.com' }, 
    huya: { api: 'https://www.huyaapi.com/api.php/provide/vod', name: '虎牙资源', detail: 'https://www.huyaapi.com', }, 
    mozhua: { api: 'https://mozhuazy.com/api.php/provide/vod', name: '魔爪资源' }, 
    mdzy: { api: 'https://www.mdzyapi.com/api.php/provide/vod', name: '魔都资源' }, 
    zuid: { api: 'https://api.zuidapi.com/api.php/provide/vod', name: '最大资源' }, 
    yinghua: { api: 'https://m3u8.apiyhzy.com/api.php/provide/vod', name: '樱花资源' }, 
    baidu: { api: 'https://api.apibdzy.com/api.php/provide/vod', name: '百度云资源' }, 
    wujin: { api: 'https://api.wujinapi.me/api.php/provide/vod', name: '无尽资源' }, 
    wwzy: { api: 'https://wwzy.tv/api.php/provide/vod', name: '旺旺短剧' }, 
    ikun: { api: 'https://ikunzyapi.com/api.php/provide/vod', name: 'iKun资源' } 
};

// 聚合搜索配置 (from new.txt)
const AGGREGATED_SEARCH_CONFIG = { 
    enabled: true, 
    timeout: 8000, 
    maxResults: 10000, 
    parallelRequests: true, 
    showSourceBadges: true 
};

// API请求配置 (Structure from old.txt: `path` is the query string part)
const API_CONFIG = { 
    search: {
        path: '?ac=videolist&wd=', // Query parameters for search
        // pagePath: '?ac=videolist&wd={query}&pg={page}', // Kept for reference if pagination is added later
        // maxPages: 50, // Kept for reference
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', 
            'Accept': 'application/json' 
        }
    },
    detail: {
        path: '?ac=videolist&ids=', // Query parameters for detail by ID
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', 
            'Accept': 'application/json' 
        }
    }
};

// 正则表达式模式 (from new.txt)
const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g; 

// 自定义播放器URL (from new.txt)
const CUSTOM_PLAYER_URL = 'player.html'; 

// 预加载集数开关 (from new.txt)
const DEFAULTS = { 
    enablePreloading: true, 
    preloadCount: 2,       
    debugMode: false      
};

// Helper function to get boolean config from localStorage (from new.txt)
function getBoolConfig(key, def) { 
    try {
        const v = localStorage.getItem(key); 
        if (v === null) return def; 
        return v === 'true' || v === true; 
    } catch (e) {
        console.warn(`Error reading boolean config for ${key}:`, e); 
        return def; 
    }
}

// Helper function to get integer config from localStorage (from new.txt)
function getIntConfig(key, def, min = 0, max = 10) { 
    try {
        const raw = localStorage.getItem(key); 
        if (raw === null) return def; 
        const v = parseInt(typeof raw === 'string' ? raw : String(raw)); 
        return (!isNaN(v) && v >= min && v <= max) ? v : def; 
    } catch (e) {
        console.warn(`Error reading integer config for ${key}:`, e); 
        return def; 
    }
}

// 播放器配置 (from new.txt, using helpers)
const PLAYER_CONFIG = { 
    autoplay: true, 
    allowFullscreen: true, 
    width: '100%', 
    height: '600', 
    timeout: 15000, 
    filterAds: false, // This might be controlled by adFilteringEnabled now
    autoPlayNext: true, 
    adFilteringEnabled: getBoolConfig('adFilteringEnabled', false), 
    adFilteringStorage: 'adFilteringEnabled', 
    enablePreloading: getBoolConfig('enablePreloading', DEFAULTS.enablePreloading), 
    preloadCount: getIntConfig('preloadCount', DEFAULTS.preloadCount, 1, 10), 
    debugMode: getBoolConfig('preloadDebugMode', DEFAULTS.debugMode), 
};
window.PLAYER_CONFIG = PLAYER_CONFIG; 

// 错误消息本地化 (from new.txt)
const ERROR_MESSAGES = { 
    NETWORK_ERROR: '网络连接错误，请检查网络设置', 
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长', 
    API_ERROR: 'API接口返回错误，请尝试更换数据源', 
    PLAYER_ERROR: '播放器加载失败，请尝试其他视频源', 
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试' 
};

// 安全配置 (from new.txt)
const SECURITY_CONFIG = { 
    enableXSSProtection: true,  
    sanitizeUrls: true,         
    maxQueryLength: 100        
};

// 自定义API配置 (from new.txt)
const CUSTOM_API_CONFIG = { 
    separator: ',',           
    maxSources: 5,           
    testTimeout: 5000,       
    namePrefix: 'Custom-',    
    validateUrl: true,        
    cacheResults: true,       
    cacheExpiry: 5184000000, 
    adultPropName: 'isAdult'  
};

// 隐藏内置黄色采集站API的变量 (from new.txt)
const HIDE_BUILTIN_ADULT_APIS = true; 
