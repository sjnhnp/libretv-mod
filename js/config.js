// /js/config.js

// --- Core Settings ---

// Use a fixed proxy path, assuming Cloudflare Function is at /proxy/
export const PROXY_URL = "/proxy/";

// Fallback/alternate proxy URLs (Keep if used for testing or other purposes)
export const PROXY_URLS = [
    "/proxy/", // Default Cloudflare path
    // "https://your-custom-proxy.com/", // Example custom proxy
];

// --- History & Storage ---
export const SEARCH_HISTORY_KEY = "videoSearchHistory"; // Kept for potential direct use if needed
export const VIEWING_HISTORY_KEY = "viewingHistory"; // Kept for potential direct use if needed
export const MAX_HISTORY_ITEMS = 50; // Example limit

// --- Password Protection ---
export const PASSWORD_CONFIG = {
    localStorageKey: "passwordVerification",
    verificationTTL: 3 * 60 * 60 * 1000 // 3 hours in milliseconds
};

// --- Site Metadata (Example) ---
export const SITE_CONFIG = {
    title: "Libre TV",
    description: "一个简单的在线视频聚合搜索和播放应用",
    logoUrl: "./logo.png", // Example path
    faviconUrl: "./favicon.ico" // Example path
};

// --- Built-in API Source Definitions ---
export const API_SITES = {
    "ffzy": {
        "name": "非凡资源",
        "url": "https://cj.ffzyapi.com",
        "is_adult": false,
        "search": { "path": "/api.php/provide/vod/?ac=list&wd=" },
        "detail": { "path": "/api.php/provide/vod/?ac=detail&ids=" }
    },
    "xxzy": {
        "name": "迅速资源",
        "url": "https://api.xxzy.org",
        "is_adult": false,
        "search": { "path": "/api.php/provide/vod/at/json/?ac=list&wd=" },
        "detail": { "path": "/api.php/provide/vod/at/json/?ac=detail&ids=" }
    },
    "jinying": {
        "name": "金鹰资源",
        "url": "https://jyzyapi.com",
        "is_adult": false,
        "search": { "path": "/api.php/provide/vod/at/json/?ac=list&wd=" },
        "detail": { "path": "/api.php/provide/vod/at/json/?ac=detail&ids=" }
    },
    "fantuan": {
         "name": "饭团资源",
         "url": "https://fantuan.tk",
         "is_adult": false,
         "search": { "path": "/api.php/provide/vod/?ac=list&wd=" },
         "detail": { "path": "/api.php/provide/vod/?ac=detail&ids=" }
    },
    "jisu": {
        "name": "极速资源",
        "url": "https://jszyapi.com",
        "is_adult": false,
        "search": { "path": "/api.php/provide/vod/?ac=list&wd=" },
        "detail": { "path": "/api.php/provide/vod/?ac=detail&ids=" }
    },
    "hongniu": {
        "name": "红牛资源",
        "url": "https://www.hongniuzy2.com",
        "is_adult": false,
        "search": { "path": "/api.php/provide/vod/?ac=list&wd=" },
        "detail": { "path": "/api.php/provide/vod/?ac=detail&ids=" }
    },
    "liangzi": {
         "name": "量子资源",
         "url": "https://cj.lziapi.com",
         "is_adult": false,
         "search": { "path": "/api.php/provide/vod/?ac=list&wd=" },
         "detail": { "path": "/api.php/provide/vod/?ac=detail&ids=" }
    },
    "taopian": {
         "name": "套片资源",
         "url": "https://taopianapi.com",
         "is_adult": true, // Marked as adult
         "search": { "path": "/vod/listing?wd=" },
         "detail": { "path": "/vod/detail?ids=" }
    },
     "sex": {
          "name": "AVSex",
          "url": "https://api.avsex.club",
          "is_adult": true, // Marked as adult
          "search": { "path": "/api.php/provide/vod/route/list?wd=" },
          "detail": { "path": "/api.php/provide/vod/route/detail?ids=" }
     },
    // Add other built-in sites here
};

// --- API Interaction Defaults ---
export const API_CONFIG = {
    search: {
        path: "/api.php/provide/vod/?ac=list&wd=", // Default search path if not specified by site
        headers: {}
    },
    detail: {
        path: "/api.php/provide/vod/?ac=detail&ids=", // Default detail path
        headers: {}
    },
    timeout: 10000 // Default fetch timeout (ms) - managed in apiService now
};

// --- Player Configuration ---
export const PLAYER_CONFIG = {
    playerUrl: "player.html", // Relative path to the player page
    debugMode: false, // Enable detailed console logging in player
    enablePreloading: true, // Enable/disable next episode preloading
    preloadMaxMb: 50, // Max MB to preload per episode (approximate)
    // DPlayer specific options can be added here if needed globally
    dplayerOptions: {
         screenshot: true,
         hotkey: true,
         autoplay: true, // Note: This is DPlayer's option, distinct from store's autoplay setting
    }
};

// --- Custom API Settings ---
export const CUSTOM_API_CONFIG = {
    localStorageKey: "customAPIs",
    maxHistoryItems: 50, // General history limit
};

// --- Feature Flags ---
export const HIDE_BUILTIN_ADULT_APIS = false; // Set to true to hide adult APIs in settings

// --- Error Messages (Example) ---
export const ERROR_MESSAGES = {
    fetchFailed: "网络请求失败，请检查网络连接或代理设置。",
    apiError: "API源返回错误。",
    timeout: "请求超时，请稍后再试。",
    noResults: "未找到相关结果。",
    // Add more specific messages
};

// --- Security Settings ---
export const SECURITY_CONFIG = {
    // Configurations related to security, if any (e.g., CORS modes - handled by proxy now)
};

// --- M3U8 Handling ---
// Patterns used by the proxy function, kept here for reference if needed elsewhere
export const M3U8_PATTERNS = {
    resolutionRegex: /#EXT-X-STREAM-INF:.*?RESOLUTION=(\d+x\d+)/,
    bandwidthRegex: /#EXT-X-STREAM-INF:.*?BANDWIDTH=(\d+)/,
    uriRegex: /#EXT-X-STREAM-INF:.*?\n(.*?)$/,
    keyMethodNoneRegex: /#EXT-X-KEY:METHOD=NONE/,
    keyMethodAesRegex: /#EXT-X-KEY:METHOD=AES-128/,
    keyUriRegex: /#EXT-X-KEY:.*?URI="(.*?)"/,
    keyIvRegex: /#EXT-X-KEY:.*?IV=(.*?)(?:,|$)/,
    mapUriRegex: /#EXT-X-MAP:.*?URI="(.*?)"/,
    segmentUrlRegex: /(?:#EXTINF:.*?,)\s*(?!#)(.+)/ // Matches segment URLs
};
