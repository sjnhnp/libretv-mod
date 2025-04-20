// =============================
// 全局配置文件 /js/config.js
// - 提供全站常量与参数设置
// - 在所有前端脚本全局访问（通过 window.xxx 挂载）
// =============================

/* ---------------------------
   1. 代理相关配置（CORS/转发）
--------------------------- */
// 备选代理URL列表（内置、第三方）
const DEFAULT_PROXY_URLS = [
    "/proxy/", // 推荐：自建Cloudflare Functions代理，生产部署默认
    // 备用代理示例，未默认启用：
    // "https://api.codetabs.com/v1/proxy?quest=",
    // "https://crossorigin.me/",
    // "https://cors-proxy.htmldriven.com/?url=",
    // "http://alloworigin.com/get?url=",
    // "https://api.allorigins.win/get?url="
];
// 最终使用的代理URL，可通过window.__ENV__注入覆盖（一般用于Docker或Cloudflare部署）
window.PROXY_URL  = (window.__ENV__ && window.__ENV__.PROXY_URL)  || DEFAULT_PROXY_URLS[0];
window.PROXY_URLS = (window.__ENV__ && window.__ENV__.PROXY_URLS) || DEFAULT_PROXY_URLS;

/* -------------------------------
   2. 历史搜索与本地存储常量
------------------------------- */
window.SEARCH_HISTORY_KEY = 'videoSearchHistory'; // 搜索历史storage键名
const MAX_HISTORY_ITEMS   = 5; // 搜索历史最大数量

/* -------------------------------
   3. 密码保护配置（如开启）
------------------------------- */
window.PASSWORD_CONFIG = {
    localStorageKey: 'passwordVerified',               // 校验结果缓存键名
    verificationTTL:  90 * 24 * 60 * 60 * 1000,        // 验证有效时间（毫秒)—约90天
};

/* -------------------------------
   4. 站点元信息
------------------------------- */
window.SITE_CONFIG = {
    name:        'LibreTV',
    url:         'https://libretv.is-an.org',
    description: '免费在线视频搜索与观看平台',
    logo:        'https://images.icon-icons.com/38/PNG/512/retrotv_5520.png',
    version:     '1.0.3'
};

/* -------------------------------------
   5. API数据源（多站聚合，含成人源标注）
-------------------------------------- */
// 站点ID: {api, name, [adult], [detail]}
window.API_SITES = {
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
    // ...如需扩展请仿此格式追加
};

/* -----------------------------------
   6. 聚合搜索相关参数
------------------------------------ */
window.AGGREGATED_SEARCH_CONFIG = {
    enabled:          true,   // 是否聚合多源
    timeout:          8000,   // 单源超时上限（ms）
    maxResults:       10000,  // 聚合最多返回条数
    parallelRequests: true,   // 全部源并发
    showSourceBadges: true    // 前端结果显示来源
};

/* -----------------------------------
   7. 通用API请求配置
------------------------------------ */
window.API_CONFIG = {
    search: {
        // 固定搜索接口参数格式
        path:    '/api.php/provide/vod/?ac=videolist&wd=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept':     'application/json'
        }
    },
    detail: {
        // 获取详情时参数格式（ID查询方式）
        path:    '/api.php/provide/vod/?ac=videolist&ids=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept':     'application/json'
        }
    }
};

/* ------------------------------------------
   8. M3U8播放与资源分段链接正则匹配
------------------------------------------- */
// 匹配形如 "$http(s)://...m3u8" 的播放地址（部分API使用）
window.M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

/* ------------------------------------------
   9. 播放器与前端视频相关配置
------------------------------------------ */
window.CUSTOM_PLAYER_URL = 'player.html'; // 指向内置播放器页面（相对路径）

window.PLAYER_CONFIG = {
    autoplay:             true,      // 打开后自动播放
    allowFullscreen:      true,      // 支持全屏
    width:                '100%',    // 播放器宽度
    height:               '600',     // 播放器高度
    timeout:              15000,     // 加载超时（ms）
    filterAds:            true,      // 启用广告屏蔽
    autoPlayNext:         true,      // 自动连播
    adFilteringEnabled:   true,      // 开启M3U8广告过滤
    adFilteringStorage:   'adFilteringEnabled' // 广告过滤本地存储键
};

// ==== LibreTV: 预加载功能与调试日志开关 ====
// 是否启用播放器多集预加载功能（见player.html微调）。如需关闭，设为 false
window.PLAYER_CONFIG.enablePreloading = true;  // 可根据需要设为 false

// 是否启用详细调试日志（推荐测试/定位问题时启用）。如需关闭，设为 false 或删除此行
window.PLAYER_CONFIG.debugMode = true;         // 或 false/留空关闭详细日志

/* ---------------------------------
   10. 通用错误信息配置
---------------------------------- */
window.ERROR_MESSAGES = {
    NETWORK_ERROR: '网络连接错误，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长',
    API_ERROR:     'API接口返回错误，请尝试更换数据源',
    PLAYER_ERROR:  '播放器加载失败，请尝试其他视频源',
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试'
};

/* ---------------------------------
   11. 前端安全&请求限制相关配置
----------------------------------- */
window.SECURITY_CONFIG = {
    enableXSSProtection: true,  // 是否前端粗防XSS
    sanitizeUrls:        true,  // 启用URL净化
    maxQueryLength:      100    // 最大搜索长度
    // allowedApiDomains 等已弃用，改由代理统一过滤
};

/* ---------------------------------
   12. 自定义API数据源相关配置
----------------------------------- */
window.CUSTOM_API_CONFIG = {
    separator:      ',',           // 多源输入分隔符
    maxSources:     5,             // 支持最大自定义源数
    testTimeout:    5000,          // 连通性测试超时（ms）
    namePrefix:     'Custom-',     // 自动命名前缀
    validateUrl:    true,          // 严格校验URL
    cacheResults:   true,          // 连通性缓存
    cacheExpiry:    5184000000,    // 缓存两个月
    adultPropName:  'isAdult'      // 前端自定义源需用此字段标记
};

/* ---------------------------------
   13. 内置成人采集源隐藏参数
----------------------------------- */
window.HIDE_BUILTIN_ADULT_APIS = true; // true=前端默认不展示成人源
