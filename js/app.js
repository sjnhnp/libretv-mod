// ✅ 使用 localStorage 进行持久化缓存 (从 sessionStorage 改为 localStorage)
const QUALITY_CACHE_KEY = 'qualityCache';
const qualityCache = new Map(JSON.parse(localStorage.getItem(QUALITY_CACHE_KEY) || '[]'));

/**
 * 缓存10分钟，超时自动重新检测
 */
function saveQualityCache(qualityId, quality) {
    // 记录画质和缓存时间（10分钟后过期）
    qualityCache.set(qualityId, {
        quality: quality,
        cacheTime: Date.now() // 缓存时间戳
    });
    // 保存到本地缓存，避免刷新后丢失
    try {
        localStorage.setItem(QUALITY_CACHE_KEY, JSON.stringify(Array.from(qualityCache.entries()))); // 修改为 localStorage
    } catch (e) {
        console.warn("缓存空间不足，已自动跳过");
    }
}

/**
 * 读取缓存的画质结果，过期则返回null（需要重新检测）
 */
function getCachedQuality(qualityId) {
    const cachedData = qualityCache.get(qualityId);
    if (!cachedData) {
        return null; // 没有缓存，需要检测
    }
    // 缓存超过10分钟（600000毫秒）则过期
    const isExpired = Date.now() - cachedData.cacheTime > 600000;
    if (isExpired) {
        qualityCache.delete(qualityId); // 删除过期缓存
        // 当缓存过期并删除时，立即更新 localStorage
        try {
            localStorage.setItem(QUALITY_CACHE_KEY, JSON.stringify(Array.from(qualityCache.entries())));
        } catch (e) {
            console.warn("更新缓存失败，空间不足:", e);
        }
        return null; // 提示重新检测
    }
    return cachedData;
}

// 主应用程序逻辑 使用AppState进行状态管理，DOMCache进行DOM元素缓存
const AppState = (function () {
    const state = new Map();
    return {
        set: function (key, value) { state.set(key, value); },
        get: function (key) { return state.get(key); },
        initialize: function (initialData = {}) {
            for (const key in initialData) {
                if (initialData.hasOwnProperty(key)) {
                    state.set(key, initialData[key]);
                }
            }
        }
    };
})();

const DOMCache = (function () {
    const cache = new Map();
    return {
        set: function (key, element) { if (element) cache.set(key, element); },
        get: function (key) { return cache.get(key); },
        init: function (elementsToCache) {
            for (const key in elementsToCache) {
                if (elementsToCache.hasOwnProperty(key)) {
                    const element = document.getElementById(elementsToCache[key]);
                    if (element) cache.set(key, element);
                }
            }
        }
    };
})();

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
    let playUrl = episodeString;
    if (episodeString.includes('$')) {
        playUrl = episodeString.split('$')[1];
    }
    if (!playUrl || !playUrl.startsWith('http')) {
        showToast('视频链接格式无效', 'error');
        console.error('解析出的播放链接无效:', playUrl);
        return;
    }
    const isSpecialSource = !sourceCode.startsWith('custom_') && API_SITES[sourceCode] && API_SITES[sourceCode].detail;
    if (isSpecialSource) {
        const detailUrl = `/api/detail?id=${vodId}&source=${sourceCode}`;
        try {
            const response = await fetch(detailUrl);
            const data = await response.json();
            if (data.code === 200 && Array.isArray(data.episodes)) {
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
            typeName: typeName,
            episodes: AppState.get('currentEpisodes') || []
        };
        addToViewingHistory(videoInfoForHistory);
    }
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

function generateUniversalId(title, year, episodeIndex) {
    const normalizedTitle = title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? year : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

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

async function playFromHistory(url, title, episodeIndex, playbackPosition = 0, typeName = '') {
    let historyItem = null;
    let episodesList = [];
    let vodId = '',
        actualSourceName = '',
        actualSourceCode = '',
        videoYear = '',
        currentVideoTypeName = '';
    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');
        historyItem = history.find(item => item.url === url && item.title === title && item.episodeIndex === episodeIndex);
        if (historyItem) {
            vodId = historyItem.vod_id || '';
            actualSourceName = historyItem.sourceName || '';
            actualSourceCode = historyItem.sourceCode || '';
            videoYear = historyItem.year || '';
            currentVideoTypeName = historyItem.typeName || '';
        }
    } catch (e) {
        console.error("读取历史记录失败:", e);
    }
    if (historyItem && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0 && historyItem.episodes[0].includes('$')) {
        episodesList = historyItem.episodes;
    } else if (vodId && actualSourceCode) {
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
                episodesList = detailData.episodes;
            } else {
                if (historyItem && Array.isArray(historyItem.episodes) && historyItem.episodes.length > 0) {
                    episodesList = historyItem.episodes;
                } else {
                    throw new Error(detailData.msg || 'API返回数据无效');
                }
            }
        } catch (e) {
            episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
        }
    } else {
        episodesList = AppState.get('currentEpisodes') || JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
    }

    // --- 修复后的核心逻辑：统一处理原始剧集名称 ---
    let namesToStore = [];
    // 1. 最佳来源：从刚获取的 episodesList 解析
    if (episodesList.length > 0 && typeof episodesList[0] === 'string' && episodesList[0].includes('$')) {
        namesToStore = episodesList.map(ep => ep.split('$')[0].trim());
    }
    // 2. 备用来源：从历史记录项中恢复
    else if (historyItem && Array.isArray(historyItem.originalEpisodeNames) && historyItem.originalEpisodeNames.length > 0) {
        namesToStore = historyItem.originalEpisodeNames;
    }

    // 3. 根据结果更新 localStorage
    if (namesToStore.length > 0) {
        localStorage.setItem('originalEpisodeNames', JSON.stringify(namesToStore));
    } else {
        // 如果两种方式都获取不到，则清空旧缓存，避免显示错误的名称
        localStorage.removeItem('originalEpisodeNames');
    }

    if (episodesList.length > 0) {
        AppState.set('currentEpisodes', episodesList);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
    }
    let actualEpisodeIndex = episodeIndex;
    if (actualEpisodeIndex >= episodesList.length) {
        actualEpisodeIndex = episodesList.length > 0 ? episodesList.length - 1 : 0;
    }
    let finalUrl = (episodesList.length > 0 && episodesList[actualEpisodeIndex]) ?
        episodesList[actualEpisodeIndex] : url;

    if (typeof finalUrl === 'string' && finalUrl.includes('$')) {
        finalUrl = finalUrl.split('$')[1];
    }
    AppState.set('currentEpisodeIndex', actualEpisodeIndex);
    AppState.set('currentVideoTitle', title);
    localStorage.setItem('currentEpisodeIndex', actualEpisodeIndex.toString());
    localStorage.setItem('currentVideoTitle', title);

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', finalUrl);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', actualEpisodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (actualSourceName) playerUrl.searchParams.set('source', actualSourceName);
    if (actualSourceCode) playerUrl.searchParams.set('source_code', actualSourceCode);
    if (videoYear) playerUrl.searchParams.set('year', videoYear);
    // 将 typeName 传递给播放器（优先使用传入的参数，其次使用历史记录中的）
    const finalTypeName = typeName || currentVideoTypeName;
    if (finalTypeName) playerUrl.searchParams.set('typeName', finalTypeName);
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());
    const uid = generateUniversalId(title, videoYear, actualEpisodeIndex);
    playerUrl.searchParams.set('universalId', uid);
    const adOn = typeof getBoolConfig !== 'undefined' && typeof PLAYER_CONFIG !== 'undefined' ? getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled) : PLAYER_CONFIG?.adFilteringEnabled ?? false;
    playerUrl.searchParams.set('af', adOn ? '1' : '0');
    window.location.href = playerUrl.toString();
}

function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 搜索缓存相关函数
function getSearchCacheKey(query, selectedAPIs) {
    return `searchCache_${query}_${selectedAPIs.sort().join('_')}`;
}

function checkSearchCache(query, selectedAPIs) {
    try {
        const cacheKey = getSearchCacheKey(query, selectedAPIs);
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return { canUseCache: false };

        const cacheData = JSON.parse(cached);
        const now = Date.now();
        const expireTime = 10 * 60 * 1000; // 10分钟过期

        if (now - cacheData.timestamp > expireTime) {
            localStorage.removeItem(cacheKey);
            return { canUseCache: false };
        }

        // 检查API是否有变化
        const cachedAPIs = cacheData.selectedAPIs || [];
        const added = selectedAPIs.filter(api => !cachedAPIs.includes(api));
        const removed = cachedAPIs.filter(api => !selectedAPIs.includes(api));

        return {
            canUseCache: added.length === 0 && removed.length === 0,
            results: cacheData.results || [],
            newAPIs: added
        };
    } catch (e) {
        console.warn('检查搜索缓存失败:', e);
        return { canUseCache: false };
    }
}

function saveSearchCache(query, selectedAPIs, results) {
    try {
        const cacheKey = getSearchCacheKey(query, selectedAPIs);
        const cacheData = {
            timestamp: Date.now(),
            selectedAPIs: [...selectedAPIs],
            results: results
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('保存搜索缓存失败:', e);
    }
}

function backgroundSpeedUpdate(results) {
    // 后台更新速度，限制并发数为3
    const concurrentLimit = 3;
    let currentIndex = 0;

    function processNext() {
        if (currentIndex >= results.length) return;

        const batch = results.slice(currentIndex, currentIndex + concurrentLimit);
        currentIndex += concurrentLimit;

        const promises = batch.map(async (item) => {
            if (!item.vod_play_url) return item;

            const firstSegment = item.vod_play_url.split('#')[0];
            const firstEpisodeUrl = firstSegment.includes('$') ? firstSegment.split('$')[1] : firstSegment;

            try {
                const checkResult = await window.precheckSource(firstEpisodeUrl);
                // 只更新速度相关字段
                item.loadSpeed = checkResult.loadSpeed;
                item.sortPriority = checkResult.sortPriority;

                // 更新弹窗中的速度显示（如果弹窗打开）
                updateModalSpeedDisplay(item);
            } catch (e) {
                console.warn('后台速度检测失败:', e);
            }
            return item;
        });

        Promise.all(promises).then(() => {
            setTimeout(processNext, 100); // 避免过于频繁的请求
        });
    }

    // 延迟100ms开始后台检测，避免阻塞UI
    setTimeout(processNext, 100);
}

function isValidSpeedValue(speed) {
    if (!speed || speed === 'N/A' || speed === '连接超时' || speed === '未知' || speed === '检测失败') {
        return false;
    }
    // 只显示包含数字+单位的速度值
    return /^\d+(\.\d+)?\s*(KB\/s|MB\/s|kb\/s|mb\/s)$/i.test(speed);
}

function updateModalSpeedDisplay(item) {
    // 更新弹窗中对应项目的速度显示
    const modal = document.getElementById('modal');
    if (!modal || modal.style.display === 'none') return;

    const speedElement = modal.querySelector(`[data-vod-id="${item.vod_id}"] .speed-tag`);
    if (speedElement && item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
        speedElement.textContent = item.loadSpeed;
        speedElement.style.display = 'inline-block';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initializeAppState();
    initializeDOMCache();
    APISourceManager.init();
    initializeEventListeners();
    renderSearchHistory();
    restoreSearchFromCache();
});

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
        let restoredMap = new Map();
        if (cachedData) {
            const rawArr = JSON.parse(cachedData);
            if (rawArr.length > 0 && !String(rawArr[0][0]).includes('_')) {
                console.warn("检测到旧版视频缓存，已清除。");
            } else {
                restoredMap = new Map(rawArr);
            }
        }
        AppState.set('videoDataMap', restoredMap);
    } catch (e) {
        console.error('从 sessionStorage 恢复视频元数据缓存失败:', e);
        AppState.set('videoDataMap', new Map());
    }
}

function initializeDOMCache() {
    DOMCache.init({
        searchInput: 'searchInput',
        searchResults: 'searchResults',
        searchForm: 'searchForm',
        searchHistoryContainer: 'searchHistory',
        apiCheckboxes: 'apiCheckboxes',
        customApisList: 'customApisList',
        selectedApiCount: 'selectedApiCount',
        addCustomApiForm: 'addCustomApiForm',
        customApiName: 'customApiName',
        customApiUrl: 'customApiUrl',
        customApiDetail: 'customApiDetail',
        customApiIsAdult: 'customApiIsAdult',
        yellowFilterToggle: 'yellowFilterToggle',
        adFilteringToggle: 'adFilterToggle',
        speedDetectionToggle: 'speedDetectionToggle',
        preloadingToggle: 'preloadingToggle',
        preloadCountInput: 'preloadCountInput'
    });
}

function initializeEventListeners() {
    const searchForm = DOMCache.get('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            search();
        });
    }
    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, enabled.toString());
            showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, PLAYER_CONFIG.adFilteringEnabled);
    }
    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
        });
        yellowFilterToggle.checked = getBoolConfig('yellowFilterEnabled', true);
    }
    const speedDetectionToggle = DOMCache.get('speedDetectionToggle');
    if (speedDetectionToggle) {
        speedDetectionToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.speedDetectionStorage, enabled.toString());
            showToast(enabled ? '已启用画质速度检测' : '已禁用画质速度检测', 'info');
        });
        speedDetectionToggle.checked = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
    }
    const preloadingToggle = DOMCache.get('preloadingToggle');
    if (preloadingToggle) {
        preloadingToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('preloadingEnabled', enabled.toString());
            PLAYER_CONFIG.enablePreloading = enabled;
            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');
            const preloadCountInput = DOMCache.get('preloadCountInput');
            if (preloadCountInput) preloadCountInput.disabled = !enabled;
        });
        const preloadingEnabled = getBoolConfig('preloadingEnabled', true);
        preloadingToggle.checked = preloadingEnabled;
        PLAYER_CONFIG.enablePreloading = preloadingEnabled;
        const preloadCountInput = DOMCache.get('preloadCountInput');
        if (preloadCountInput) preloadCountInput.disabled = !preloadingEnabled;
    }
    const preloadCountInput = DOMCache.get('preloadCountInput');
    if (preloadCountInput) {
        preloadCountInput.addEventListener('change', (e) => {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) count = 1;
            else if (count > 10) count = 10;
            e.target.value = count;
            localStorage.setItem('preloadCount', count.toString());
            PLAYER_CONFIG.preloadCount = count;
            showToast(`预加载数量已设置为 ${count}`, 'info');
        });
        const savedCount = localStorage.getItem('preloadCount');
        const preloadCount = savedCount ? parseInt(savedCount) : 2;
        preloadCountInput.value = preloadCount;
        PLAYER_CONFIG.preloadCount = preloadCount;
    }
}

function search(options = {}) {
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
        sessionStorage.removeItem('videoSourceMap');
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
        if (typeof showToast === 'function') showToast('请至少选择一个API源', 'warning');
        if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }
    performSearch(query, selectedAPIs)
        .then(resultsData => {
            renderSearchResults(resultsData, options.doubanQuery ? query : null);
            // 缓存结果已加载，无需额外提示
        })
        .catch(error => {
            if (searchResultsContainer) searchResultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        })
        .finally(() => {
            if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
            if (typeof options.onComplete === 'function') options.onComplete();
        });
}

async function performSearch(query, selectedAPIs) {
    // 检查是否启用速度检测
    const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);

    // 如果启用速度检测，先检查缓存
    if (speedDetectionEnabled) {
        const cacheResult = checkSearchCache(query, selectedAPIs);
        if (cacheResult.canUseCache) {
            // 显示缓存加载提示
            if (typeof showLoading === 'function') {
                showLoading(`正加载"${query}"的搜索结果`);
            }
            // 启动后台速度更新
            setTimeout(() => backgroundSpeedUpdate(cacheResult.results), 100);

            // 确保缓存结果也构建videoSourceMap
            const videoSourceMap = new Map();
            cacheResult.results.forEach(item => {
                if (item.vod_id) {
                    const videoKey = `${item.vod_name}|${item.vod_year || ''}`;
                    if (!videoSourceMap.has(videoKey)) {
                        videoSourceMap.set(videoKey, []);
                    }
                    videoSourceMap.get(videoKey).push(item);
                }
            });
            sessionStorage.setItem('videoSourceMap', JSON.stringify(Array.from(videoSourceMap.entries())));

            // 延迟一点时间让用户看到加载提示，然后返回缓存结果
            return new Promise(resolve => {
                setTimeout(() => resolve(cacheResult.results), 300);
            });
        }
    }

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
        let checkedResults = allResults;

        // 只有启用速度检测时才进行检测
        if (speedDetectionEnabled) {
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
            checkedResults = await Promise.all(precheckPromises);
        } else {
            // 不检测时，设置默认值以保持数据结构一致
            checkedResults = allResults.map(item => ({
                ...item,
                quality: '未知',
                loadSpeed: 'N/A',
                pingTime: -1,
                detectionMethod: 'disabled',
                sortPriority: 50
            }));
        }
        checkedResults.sort((a, b) => {
            // 新的排序逻辑：优先级 + 速度

            // 1. 首先按检测方法的可靠性排序（sortPriority越小越优先）
            const priorityA = a.sortPriority || 50;
            const priorityB = b.sortPriority || 50;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // 2. 相同优先级的情况下，按实际速度排序
            const getSpeedValue = (loadSpeed) => {
                if (!loadSpeed || loadSpeed === 'N/A') return 0;
                if (loadSpeed === '极速') return 10000; // 关键词识别的最高分
                if (loadSpeed === '连接正常') return 1000; // 连接正常的固定分数
                if (loadSpeed === '连接超时') return 0; // 超时的最低分

                // 解析实际速度
                const match = loadSpeed.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
                if (match) {
                    const value = parseFloat(match[1]);
                    const unit = match[2];
                    return unit === 'MB/s' ? value * 1024 : value;
                }

                return 100; // 其他情况的默认分数
            };

            const speedA = getSpeedValue(a.loadSpeed);
            const speedB = getSpeedValue(b.loadSpeed);

            return speedB - speedA; // 速度高的排在前面
        });
        const videoDataMap = AppState.get('videoDataMap') || new Map();

        // 将所有搜索结果按影片分组，以供播放页的线路切换功能使用
        const videoSourceMap = new Map();
        checkedResults.forEach(item => {
            if (item.vod_id) {
                // 使用 "名称|年份" 作为分组的键
                const videoKey = `${item.vod_name}|${item.vod_year || ''}`;
                if (!videoSourceMap.has(videoKey)) {
                    videoSourceMap.set(videoKey, []);
                }
                videoSourceMap.get(videoKey).push(item);
            }
        });
        // 将分组后的线路信息保存到 sessionStorage
        sessionStorage.setItem('videoSourceMap', JSON.stringify(Array.from(videoSourceMap.entries())));

        checkedResults.forEach(item => {
            if (item.vod_id) {
                const uniqueVideoKey = `${item.source_code}_${item.vod_id}`;
                videoDataMap.set(uniqueVideoKey, item);
            }
        });
        AppState.set('videoDataMap', videoDataMap);
        sessionStorage.setItem('videoDataCache', JSON.stringify(Array.from(videoDataMap.entries())));

        // 保存搜索缓存（仅在启用速度检测时）
        if (speedDetectionEnabled) {
            saveSearchCache(query, selectedAPIs, checkedResults);
        }

        return checkedResults;
    } catch (error) {
        console.error("执行搜索或预检测时出错:", error);
        return [];
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
        searchResultsContainer.innerHTML = `
            <div class="col-span-full text-center py-10 sm:py-16">
                <svg class="mx-auto h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h3 class="mt-2 text-lg font-medium text-gray-300">${messageTitle}</h3>
                <p class="mt-1 text-sm text-gray-500">${messageSuggestion}</p>
            </div>`;
        const searchArea = getElement('searchArea');
        if (searchArea) {
            searchArea.classList.add('flex-1');
            searchArea.classList.remove('mb-8');
        }
        getElement('doubanArea')?.classList.add('hidden');
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
    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden');
}

function restoreSearchFromCache() {
    try {
        const cachedQuery = sessionStorage.getItem('searchQuery');
        const cachedResults = sessionStorage.getItem('searchResults');
        const cachedSelectedAPIs = sessionStorage.getItem('searchSelectedAPIs');
        if (cachedQuery && cachedResults) {
            const searchInput = DOMCache.get('searchInput');
            if (searchInput) searchInput.value = cachedQuery;
            if (cachedSelectedAPIs) {
                try {
                    AppState.set('selectedAPIs', JSON.parse(cachedSelectedAPIs));
                } catch (e) {
                    console.warn('恢复API选择状态失败:', e);
                }
            }
            renderSearchResultsFromCache(JSON.parse(cachedResults));
            if (typeof closeModal === 'function') closeModal();
        }
    } catch (e) {
        console.error('恢复搜索状态失败:', e);
    }
}

function renderSearchResultsFromCache(cachedResults) {
    const searchResultsContainer = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const searchResultsCountElement = getElement('searchResultsCount');
    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;
    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = cachedResults.length.toString();
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
        imgElement.src = item.vod_pic && item.vod_pic.startsWith('http') ? item.vod_pic : 'https://via.placeholder.com/100x150/191919/555555?text=No+Image';
        imgElement.alt = item.vod_name || '未知标题';
        imgElement.onerror = function () {
            this.onerror = null;
            this.src = 'https://via.placeholder.com/100x150/191919/555555?text=Error';
            this.classList.add('object-contain');
        };
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
    const sourceContainer = clone.querySelector('.result-source');
    if (sourceContainer) {
        // 检查是否启用画质检测
        const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
        if (speedDetectionEnabled) {
            const qualityBadge = document.createElement('span');
            const qualityId = `${item.source_code}_${item.vod_id}`;
            qualityBadge.setAttribute('data-quality-id', qualityId);
            updateQualityBadgeUI(qualityId, item.quality || '未知', qualityBadge); // 直接调用更新函数

            const quality = item.quality || '未知';
            const isRetryable = ['未知', '检测失败', '检测超时', '编码不支持', '播放失败', '无有效链接'].includes(quality);

            // 如果状态是可重试的，就给它绑定手动重测的点击事件
            if (isRetryable) {
                qualityBadge.style.cursor = 'pointer';
                qualityBadge.title = '点击重新检测';
                qualityBadge.onclick = (event) => {
                    // 关键一步：阻止事件冒泡，这样就不会触发父级卡片的弹窗事件了
                    event.stopPropagation();

                    // 调用手动重测函数
                    manualRetryDetection(qualityId, item);
                };
            }

            sourceContainer.appendChild(qualityBadge);
        }
    }
    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    if (item.api_url) cardElement.dataset.apiUrl = item.api_url;
    cardElement.dataset.videoKey = `${item.vod_name}|${item.vod_year || ''}`;
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
    // 如果点击的是画质标签，不执行卡片点击逻辑
    if (event.target.classList.contains('quality-badge')) {
        return;
    }

    const card = event.currentTarget;
    const { id, name, sourceCode, apiUrl = '', year, typeName, videoKey, blurb, remarks, area, actor, director } = card.dataset;
    if (typeof showVideoEpisodesModal === 'function') {
        showVideoEpisodesModal(id, name, sourceCode, apiUrl, { year, typeName, videoKey, blurb, remarks, area, actor, director });
    } else {
        console.error('showVideoEpisodesModal function not found!');
        showToast('无法加载剧集信息', 'error');
    }
}

window.handleResultClick = handleResultClick;
window.copyLinks = copyLinks;
window.toggleEpisodeOrderUI = toggleEpisodeOrderUI;

async function showVideoEpisodesModal(id, title, sourceCode, apiUrl, fallbackData) {
    const videoDataMap = AppState.get('videoDataMap');
    const uniqueVideoKey = `${sourceCode}_${id}`;
    const videoData = videoDataMap ? videoDataMap.get(uniqueVideoKey) : null;
    if (!videoData) {
        hideLoading();
        showToast('缓存中找不到视频数据，请刷新后重试', 'error');
        return;
    }
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
    // 渲染画质标签（在showVideoEpisodesModal函数里）
    const qualityTagElement = modalContent.querySelector('[data-field="quality-tag"]');
    if (qualityTagElement) {
        // FIX: 修复了此处的逻辑，优先使用检测结果，并避免回退到“高清”
        // 检查是否启用画质检测
        const speedDetectionEnabled = getBoolConfig(PLAYER_CONFIG.speedDetectionStorage, PLAYER_CONFIG.speedDetectionEnabled);
        if (speedDetectionEnabled) {
            const sourceProvidedQuality = videoData.vod_quality; // API直接提供的质量
            const detectedQuality = videoData.quality; // 我们检测的质量

            // 优先用API提供的，其次用我们检测的，最后是未知
            const finalQuality = sourceProvidedQuality || detectedQuality || '未知';

            qualityTagElement.textContent = finalQuality;
            qualityTagElement.classList.remove('hidden');

            // 给不同画质加颜色（方便区分）
            const qualityLower = finalQuality.toLowerCase();
            if (qualityLower.includes('4k')) {
                qualityTagElement.style.backgroundColor = '#4f46e5'; // 紫色
            } else if (qualityLower.includes('1080')) {
                qualityTagElement.style.backgroundColor = '#7c3aed'; // 深紫色
            } else if (qualityLower.includes('720')) {
                qualityTagElement.style.backgroundColor = '#2563eb'; // 蓝色
            } else if (finalQuality === '高清') {
                qualityTagElement.style.backgroundColor = '#10b981'; // 绿色
            } else if (finalQuality === '标清') {
                qualityTagElement.style.backgroundColor = '#6b7280'; // 灰色
            } else {
                qualityTagElement.style.backgroundColor = '#6b7280'; // 未知用灰色
            }

            // 如果是未知或检测失败，添加点击重新检测功能
            if (['未知', '检测失败', '检测超时', '编码不支持', '播放失败', '无有效链接'].includes(finalQuality)) {
                qualityTagElement.style.cursor = 'pointer';
                qualityTagElement.title = '点击重新检测';
                qualityTagElement.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    const qualityId = `${sourceCode}_${id}`;
                    manualRetryDetection(qualityId, videoData);
                };
            }
        } else {
            // 关闭画质检测时隐藏标签
            qualityTagElement.classList.add('hidden');
        }
    }
    const speedTagElement = modalContent.querySelector('[data-field="speed-tag"]');
    if (speedTagElement && videoData.loadSpeed && isValidSpeedValue(videoData.loadSpeed)) {
        speedTagElement.textContent = videoData.loadSpeed;
        speedTagElement.classList.remove('hidden');
        speedTagElement.style.backgroundColor = '#16a34a';
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
    const realEpisodes = AppState.get('currentEpisodes') || episodes;
    const displayEpisodes = currentReversedState ? [...realEpisodes].reverse() : [...realEpisodes];
    const varietyShowTypes = ['综艺', '脱口秀', '真人秀'];
    const isVarietyShow = varietyShowTypes.some(type => typeName && typeName.includes(type));
    return displayEpisodes.map((episodeString, displayIndex) => {
        const originalIndex = currentReversedState ? (episodes.length - 1 - displayIndex) : displayIndex;
        const originalEpisodeNames = AppState.get('originalEpisodeNames') || [];
        const originalName = originalEpisodeNames[originalIndex] || '';
        const parts = (episodeString || '').split('$');
        const episodeName = parts.length > 1 ? parts[0].trim() : '';
        let buttonText = '';
        let buttonTitle = '';
        let buttonClasses = '';
        if (isVarietyShow) {
            buttonText = originalName || episodeName || `第${originalIndex + 1}集`;
            buttonTitle = buttonText;
            buttonClasses = 'episode-btn';
        } else {
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
 * 更新画质标签的UI显示
 * @param {string} qualityId - 视频的唯一ID
 * @param {string} quality - 探测到的画质
 * @param {HTMLElement} badgeElement - 标签元素
 */
function updateQualityBadgeUI(qualityId, quality, badgeElement) {
    const badge = badgeElement || document.querySelector(`.quality-badge[data-quality-id="${qualityId}"]`);
    if (!badge) return;

    const cardElement = badge.closest('.card-hover');
    const videoData = cardElement ? cardElement.videoData : null;

    badge.textContent = quality;
    badge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded';
    badge.title = '';
    badge.style.cursor = 'default';
    badge.onclick = null;

    // FIX: 根据画质设置不同的颜色（使用小写并增加更多情况）
    switch (String(quality).toLowerCase()) {
        case '4k':
            badge.classList.add('bg-amber-500', 'text-white');
            break;
        case '2k':
        case '1080p':
            badge.classList.add('bg-purple-600', 'text-purple-100');
            break;
        case '720p':
            badge.classList.add('bg-blue-600', 'text-blue-100');
            break;
        case '高清': // 保留以防万一，但新逻辑应避免此情况
        case '480p':
            badge.classList.add('bg-green-600', 'text-green-100');
            break;
        case 'sd':
        case '标清':
            badge.classList.add('bg-gray-500', 'text-gray-100');
            break;
        case '检测失败':
        case '检测超时':
        case '编码不支持':
        case '播放失败':
        case '未知':
        case '无有效链接':
            badge.classList.add('bg-red-600', 'text-red-100');
            badge.title = '点击重新检测';
            badge.style.cursor = 'pointer';
            if (videoData) {
                badge.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    manualRetryDetection(qualityId, videoData);
                };
            }
            break;
        default:
            badge.classList.add('bg-gray-600', 'text-gray-200');
            break;
    }
}

async function manualRetryDetection(qualityId, videoData) {
    const badge = document.querySelector(`.quality-badge[data-quality-id="${qualityId}"]`);
    if (!badge || badge.textContent === '检测中...') return; // 防止重复点击

    // 1. 更新UI，告知用户正在检测
    badge.textContent = '检测中...';
    badge.className = 'quality-badge text-xs font-medium py-0.5 px-1.5 rounded bg-gray-500 text-white';
    badge.style.cursor = 'default';
    badge.title = '正在检测，请稍候';
    badge.onclick = null; // 暂时禁用点击

    try {
        // 2. 调用 SpeedTester 对这一个视频源进行检测
        // SpeedTester.testSources 期望一个数组，所以我们传入一个只包含当前视频源的数组
        const [testedResult] = await window.SpeedTester.testSources([videoData]);

        // 3. 更新全局数据缓存，这非常重要！
        const videoDataMap = AppState.get('videoDataMap');
        if (videoDataMap) {
            videoDataMap.set(qualityId, testedResult);
        }

        // 4. 更新附加到卡片DOM元素上的数据，以便下次点击弹窗时数据是新的
        const cardElement = badge.closest('.card-hover');
        if (cardElement) {
            cardElement.videoData = testedResult;
        }

        // 5. 调用UI函数，用最终结果更新徽章的显示
        updateQualityBadgeUI(qualityId, testedResult.quality, badge);

    } catch (error) {
        console.error('手动重新检测失败:', error);
        // 如果出错，也在UI上明确显示失败
        updateQualityBadgeUI(qualityId, '检测失败', badge);
    }
}

// 将这个函数暴露到全局，以便 onclick 属性可以调用它
window.manualRetryDetection = manualRetryDetection;