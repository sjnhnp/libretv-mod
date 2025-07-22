// ✅ 使用 sessionStorage 进行持久化缓存
const QUALITY_CACHE_KEY = 'qualityCache';
const qualityCache = new Map(JSON.parse(sessionStorage.getItem(QUALITY_CACHE_KEY) || '[]'));

/**
 * 将画质探测结果保存到内存和 sessionStorage
 * @param {string} qualityId - 视频的唯一ID
 * @param {string} quality - 探测到的画质
 */
function saveQualityCache(qualityId, quality) {
    qualityCache.set(qualityId, quality);
    try {
        sessionStorage.setItem(QUALITY_CACHE_KEY, JSON.stringify(Array.from(qualityCache.entries())));
    } catch (e) {
        console.warn("无法保存画质缓存，可能存储已满:", e);
    }
}

// 主应用程序逻辑 使用AppState进行状态管理，DOMCache进行DOM元素缓存
// Basic AppState Implementation
const AppState = (function () {
    const state = new Map();
    return {
        set: function (key, value) {
            state.set(key, value);
        },
        get: function (key) {
            return state.get(key);
        },
        // Method to initialize multiple values
        initialize: function (initialData = {}) {
            for (const key in initialData) {
                if (initialData.hasOwnProperty(key)) {
                    state.set(key, initialData[key]);
                }
            }
        }
    };
})();

// Basic DOMCache Implementation
const DOMCache = (function () {
    const cache = new Map();
    return {
        set: function (key, element) {
            if (element) {
                cache.set(key, element);
            }
        },
        get: function (key) {
            return cache.get(key);
        },
        // Initialize multiple elements
        init: function (elementsToCache) {
            for (const key in elementsToCache) {
                if (elementsToCache.hasOwnProperty(key)) {
                    const element = document.getElementById(elementsToCache[key]);
                    if (element) {
                        cache.set(key, element);
                    }
                }
            }
        }
    };
})();

// 显示详情
function showDetails(element) {
    const id = element.dataset.id;
    const sourceCode = element.dataset.source;
    console.log(`STUB: showDetails called for element with ID: ${id}, Source: ${sourceCode}`);
}

//文本净化函数
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function playVideo(episodeString, title, episodeIndex, sourceName = '', sourceCode = '', vodId = '', year = '', typeName = '', videoKey = '') {
    if (!episodeString) {
        showToast('无效的视频链接', 'error');
        return;
    }
    // 分割剧集字符串，提取真实的URL用于播放
    let playUrl = episodeString;
    if (episodeString.includes('$')) {
        playUrl = episodeString.split('$')[1];
    }
    if (!playUrl || !playUrl.startsWith('http')) {
        showToast('视频链接格式无效', 'error');
        console.error('解析出的播放链接无效:', playUrl);
        return;
    }
    // 检查是否需要等待获取真实地址
    const isSpecialSource = !sourceCode.startsWith('custom_') && API_SITES[sourceCode] && API_SITES[sourceCode].detail;
    if (isSpecialSource) {
        const detailUrl = `/api/detail?id=${vodId}&source=${sourceCode}`;
        try {
            const response = await fetch(detailUrl);
            const data = await response.json();
            if (data.code === 200 && Array.isArray(data.episodes)) {
                // 使用真实地址更新播放链接
                playUrl = data.episodes[episodeIndex];
            }
        } catch (e) {
            console.log('后台获取真实地址失败（播放前）', e);
        }
    }
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    if (typeof addToViewingHistory === 'function') {
        const videoInfoForHistory = {
            url: playUrl,
            title: title,
            episodeIndex: episodeIndex,
            sourceName: sourceName,
            sourceCode: sourceCode,
            vod_id: vodId,
            year: year,
            episodes: AppState.get('currentEpisodes') || []
        };
        addToViewingHistory(videoInfoForHistory);
    }

    // 将原始剧集名称存入localStorage，供播放页使用
    const originalEpisodeNames = AppState.get('originalEpisodeNames') || [];
    localStorage.setItem('originalEpisodeNames', JSON.stringify(originalEpisodeNames));

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', playUrl);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', episodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    if (year) playerUrl.searchParams.set('year', year);
    if (typeName) playerUrl.searchParams.set('typeName', typeName);
    if (videoKey) playerUrl.searchParams.set('videoKey', videoKey);
    const universalId = generateUniversalId(title, year, episodeIndex);
    playerUrl.searchParams.set('universalId', universalId);
    const adOn = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);
    playerUrl.searchParams.set('af', adOn ? '1' : '0');
    window.location.href = playerUrl.toString();
}

// 生成视频统一标识符，用于跨线路共享播放进度
function generateUniversalId(title, year, episodeIndex) {
    // 移除标题中的特殊字符和空格，转换为小写   
    const normalizedTitle = title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? year : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

// 播放上一集
function playPreviousEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (currentIndex > 0 && episodes && episodes.length > 0) {
        const prevIndex = currentIndex - 1;
        AppState.set('currentEpisodeIndex', prevIndex);
        localStorage.setItem('currentEpisodeIndex', prevIndex.toString());

        const title = AppState.get('currentVideoTitle');
        playVideo(episodes[prevIndex], title, prevIndex);
    } else {
        showToast('已经是第一集了', 'info');
    }
}

// 播放下一集
function playNextEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (episodes && currentIndex < episodes.length - 1) {
        const nextIndex = currentIndex + 1;
        AppState.set('currentEpisodeIndex', nextIndex);
        localStorage.setItem('currentEpisodeIndex', nextIndex.toString());

        const title = AppState.get('currentVideoTitle');
        playVideo(episodes[nextIndex], title, nextIndex);
    } else {
        showToast('已经是最后一集了', 'info');
    }
}

async function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    console.log(`[App - playFromHistory] Called with: url=${url}, title=${title}, epIndex=${episodeIndex}, pos=${playbackPosition}`);

    let historyItem = null;
    let episodesList = [];
    let vodId = '', actualSourceName = '', actualSourceCode = '', videoYear = '';

    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');
        historyItem = history.find(item =>
            item.url === url &&
            item.title === title &&
            item.episodeIndex === episodeIndex
        );

        if (historyItem) {
            vodId = historyItem.vod_id || '';
            actualSourceName = historyItem.sourceName || '';
            actualSourceCode = historyItem.sourceCode || '';
            videoYear = historyItem.year || '';
        }
    } catch (e) {
        console.error("读取历史记录失败:", e);
    }

    // 优先尝试拉取最新数据
    if (vodId && actualSourceCode) {
        try {
            let apiUrl = `/api/detail?id=${encodeURIComponent(vodId)}&source=${encodeURIComponent(actualSourceCode)}`;
            const apiInfo = typeof APISourceManager !== 'undefined' ? APISourceManager.getSelectedApi(actualSourceCode) : null;
            if (apiInfo && apiInfo.isCustom && apiInfo.url) {
                apiUrl += `&customApi=${encodeURIComponent(apiInfo.url)}`;
            }

            const detailResp = await fetch(apiUrl);
            if (!detailResp.ok) throw new Error(`API请求失败: ${detailResp.status}`);

            const detailData = await detailResp.json();
            if (detailData.code === 200 && Array.isArray(detailData.episodes) && detailData.episodes.length > 0) {
                // 只要成功获取，就直接使用最新的数据，不再进行复杂校验
                episodesList = detailData.episodes;
                console.log("[playFromHistory] 成功获取最新剧集列表，直接使用。");
            } else {
                // 如果API返回错误码，则回退
                throw new Error(detailData.msg || 'API返回数据无效');
            }
        } catch (e) {
            // 任何失败（网络、API错误等），都安全回退到使用历史记录中的数据
            console.warn(`[playFromHistory] 获取最新数据失败 (${e.message})，回退到历史数据。`);
            if (historyItem && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0) {
                episodesList = historyItem.episodes;
            }
        }
    } else if (historyItem && Array.isArray(historyItem.episodes)) {
        // 如果历史项中没有ID，直接使用历史的episodes
        episodesList = historyItem.episodes;
    }

    // 如果到这里 episodesList 依然为空，做最后一次补救
    if (episodesList.length === 0) {
        episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
    }

    // --- 后续跳转逻辑 ---
    if (episodesList.length > 0) {
        AppState.set('currentEpisodes', episodesList);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
    }

    let actualEpisodeIndex = episodeIndex;
    // 确保索引在有效范围内
    if (actualEpisodeIndex >= episodesList.length) {
        actualEpisodeIndex = episodesList.length > 0 ? episodesList.length - 1 : 0;
    }

    // 关键：finalUrl 必须从更新后的 episodesList 中获取
    const finalUrl = (episodesList.length > 0 && episodesList[actualEpisodeIndex]) ? episodesList[actualEpisodeIndex] : url;

    AppState.set('currentEpisodeIndex', actualEpisodeIndex);
    AppState.set('currentVideoTitle', title);
    localStorage.setItem('currentEpisodeIndex', actualEpisodeIndex.toString());
    localStorage.setItem('currentVideoTitle', title);

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', finalUrl); // 使用最终确定的URL
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', actualEpisodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (actualSourceName) playerUrl.searchParams.set('source', actualSourceName);
    if (actualSourceCode) playerUrl.searchParams.set('source_code', actualSourceCode);
    if (videoYear) playerUrl.searchParams.set('year', videoYear); // 确保年份信息被传递
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());

    const uid = generateUniversalId(title, videoYear, actualEpisodeIndex);
    playerUrl.searchParams.set('universalId', uid);

    const adOn = typeof getBoolConfig !== 'undefined' && typeof PLAYER_CONFIG !== 'undefined'
        ? getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled)
        : PLAYER_CONFIG?.adFilteringEnabled ?? false;
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    window.location.href = playerUrl.toString();
}

// 从localStorage获取布尔配置
function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 应用程序初始化
document.addEventListener('DOMContentLoaded', function () {

    // 初始化应用状态
    initializeAppState();

    // 初始化DOM缓存
    initializeDOMCache();

    // 初始化API源管理器
    APISourceManager.init();

    // 初始化事件监听器
    initializeEventListeners();

    // 加载搜索历史
    renderSearchHistory();

    // 恢复搜索状态
    restoreSearchFromCache();
});

/**
 * 初始化应用状态
 * 从localStorage加载初始状态并设置到AppState，如果localStorage为空则写入默认值
 */

function initializeAppState() {
    const selectedAPIsRaw = localStorage.getItem('selectedAPIs');

    AppState.initialize({
        'selectedAPIs': JSON.parse(selectedAPIsRaw || JSON.stringify(window.DEFAULT_SELECTED_APIS)),
        'customAPIs': JSON.parse(localStorage.getItem('customAPIs') || '[]'),
        'currentEpisodeIndex': 0,
        'currentEpisodes': [],
        'currentVideoTitle': '',
        'episodesReversed': false
    });

    if (selectedAPIsRaw === null) {
        localStorage.setItem('selectedAPIs', JSON.stringify(window.DEFAULT_SELECTED_APIS));
    }

    try {
        const cachedData = sessionStorage.getItem('videoDataCache');
        let restoredMap = new Map(); // ✅ 在开头声明变量

        if (cachedData) {
            const rawArr = JSON.parse(cachedData);
            // 检查缓存格式：如果key不包含"_"，则判定为旧格式并丢弃
            if (rawArr.length > 0 && !String(rawArr[0][0]).includes('_')) {
                console.warn("检测到旧版视频缓存，已清除。");
            } else {
                restoredMap = new Map(rawArr); // ✅ 给已声明的变量赋值
            }
            console.log('已从 sessionStorage 恢复视频元数据缓存:', restoredMap);
        }

        AppState.set('videoDataMap', restoredMap); // ✅ 确保此行能访问到 restoredMap

    } catch (e) {
        console.error('从 sessionStorage 恢复视频元数据缓存失败:', e);
        AppState.set('videoDataMap', new Map());
    }
}

// 初始化DOM缓存 缓存频繁访问的DOM元素
function initializeDOMCache() {
    // 缓存搜索相关元素
    DOMCache.set('searchInput', document.getElementById('searchInput'));
    DOMCache.set('searchResults', document.getElementById('searchResults'));
    DOMCache.set('searchForm', document.getElementById('searchForm'));
    DOMCache.set('searchHistoryContainer', document.getElementById('searchHistory'));

    // 缓存API相关元素
    DOMCache.set('apiCheckboxes', document.getElementById('apiCheckboxes'));
    DOMCache.set('customApisList', document.getElementById('customApisList'));
    DOMCache.set('selectedApiCount', document.getElementById('selectedApiCount'));
    DOMCache.set('addCustomApiForm', document.getElementById('addCustomApiForm'));
    DOMCache.set('customApiName', document.getElementById('customApiName'));
    DOMCache.set('customApiUrl', document.getElementById('customApiUrl'));
    DOMCache.set('customApiDetail', document.getElementById('customApiDetail'));
    DOMCache.set('customApiIsAdult', document.getElementById('customApiIsAdult'));

    // 缓存过滤器相关元素
    DOMCache.set('yellowFilterToggle', document.getElementById('yellowFilterToggle'));
    DOMCache.set('adFilteringToggle', document.getElementById('adFilterToggle'));

    // 缓存预加载相关元素
    DOMCache.set('preloadingToggle', document.getElementById('preloadingToggle'));
    // (fix) ID is preloadCountInput, not preloadCount
    DOMCache.set('preloadCountInput', document.getElementById('preloadCountInput'));
}

// 初始化事件监听器
function initializeEventListeners() {
    // 搜索表单提交事件
    const searchForm = DOMCache.get('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            search();
        });
    }

    // 搜索输入框事件
    const searchInput = DOMCache.get('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            // 可以添加实时搜索建议等功能
        });
    }

    // 广告过滤开关事件
    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, enabled.toString());
            showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });

        // 初始化开关状态 - 使用getBoolConfig
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);

    }

    // 黄色内容过滤开关事件
    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
        });

        // 初始化开关状态 - 使用getBoolConfig
        yellowFilterToggle.checked = getBoolConfig('yellowFilterEnabled', true);
    }

    // 预加载开关事件
    const preloadingToggle = DOMCache.get('preloadingToggle');
    if (preloadingToggle) {
        preloadingToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('preloadingEnabled', enabled.toString());

            PLAYER_CONFIG.enablePreloading = enabled;

            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');

            const preloadCountInput = DOMCache.get('preloadCountInput');
            if (preloadCountInput) {
                preloadCountInput.disabled = !enabled;
            }
        });

        // 初始化开关状态 - 使用getBoolConfig
        const preloadingEnabled = getBoolConfig('preloadingEnabled', true);
        preloadingToggle.checked = preloadingEnabled;

        PLAYER_CONFIG.enablePreloading = preloadingEnabled;

        // 更新预加载数量输入框的可用性
        const preloadCountInput = DOMCache.get('preloadCountInput');
        if (preloadCountInput) {
            preloadCountInput.disabled = !preloadingEnabled;
        }
    }

    // 预加载数量输入事件
    const preloadCountInput = DOMCache.get('preloadCountInput');
    if (preloadCountInput) {
        preloadCountInput.addEventListener('change', function (e) {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) {
                count = 1;
                e.target.value = '1';
            } else if (count > 10) {
                count = 10;
                e.target.value = '10';
            }

            localStorage.setItem('preloadCount', count.toString());
            PLAYER_CONFIG.preloadCount = count;

            showToast(`预加载数量已设置为 ${count}`, 'info');
        });

        // 初始化预加载数量
        const savedCount = localStorage.getItem('preloadCount');
        const preloadCount = savedCount ? parseInt(savedCount) : 2;
        preloadCountInput.value = preloadCount;
        PLAYER_CONFIG.preloadCount = preloadCount;
    }
}

// 初始化UI组件
function initializeUIComponents() {
    // 初始化任何需要的UI组件
}

// 执行搜索
function search(options = {}) {
    // 在每次新搜索开始时，强制清除所有旧的搜索结果缓存
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
        sessionStorage.removeItem('videoSourceMap');
        console.log('[缓存] 已在执行新搜索前清除旧缓存。');
    } catch (e) {
        console.error('清除 sessionStorage 失败:', e);
    }

    const searchInput = DOMCache.get('searchInput');
    const searchResultsContainer = DOMCache.get('searchResults');

    if (!searchInput || !searchResultsContainer) {
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }

    const queryFromInput = searchInput.value.trim();
    const query = options.doubanQuery || queryFromInput;

    if (!query) {
        if (typeof showToast === 'function') showToast('请输入搜索内容', 'warning');
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }

    let isNormalSearch = !options.doubanQuery;

    if (isNormalSearch && typeof showLoading === 'function') {
        showLoading(`正在搜索“${query}”`);
    }

    if (!options.doubanQuery) {
        if (typeof saveSearchHistory === 'function') saveSearchHistory(query);
    }

    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        if (typeof showToast === 'function') {
            showToast('请至少选择一个API源', 'warning');
        }
        if (isNormalSearch && typeof hideLoading === 'function') {
            hideLoading();
        }
        if (typeof options.onComplete === 'function') {
            options.onComplete();
        }
        return;
    }

    performSearch(query, selectedAPIs)
        .then(resultsData => {
            renderSearchResults(resultsData, options.doubanQuery ? query : null);
        })
        .catch(error => {
            if (searchResultsContainer) searchResultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        })
        .finally(() => {
            if (isNormalSearch && typeof hideLoading === 'function') {
                hideLoading();
            }
            if (typeof options.onComplete === 'function') {
                options.onComplete();
            }
        });
}

// 执行搜索请求
async function performSearch(query, selectedAPIs) {
    const customAPIsFromStorage = JSON.parse(localStorage.getItem('customAPIs') || '[]');
    AppState.set('customAPIs', customAPIsFromStorage);

    const searchPromises = selectedAPIs.map(apiId => {
        let apiUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;
        if (apiId.startsWith('custom_')) {
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi && customApi.url) {
                apiUrl += `&customApi=${encodeURIComponent(customApi.url)}`;
            } else {
                return Promise.resolve({ code: 400, msg: `自定义API ${apiId} 无效`, list: [], apiId });
            }
        }
        return fetch(apiUrl)
            .then(response => response.json())
            .then(data => ({ ...data, apiId: apiId, apiName: APISourceManager.getSelectedApi(apiId)?.name || apiId }))
            .catch(error => ({ code: 400, msg: `API(${apiId})搜索失败: ${error.message}`, list: [], apiId }));
    }).filter(Boolean);

    try {
        const initialResults = await Promise.all(searchPromises);
        let allResults = [];
        initialResults.forEach(result => {
            if (result.code === 200 && Array.isArray(result.list)) {
                result.list.forEach(item => {
                    allResults.push({
                        ...item,
                        source_name: result.apiName,
                        source_code: result.apiId,
                        api_url: result.apiId.startsWith('custom_') ? APISourceManager.getCustomApiInfo(parseInt(result.apiId.replace('custom_', '')))?.url : ''
                    });
                });
            }
        });

        // [新增] 预检测和排序逻辑
        showLoading(`正在检测 ${allResults.length} 个资源...`);
        const precheckPromises = allResults.map(async (item) => {
            let firstEpisodeUrl = '';
            if (item.vod_play_url) {
                const firstSegment = item.vod_play_url.split('#')[0];
                firstEpisodeUrl = firstSegment.includes('$') ? firstSegment.split('$')[1] : firstSegment;
            }
            const checkResult = await window.precheckSource(firstEpisodeUrl);
            return { ...item, ...checkResult };
        });

        const checkedResults = await Promise.all(precheckPromises);

        // [新增] 根据加载速度排序
        checkedResults.sort((a, b) => {
            const speedA = parseFloat(a.loadSpeed) * (a.loadSpeed.includes('MB/s') ? 1024 : 1);
            const speedB = parseFloat(b.loadSpeed) * (b.loadSpeed.includes('MB/s') ? 1024 : 1);
            if (isNaN(speedA)) return 1;
            if (isNaN(speedB)) return -1;
            return speedB - speedA; // 速度快的排前面
        });

        // 缓存视频元数据
        const videoDataMap = AppState.get('videoDataMap') || new Map();
        checkedResults.forEach(item => {
            if (item.vod_id) {
                const uniqueVideoKey = `${item.source_code}_${item.vod_id}`;
                videoDataMap.set(uniqueVideoKey, item);
            }
        });
        AppState.set('videoDataMap', videoDataMap);
        sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));

        return checkedResults; // [修改] 返回已检测和排序的结果

    } catch (error) {
        console.error("执行搜索或预检测时出错:", error);
        return []; // 返回空数组
    }
}

function renderSearchResults(allResults, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');

    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;

    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }

    // 缓存结果到 sessionStorage
    try {
        const query = (DOMCache.get('searchInput')?.value || '').trim();
        if (query && allResults.length > 0) {
            sessionStorage.setItem('searchQuery', query);
            sessionStorage.setItem('searchResults', JSON.stringify(allResults));
            sessionStorage.setItem('searchSelectedAPIs', JSON.stringify(AppState.get('selectedAPIs')));
        }
    } catch (e) {
        console.error("缓存搜索结果失败:", e);
    }

    searchResultsContainer.innerHTML = '';
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = allResults.length.toString();

    if (allResults.length === 0) {
        let messageTitle = doubanSearchedTitle ? `关于 <strong class="text-pink-400">《${sanitizeText(doubanSearchedTitle)}》</strong> 未找到结果` : '没有找到匹配的结果';
        let messageSuggestion = "请尝试其他关键词或更换数据源。";
        searchResultsContainer.innerHTML = `...`;
        return;
    }

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    const fragment = document.createDocumentFragment();
    allResults.forEach(item => {
        fragment.appendChild(createResultItemUsingTemplate(item));
    });
    gridContainer.appendChild(fragment);
    searchResultsContainer.appendChild(gridContainer);

    getElement('searchArea')?.classList.remove('flex-1', 'hidden');
    getElement('searchArea')?.classList.add('mb-8');
    getElement('doubanArea')?.classList.add('hidden');
}

function restoreSearchFromCache() {
    try {
        const cachedQuery = sessionStorage.getItem('searchQuery');
        const cachedResults = sessionStorage.getItem('searchResults');
        const cachedSelectedAPIs = sessionStorage.getItem('searchSelectedAPIs');

        if (cachedQuery && cachedResults) {
            console.log('[恢复] 从 sessionStorage 恢复搜索状态');

            // 恢复搜索关键词到输入框
            const searchInput = DOMCache.get('searchInput');
            if (searchInput) {
                searchInput.value = cachedQuery;
            }

            // 恢复API选择状态
            if (cachedSelectedAPIs) {
                try {
                    const selectedAPIs = JSON.parse(cachedSelectedAPIs);
                    AppState.set('selectedAPIs', selectedAPIs);
                } catch (e) {
                    console.warn('恢复API选择状态失败:', e);
                }
            }

            // 直接恢复搜索结果显示
            const parsedResults = JSON.parse(cachedResults);
            renderSearchResultsFromCache(parsedResults);

            // 确保关闭弹窗
            if (typeof closeModal === 'function') {
                closeModal();
            }

            console.log('[恢复] 搜索状态恢复完成，显示了', parsedResults.length, '个结果');
        } else {
            console.log('[恢复] 没有找到缓存的搜索数据');
        }
    } catch (e) {
        console.error('恢复搜索状态失败:', e);
    }
}

// 恢复缓存结果的渲染函数
function renderSearchResultsFromCache(cachedResults) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');

    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;

    // 显示结果区域
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = cachedResults.length.toString();

    // 清空并重新渲染
    searchResultsContainer.innerHTML = '';

    if (cachedResults.length > 0) {
        const gridContainer = document.createElement('div');
        gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

        const fragment = document.createDocumentFragment();
        cachedResults.forEach(item => {
            try {
                fragment.appendChild(createResultItemUsingTemplate(item));
            } catch (error) {
                console.error('渲染缓存结果项失败:', error);
            }
        });

        gridContainer.appendChild(fragment);
        searchResultsContainer.appendChild(gridContainer);
    }

    // 调整搜索区域布局
    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden');
}

// 获取视频详情
async function getVideoDetail(id, sourceCode, apiUrl = '') {
    if (!id || !sourceCode) {
        showToast('无效的视频信息', 'error');
        return;
    }

    const searchResults = DOMCache.get('searchResults');
    if (searchResults) {
        searchResults.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-2 text-gray-400">正在获取视频信息，请稍候...</p></div>';
    }

    try {
        let url = `/api/detail?id=${id}&source=${sourceCode}`;

        // 对于自定义API，添加customApi参数
        if (sourceCode === 'custom' && apiUrl) {
            url += `&customApi=${encodeURIComponent(apiUrl)}&useDetail=true`;
        }

        const response = await fetch(url);
        const data = await response.json();

        // +++ 剧集解析逻辑 - 支持多种格式 +++
        let episodes = [];

        // 情况1：标准episodes数组
        if (Array.isArray(data.episodes) && data.episodes.length > 0) {
            episodes = data.episodes;
        }
        // 情况2：从vod_play_url解析
        else if (data.vod_play_url) {
            console.warn("使用备用字段 vod_play_url 解析剧集");
            episodes = parseVodPlayUrl(data.vod_play_url);
        }
        // 情况3：从HTML内容解析（当响应是HTML时）
        else if (typeof data === 'string' && data.includes('stui-content__playlist')) {
            console.warn("从HTML内容解析剧集数据");
            episodes = parseHtmlEpisodeList(data);
        }

        if (episodes.length === 0) {
            throw new Error('未找到剧集信息');
        }

        // 保存视频信息到状态
        AppState.set('currentEpisodes', episodes);
        AppState.set('currentVideoTitle', data.videoInfo?.title || '未知视频');
        AppState.set('currentEpisodeIndex', 0);

        // 保存到localStorage（用于播放器页面）
        localStorage.setItem('currentEpisodes', JSON.stringify(episodes));
        localStorage.setItem('currentVideoTitle', data.videoInfo?.title || '未知视频');
        localStorage.setItem('currentEpisodeIndex', '0');

        // 添加到观看历史
        if (data.videoInfo && typeof addToViewingHistory === 'function') {
            addToViewingHistory(data.videoInfo);
        }

        // 使用playVideo函数播放第一集
        const firstEpisode = episodes[0];
        // 尝试从API表查 sourceName
        let sourceName = '';
        if (sourceCode.startsWith('custom_') && window.APISourceManager?.getCustomApiInfo) {
            try {
                const idx = parseInt(sourceCode.replace('custom_', ''));
                sourceName = window.APISourceManager.getCustomApiInfo(idx)?.name || '';
            } catch { }
        } else if (window.API_SITES && window.API_SITES[sourceCode]) {
            sourceName = window.API_SITES[sourceCode].name;
        }
        playVideo(
            firstEpisode,
            data.videoInfo?.title || '未知视频',
            0,
            sourceName,
            sourceCode,
            id
        );
    } catch (error) {
        if (searchResults) {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">获取视频详情失败: ${error.message}</div>`;
        }
        showToast('获取视频详情失败: ' + error.message, 'error');
    }
}

// 解析HTML中的剧集列表
function parseHtmlEpisodeList(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const episodes = [];

        // 选择所有播放列表项
        const items = doc.querySelectorAll('.stui-content__playlist li a.copy_text');

        items.forEach(item => {
            // 获取剧集名称（第一个文本节点）
            let name = "";
            for (const node of item.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    name = node.textContent.trim();
                    break;
                }
            }

            // 获取URL（hidden-xs span的内容）
            const urlSpan = item.querySelector('span.hidden-xs');
            let url = urlSpan ? urlSpan.textContent.trim() : '';

            // 移除URL开头的$符号（如果存在）
            if (url.startsWith('$')) {
                url = url.substring(1);
            }

            if (name && url) {
                episodes.push(`${name}$${url}`);
            }
        });

        return episodes;
    } catch (e) {
        console.error("解析HTML剧集失败", e);
        return [];
    }
}

// 解析vod_play_url格式
function parseVodPlayUrl(vodPlayUrl) {
    const episodes = [];

    // 第一步：按#分割不同剧集
    const segments = vodPlayUrl.split('#');

    segments.forEach(segment => {
        // 第二步：每个segment按$分割名称和URL
        const parts = segment.split('$');

        if (parts.length >= 2) {
            // 获取名称（第一部分）
            const name = parts[0].trim();
            // 获取URL（最后部分）
            const url = parts[parts.length - 1].trim();

            // 过滤无效条目
            if (name && url && url.startsWith('http')) {
                episodes.push(`${name}$${url}`);
            }
        }
    });

    return episodes;
}

// 重置到首页
function resetToHome() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const doubanArea = getElement('doubanArea');
    const searchArea = getElement('searchArea');

    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';

    // 回到「初始版面」
    /* ---- 恢复搜索区默认样式 ---- */
    if (searchArea) {
        searchArea.classList.add('flex-1');
        searchArea.classList.remove('mb-8');
        searchArea.classList.remove('hidden');
    }

    /* ---- 隐藏结果区 ---- */
    resultsArea?.classList.add('hidden');

    /* ---- 视用户设置决定是否显示豆瓣区 ---- */
    if (doubanArea) {
        const showDouban = getBoolConfig('doubanEnabled', false);
        doubanArea.classList.toggle('hidden', !showDouban);

        // 如果豆瓣热门应该显示，则调用其专属的检查加载函数
        if (showDouban && typeof window.reloadDoubanIfNeeded === 'function') {
            window.reloadDoubanIfNeeded();
        }
    }

    // 清理搜索缓存
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
    } catch (e) {
        console.error('清理搜索缓存失败:', e);
    }

    renderSearchHistory();
}

// 导出需要在全局访问的函数
window.search = search;
window.getVideoDetail = getVideoDetail;
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.playPreviousEpisode = playPreviousEpisode;
window.playNextEpisode = playNextEpisode;
window.showDetails = showDetails;
window.playFromHistory = playFromHistory;

// [替换] 整个 createResultItemUsingTemplate 函数
function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) return document.createDocumentFragment();

    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');
    cardElement.videoData = item;

    const imgElement = clone.querySelector('.result-img');
    if (imgElement) {
        imgElement.src = item.vod_pic && item.vod_pic.startsWith('http') ? item.vod_pic : '...';
        imgElement.alt = item.vod_name || '未知标题';
    }
    const titleElement = clone.querySelector('.result-title');
    if (titleElement) {
        titleElement.textContent = item.vod_name || '未知标题';
        titleElement.title = item.vod_name || '未知标题';
    }
    const typeElement = clone.querySelector('.result-type');
    if (typeElement) {
        if (item.type_name) {
            typeElement.textContent = item.type_name;
            typeElement.classList.remove('hidden');
        } else {
            typeElement.classList.add('hidden');
        }
    }
    const yearElement = clone.querySelector('.result-year');
    if (yearElement) {
        if (item.vod_year) {
            yearElement.textContent = item.vod_year;
            yearElement.classList.remove('hidden');
        } else {
            yearElement.classList.add('hidden');
        }
    }
    const remarksElement = clone.querySelector('.result-remarks');
    if (remarksElement) {
        if (item.vod_remarks) {
            remarksElement.textContent = item.vod_remarks;
            remarksElement.classList.remove('hidden');
        } else {
            remarksElement.classList.add('hidden');
        }
    }
    const sourceNameElement = clone.querySelector('.result-source-name');
    if (sourceNameElement) {
        if (item.source_name) {
            sourceNameElement.textContent = item.source_name;
            sourceNameElement.className = 'result-source-name text-xs text-gray-400';

        } else {
            sourceNameElement.className = 'result-source-name hidden';
        }
    }

    // ✅ 新增：为画质标签创建初始的“检测中”状态
    const sourceContainer = clone.querySelector('.result-source');
    if (sourceContainer) {
        const qualityBadge = document.createElement('span');
        qualityBadge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded';
        qualityBadge.textContent = item.quality || '未知'; // 使用 item.quality

        // 根据画质设置不同颜色
        if (item.quality === '1080P' || item.quality === '4K') {
            qualityBadge.classList.add('bg-purple-600', 'text-purple-100');
        } else if (item.quality === '720P' || item.quality === '高清') {
            qualityBadge.classList.add('bg-blue-600', 'text-blue-100');
        } else {
            qualityBadge.classList.add('bg-gray-600', 'text-gray-200');
        }
        sourceContainer.appendChild(qualityBadge);
    }

    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    if (item.api_url) {
        cardElement.dataset.apiUrl = item.api_url;
    }
    cardElement.dataset.videoKey = `${item.vod_name}|${item.vod_year || ''}`;

    // 存储来自搜索列表的元数据
    cardElement.dataset.year = item.vod_year || '';
    cardElement.dataset.typeName = item.type_name || '';
    cardElement.dataset.remarks = item.vod_remarks || '';
    cardElement.dataset.area = item.vod_area || '';
    cardElement.dataset.actor = item.vod_actor || '';
    cardElement.dataset.director = item.vod_director || '';
    cardElement.dataset.blurb = item.vod_blurb || '';

    cardElement.onclick = handleResultClick;

    return clone;
}

function handleResultClick(event) {
    const card = event.currentTarget;
    const {
        id,
        name,
        sourceCode,
        apiUrl = '',
        year,
        typeName,
        videoKey,
        blurb,
        remarks,
        area,
        actor,
        director
    } = card.dataset;

    if (typeof showVideoEpisodesModal === 'function') {
        // 将所有数据传递给弹窗函数
        showVideoEpisodesModal(id, name, sourceCode, apiUrl, {
            year, typeName, videoKey, blurb, remarks, area, actor, director
        });
    } else {
        console.error('showVideoEpisodesModal function not found!');
        showToast('无法加载剧集信息', 'error');
    }
}

window.handleResultClick = handleResultClick;
window.copyLinks = copyLinks;
window.toggleEpisodeOrderUI = toggleEpisodeOrderUI;

// 显示视频剧集模态框
async function showVideoEpisodesModal(id, title, sourceCode, apiUrl, fallbackData) {
    // 1. 从缓存获取完整的视频数据（现在包含了画质和速度）
    const videoDataMap = AppState.get('videoDataMap');
    const uniqueVideoKey = `${sourceCode}_${id}`;
    const videoData = videoDataMap ? videoDataMap.get(uniqueVideoKey) : null;

    if (!videoData) {
        hideLoading();
        showToast('缓存中找不到视频数据，请刷新后重试', 'error');
        return;
    }

    // 2. 解析剧集列表（这部分逻辑保持不变）
    let episodes = [];
    const originalEpisodeNames = [];
    if (videoData.vod_play_url) {
        const playFroms = (videoData.vod_play_from || '').split('$$$');
        const urlGroups = videoData.vod_play_url.split('$$$');
        const selectedApi = APISourceManager.getSelectedApi(sourceCode);
        const sourceName = selectedApi ? selectedApi.name : '';
        let sourceIndex = playFroms.indexOf(sourceName);
        if (sourceIndex === -1) sourceIndex = 0;
        if (urlGroups[sourceIndex]) {
            episodes = urlGroups[sourceIndex].split('#').filter(item => item && item.includes('$'));
            episodes.forEach(ep => {
                const parts = ep.split('$');
                originalEpisodeNames.push(parts[0].trim());
            });
        }
    }
    AppState.set('originalEpisodeNames', originalEpisodeNames);

    // 3. 后台异步获取真实地址（不阻塞弹窗显示）
    const isSpecialSource = !sourceCode.startsWith('custom_') && API_SITES[sourceCode] && API_SITES[sourceCode].detail;
    if (isSpecialSource) {
        // 真实地址获取放在弹窗打开后执行（原代码逻辑）
        setTimeout(async () => {
            try {
                const detailUrl = `/api/detail?id=${id}&source=${sourceCode}`;
                const response = await fetch(detailUrl);
                const detailData = await response.json();
                if (detailData.code === 200 && Array.isArray(detailData.episodes)) {
                    // 用真实地址更新按钮（不刷新弹窗，仅替换链接）
                    episodes = detailData.episodes;
                    AppState.set('currentEpisodes', episodes);
                    localStorage.setItem('currentEpisodes', JSON.stringify(episodes));
                    // 重新渲染按钮（不关闭弹窗）
                    const episodeGrid = document.querySelector('#modalContent [data-field="episode-buttons-grid"]');
                    if (episodeGrid) {
                        episodeGrid.innerHTML = renderEpisodeButtons(episodes, title, sourceCode, sourceNameForDisplay, effectiveTypeName);
                    }
                }
            } catch (e) {
                console.log('后台获取真实地址失败（不影响弹窗显示）', e);
            }
        }, 500); // 延迟执行，确保弹窗已打开
    }

    // 处理自定义detail源的真实地址获取
    const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
    const apiInfo = APISourceManager.getCustomApiInfo(customIndex);
    const isCustomSpecialSource = sourceCode.startsWith('custom_') && apiInfo?.detail;
    if (isCustomSpecialSource) {
        // 自定义源弹窗中的异步地址获取
        setTimeout(async () => {
            try {
                const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
                const apiInfo = APISourceManager.getCustomApiInfo(customIndex);
                if (!apiInfo) throw new Error('自定义源信息不存在');

                // 获取真实地址
                const detailResult = await handleCustomApiSpecialDetail(id, apiInfo.detail);
                const detailData = JSON.parse(detailResult);

                if (detailData.code === 200 && Array.isArray(detailData.episodes)) {
                    // 关键：立即更新缓存（同步到localStorage和AppState）
                    const realPlayUrls = detailData.episodes;
                    AppState.set('currentEpisodes', realPlayUrls); // 更新全局状态
                    localStorage.setItem('currentEpisodes', JSON.stringify(realPlayUrls)); // 持久化缓存

                    // 同时更新弹窗中的播放地址（避免用户二次点击仍无效）
                    const episodeGrid = document.querySelector('#modalContent [data-field="episode-buttons-grid"]');
                    if (episodeGrid) {
                        episodeGrid.innerHTML = renderEpisodeButtons(
                            realPlayUrls, // 使用真实地址重新渲染弹窗按钮
                            title,
                            sourceCode,
                            sourceNameForDisplay,
                            effectiveTypeName
                        );
                    }
                }
            } catch (e) {
                console.error('自定义API地址获取失败:', e);
            }
        }, 500); // 保持延迟，但确保成功后立即更新缓存
    }

    // 4. 渲染弹窗（原代码逻辑）
    hideLoading(); // 移除加载提示，立即显示弹窗
    const effectiveTitle = videoData.vod_name || title;
    const effectiveTypeName = videoData.type_name || fallbackData.typeName;
    const sourceNameForDisplay = videoData.source_name || APISourceManager.getSelectedApi(sourceCode)?.name || '未知源';

    AppState.set('currentEpisodes', episodes);
    AppState.set('currentVideoTitle', effectiveTitle);
    AppState.set('currentSourceName', sourceNameForDisplay);
    AppState.set('currentSourceCode', sourceCode);
    AppState.set('currentVideoId', id);
    AppState.set('currentVideoYear', videoData.vod_year || fallbackData.year);
    AppState.set('currentVideoTypeName', effectiveTypeName);
    AppState.set('currentVideoKey', fallbackData.videoKey);
    localStorage.setItem('currentEpisodes', JSON.stringify(episodes));
    localStorage.setItem('currentVideoTitle', effectiveTitle);

    const template = document.getElementById('video-details-template');
    if (!template) return showToast('详情模板未找到!', 'error');
    const modalContent = template.content.cloneNode(true);

    const fields = {
        type: effectiveTypeName || '未知',
        year: videoData.vod_year || fallbackData.year || '未知',
        area: videoData.vod_area || fallbackData.area || '未知',
        director: videoData.vod_director || fallbackData.director || '未知',
        actor: videoData.vod_actor || fallbackData.actor || '未知',
        remarks: videoData.vod_remarks || fallbackData.remarks || '无',
        description: (videoData.vod_blurb || fallbackData.blurb || '暂无简介。').replace(/<[^>]+>/g, '').trim(),
        'episode-count': episodes.length,
    };
    for (const [key, value] of Object.entries(fields)) {
        const el = modalContent.querySelector(`[data-field="${key}"]`);
        if (el) el.textContent = value;
    }

    // [修改] 更新弹窗中的画质和速度标签
    const qualityTagElement = modalContent.querySelector('[data-field="quality-tag"]');
    if (qualityTagElement) {
        qualityTagElement.textContent = videoData.quality || '未知';
        // 根据画质设置样式
        if (videoData.quality === '1080P' || videoData.quality === '4K') {
            qualityTagElement.style.backgroundColor = '#4f46e5'; // Indigo
        } else if (videoData.quality === '720P' || videoData.quality === '高清') {
            qualityTagElement.style.backgroundColor = '#2563eb'; // Blue
        } else {
            qualityTagElement.style.backgroundColor = '#4b5563'; // Gray
        }
    }

    const speedTagElement = modalContent.querySelector('[data-field="speed-tag"]');
    if (speedTagElement && videoData.loadSpeed && videoData.loadSpeed !== 'N/A') {
        speedTagElement.textContent = videoData.loadSpeed;
        speedTagElement.classList.remove('hidden');
        speedTagElement.style.backgroundColor = '#16a34a'; // Green
    }

    const episodeButtonsGrid = modalContent.querySelector('[data-field="episode-buttons-grid"]');
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀', '纪录片'];
    const isVarietyShow = varietyShowTypes.some(type => effectiveTypeName && effectiveTypeName.includes(type));

    if (episodeButtonsGrid) {
        if (isVarietyShow) {
            episodeButtonsGrid.className = 'variety-grid-layout';
        }
        episodeButtonsGrid.innerHTML = renderEpisodeButtons(episodes, effectiveTitle, sourceCode, sourceNameForDisplay, effectiveTypeName);
    }

    modalContent.querySelector('[data-action="copy-links"]').addEventListener('click', copyLinks);
    modalContent.querySelector('[data-action="toggle-order"]').addEventListener('click', () => {
        toggleEpisodeOrderUI(episodeButtonsGrid);
    });
    const orderIcon = modalContent.querySelector('[data-field="order-icon"]');
    if (orderIcon) {
        orderIcon.style.transform = (AppState.get('episodesReversed') || false) ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    showModal(modalContent, `${effectiveTitle} (${sourceNameForDisplay})`);

}

function toggleEpisodeOrderUI(container) {
    if (!container) {
        container = document.querySelector('#modalContent [data-field="episode-buttons-grid"]');
        if (!container) return;
    }

    let currentReversedState = AppState.get('episodesReversed') || false;
    AppState.set('episodesReversed', !currentReversedState);

    const episodes = AppState.get('currentEpisodes');
    const title = AppState.get('currentVideoTitle');
    const sourceName = AppState.get('currentSourceName');
    const sourceCode = AppState.get('currentSourceCode');
    const typeName = AppState.get('currentVideoTypeName');

    if (episodes && title && sourceCode) {
        container.innerHTML = renderEpisodeButtons(episodes, title, sourceCode, sourceName || '', typeName);
    }

    const toggleBtn = document.querySelector('#modal [data-action="toggle-order"]');
    const orderIcon = document.querySelector('#modal [data-field="order-icon"]');
    if (toggleBtn && orderIcon) {
        const reversed = AppState.get('episodesReversed');
        toggleBtn.title = reversed ? '切换为正序排列' : '切换为倒序排列';
        orderIcon.style.transform = reversed ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

function renderEpisodeButtons(episodes, videoTitle, sourceCode, sourceName, typeName) {
    if (!episodes || episodes.length === 0) {
        return '<p class="text-center text-gray-500 col-span-full">暂无剧集信息</p>';
    }
    const currentReversedState = AppState.get('episodesReversed') || false;
    const vodId = AppState.get('currentVideoId') || '';
    const year = AppState.get('currentVideoYear') || '';
    const videoKey = AppState.get('currentVideoKey') || '';
    // 优先使用状态中已更新的真实地址（特殊源），否则用原有参数（普通源）
    const realEpisodes = AppState.get('currentEpisodes') || episodes;
    const displayEpisodes = currentReversedState ? [...realEpisodes].reverse() : [...realEpisodes];
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀'];
    const isVarietyShow = varietyShowTypes.some(type => typeName && typeName.includes(type));
    return displayEpisodes.map((episodeString, displayIndex) => {
        const originalIndex = currentReversedState ? (episodes.length - 1 - displayIndex) : displayIndex;

        // 从AppState获取保存的原始剧集名称
        const originalEpisodeNames = AppState.get('originalEpisodeNames') || [];
        // 优先使用原始名称（如果存在且对应索引有效）
        const originalName = originalEpisodeNames[originalIndex] || '';

        const parts = (episodeString || '').split('$');
        const episodeName = parts.length > 1 ? parts[0].trim() : '';
        let buttonText = '';
        let buttonTitle = '';
        let buttonClasses = '';
        if (isVarietyShow) {
            // 综艺节目：优先用原始名称
            buttonText = originalName || episodeName || `第${originalIndex + 1}集`;
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn';
        } else {
            // 非综艺节目：优先用原始名称
            if (originalName && (originalName || isNaN(parseInt(originalName, 10)))) {
                buttonText = originalName;
            } else if (episodeName && isNaN(parseInt(episodeName, 10))) {
                buttonText = episodeName;
            } else {
                buttonText = `第 ${originalIndex + 1} 集`;
            }
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn px-2 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs sm:text-sm transition-colors truncate';
        }

        const safeVideoTitle = encodeURIComponent(videoTitle);
        const safeSourceName = encodeURIComponent(sourceName);
        // 从剧集字符串中提取真实的播放URL
        let playUrl = episodeString;
        if (episodeString.includes('$')) {
            playUrl = episodeString.split('$').pop();
        }
        return `
            <button 
                onclick="playVideo('${playUrl}', decodeURIComponent('${safeVideoTitle}'), ${originalIndex}, decodeURIComponent('${safeSourceName}'), '${sourceCode}', '${vodId}', '${year}', '${typeName}', '${videoKey}')" 
                class="${buttonClasses}"
                data-index="${originalIndex}"
                title="${buttonTitle}" 
            >
                ${buttonText}
            </button>`;
    }).join('');
}

// 复制视频链接到剪贴板
function copyLinks() {
    const reversed = AppState.get('episodesReversed') || false;
    const episodesToCopy = AppState.get('currentEpisodes');

    if (!episodesToCopy || episodesToCopy.length === 0) {
        showToast('没有可复制的链接', 'warning');
        return;
    }

    const actualEpisodes = reversed ? [...episodesToCopy].reverse() : [...episodesToCopy];
    const linkList = actualEpisodes.join('\r\n');

    navigator.clipboard.writeText(linkList).then(() => {
        showToast('所有剧集链接已复制', 'success');
    }).catch(err => {
        console.error('复制链接失败:', err);
        showToast('复制失败，请检查浏览器权限', 'error');
    });
}

window.showVideoEpisodesModal = showVideoEpisodesModal;

/**
 * 更新卡片UI上的画质标签，并为可重试的状态绑定点击事件
 */
function updateQualityBadgeUI(qualityId, quality) {
    const cardElement = document.querySelector(`[data-quality-id="${qualityId}"]`);
    if (!cardElement) return;

    const badge = cardElement.querySelector('.quality-badge');
    if (!badge) return;

    badge.textContent = quality;
    // 重置所有样式和事件
    badge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded';
    badge.title = '';
    badge.style.cursor = 'default';
    badge.onclick = null;

    // 根据画质设置样式和行为
    if (quality === '1080P' || quality === '4K') {
        badge.classList.add('bg-purple-600', 'text-purple-100');
    } else if (quality === '720P' || quality === '高清') {
        badge.classList.add('bg-blue-600', 'text-blue-100');
    } else if (['未知', '检测失败', '无效链接'].includes(quality)) {
        badge.classList.add('bg-gray-600', 'text-gray-200', 'cursor-pointer', 'hover:opacity-80');
        badge.title = '点击重新检测';
        // [重要] 绑定手动重试的点击事件
        badge.onclick = (event) => {
            event.stopPropagation(); // 阻止事件冒泡，防止触发卡片点击
            manualRetryDetection(qualityId, cardElement.videoData);
        };
    } else {
        // 其他情况（如编码不支持等）
        badge.classList.add('bg-orange-600', 'text-white');
    }
}

/**
 * 用户手动触发重新检测画质
 * @param {string} qualityId - 视频唯一标识
 * @param {object} videoData - 视频元数据（包含链接等信息）
 */
async function manualRetryDetection(qualityId, videoData) {
    // 1. 显示“检测中”状态
    const badge = document.querySelector(`.quality-badge[data-quality-id="${qualityId}"]`);
    if (badge) {
        badge.textContent = '检测中...';
        badge.className = 'quality-badge text-xs text-gray-500';
        badge.title = '检测中，请稍候';
        badge.onclick = null; // 检测中禁用点击
    }

    // 2. 获取有效的播放链接（复用之前的逻辑）
    let episodeUrl = '';
    try {
        // 优先用最新的剧集链接
        const episodes = AppState.get('currentEpisodes') || [];
        if (episodes.length > 0) {
            episodeUrl = episodes[0].includes('$') ? episodes[0].split('$')[1] : episodes[0];
        }
        // 其次用缓存的真实链接（比如自定义源）
        else if (videoData.vod_id) {
            const customCache = localStorage.getItem('customApiRealUrls_' + videoData.vod_id);
            if (customCache) {
                const realUrls = JSON.parse(customCache);
                if (realUrls.length > 0) episodeUrl = realUrls[0];
            }
        }
        // 最后用视频元数据中的原始链接
        else if (videoData.vod_play_url) {
            const firstSegment = videoData.vod_play_url.split('#')[0];
            episodeUrl = firstSegment.includes('$') ? firstSegment.split('$')[1] : firstSegment;
        }

        // 3. 执行重新检测
        if (episodeUrl) {
            const newQuality = await getQualityViaVideoProbe(episodeUrl);
            // 更新缓存和UI
            saveQualityCache(qualityId, newQuality);
            updateQualityBadgeUI(qualityId, newQuality);

            // 同步更新弹窗中的画质标签（如果弹窗已打开）
            const modalQualityTag = document.querySelector(`#modal [data-field="quality-tag"]`);
            if (modalQualityTag && document.querySelector('#modal').style.display !== 'none') {
                modalQualityTag.textContent = newQuality;
                // 同步弹窗标签样式
                if (newQuality === '1080P' || newQuality === '4K') {
                    modalQualityTag.style.backgroundColor = '#2563eb';
                } else if (newQuality === '未知') {
                    modalQualityTag.style.backgroundColor = '#4b5563';
                } else {
                    modalQualityTag.style.backgroundColor = '#16a34a';
                }
            }
        } else {
            // 无有效链接时提示
            saveQualityCache(qualityId, '无有效链接');
            updateQualityBadgeUI(qualityId, '无有效链接');
        }
    } catch (e) {
        console.error('手动检测失败:', e);
        saveQualityCache(qualityId, '检测失败');
        updateQualityBadgeUI(qualityId, '检测失败');
    }
}

// 导出到全局，确保点击事件能调用
window.manualRetryDetection = manualRetryDetection;