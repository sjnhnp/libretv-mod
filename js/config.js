// =============================
// 全局配置模块（ESM重构版） /js/config.js
// =============================

// 1. 代理相关配置
export const DEFAULT_PROXY_URLS = [
    "/proxy/"
];

export const PROXY_URL  = (window.__ENV__ && window.__ENV__.PROXY_URL)  || DEFAULT_PROXY_URLS[0];
export const PROXY_URLS = (window.__ENV__ && window.__ENV__.PROXY_URLS) || DEFAULT_PROXY_URLS;

// 2. 历史和本地存储
export const SEARCH_HISTORY_KEY = 'videoSearchHistory';
export const MAX_HISTORY_ITEMS = 5;

// 3. 密码保护配置
export const PASSWORD_CONFIG = {
    localStorageKey: 'passwordVerified',
    verificationTTL: 90 * 24 * 60 * 60 * 1000
};

// 4. 站点元信息
export const SITE_CONFIG = {
    name: 'X',
    url: '',
    description: '',
    logo: 'https://images.icon-icons.com/38/PNG/512/retrotv_5520.png',
    version: '1.0.3'
};

// 5. API数据源
export const API_SITES = {
    heimuer:  { api: 'https://json.heimuer.xyz',      name: '黑木耳',   detail: 'https://heimuer.tv'  },
    ffzy:     { api: 'http://ffzy5.tv',               name: '非凡影视', detail: 'http://ffzy5.tv'    },
    tyyszy:   { api: 'https://tyyszy.com',            name: '天涯资源'                          },
    ckzy:     { api: 'https://www.ckzy1.com',         name: 'CK资源',   adult: true                },
    zy360:    { api: 'https://360zy.com',             name: '360资源'                           },
    wolong:   { api: 'https://wolongzyw.com',         name: '卧龙资源'                          },
    cjhw:     { api: 'https://cjhwba.com',            name: '新华为'                            },
    hwba:     { api: 'https://cjwba.com',             name: '华为吧资源'                        },
    jisu:     { api: 'https://jszyapi.com',           name: '极速资源', detail: 'https://jszyapi.com' },
    dbzy:     { api: 'https://dbzy.com',              name: '豆瓣资源'                          },
    bfzy:     { api: 'https://bfzyapi.com',           name: '暴风资源'                          },
    mozhua:   { api: 'https://mozhuazy.com',          name: '魔爪资源'                          },
    mdzy:     { api: 'https://www.mdzyapi.com',       name: '魔都资源'                          },
    ruyi:     { api: 'https://cj.rycjapi.com',        name: '如意资源'                          },
    jkun:     { api: 'https://jkunzyapi.com',         name: 'jkun资源', adult: true              },
    bwzy:     { api: 'https://api.bwzym3u8.com',      name: '百万资源', adult: true              },
    souav:    { api: 'https://api.souavzy.vip',       name: 'souav资源', adult: true            },
    siwa:     { api: 'https://siwazyw.tv',            name: '丝袜资源', adult: true              },
    r155:     { api: 'https://155api.com',            name: '155资源',  adult: true              },
    lsb:      { api: 'https://apilsbzy1.com',         name: 'lsb资源',  adult: true              },
    huangcang:{ api: 'https://hsckzy.vip',            name: '黄色仓库', adult: true, detail: 'https://hsckzy.vip' }
};

// 6. 聚合搜索相关参数
export const AGGREGATED_SEARCH_CONFIG = {
    enabled:          true,
    timeout:          8000,
    maxResults:       10000,
    parallelRequests: true,
    showSourceBadges: true
};

// 7. API请求配置
export const API_CONFIG = {
    search: {
        path:    '/api.php/provide/vod/?ac=videolist&wd=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept':     'application/json'
        }
    },
    detail: {
        path:    '/api.php/provide/vod/?ac=videolist&ids=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept':     'application/json'
        }
    }
};

// 8. M3U8分段正则
export const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

// 9. 播放器相关配置
export const CUSTOM_PLAYER_URL = 'player.html';

export const PLAYER_CONFIG = {
    autoplay:             true,
    allowFullscreen:      true,
    width:                '100%',
    height:               '600',
    timeout:              15000,
    filterAds:            true,
    autoPlayNext:         true,
    adFilteringEnabled:   true,
    adFilteringStorage:   'adFilteringEnabled',
    enablePreloading:     true,
    debugMode:            false
};

// 10. 通用错误信息
export const ERROR_MESSAGES = {
    NETWORK_ERROR: '网络连接错误，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长',
    API_ERROR:     'API接口返回错误，请尝试更换数据源',
    PLAYER_ERROR:  '播放器加载失败，请尝试其他视频源',
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试'
};

// 11. 安全配置
export const SECURITY_CONFIG = {
    enableXSSProtection: true,
    sanitizeUrls:        true,
    maxQueryLength:  100
};

// 12. 自定义API相关
export const CUSTOM_API_CONFIG = {
    separator:      ',',
    maxSources:     5,
    testTimeout:    5000,
    namePrefix:     'Custom-',
    validateUrl:    true,
    cacheResults:   true,
    cacheExpiry:    5184000000,
    adultPropName:  'isAdult'
};

// 13. 成人采集源隐藏
export const HIDE_BUILTIN_ADULT_APIS = true;
