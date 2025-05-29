// --- File: js/app.js ---
/**
 * 主应用程序逻辑
 * 使用AppState进行状态管理，DOMCache进行DOM元素缓存
 */

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
        init: function (elementsToCache) {
            for (const key in elementsToCache) {
                if (elementsToCache.hasOwnProperty(key)) {
                    const element = document.getElementById(elementsToCache[key]);
                    if (element) {
                        cache.set(key, element);
                    } else {
                        console.warn(`[DOMCache] Element with ID '${elementsToCache[key]}' not found during init for key '${key}'.`);
                    }
                }
            }
        }
    };
})();


function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 播放视频
 * @param {string} url - 视频URL
 * @param {string} title - 视频标题
 * @param {number} episodeIndex - 集数索引
 * @param {string} sourceName - 来源名称
 * @param {string} sourceCode - 来源代码
 * @param {string} vodId - VOD ID for history/progress
 */
function playVideo(url, title, episodeIndex, sourceName = '', sourceCode = '', vodId = '') {
    if (!url) {
        showToast('无效的视频链接', 'error');
        return;
    }
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    AppState.set('currentVideoId', vodId); // Store vodId in AppState

    if (typeof addToViewingHistory === 'function') {
        const videoInfoForHistory = {
            url: url,
            title: title,
            episodeIndex: episodeIndex,
            sourceName: sourceName,
            sourceCode: sourceCode,
            vod_id: vodId, // Pass vod_id to history
            episodes: AppState.get('currentEpisodes') || []
        };
        addToViewingHistory(videoInfoForHistory);
    }

    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', url);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', episodeIndex.toString());
    if (vodId) { // Pass vodId to player.html
        playerUrl.searchParams.set('id', vodId);
    }
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    
    const adOn = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, false);
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    // Pass all episodes to player.html for context if available
    const episodesForPlayer = AppState.get('currentEpisodes');
    if (Array.isArray(episodesForPlayer) && episodesForPlayer.length > 0) {
        try {
            playerUrl.searchParams.set('episodes', encodeURIComponent(JSON.stringify(episodesForPlayer)));
        } catch (e) {
            console.warn("Failed to stringify/encode episodes for player URL:", e);
        }
    }
    
    window.location.href = playerUrl.toString();
}


function playPreviousEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (currentIndex > 0 && episodes && episodes.length > 0) {
        const prevIndex = currentIndex - 1;
        const title = AppState.get('currentVideoTitle');
        const sourceName = AppState.get('currentSourceName') || '';
        const sourceCode = AppState.get('currentSourceCode') || '';
        const vodId = AppState.get('currentVideoId') || '';
        playVideo(episodes[prevIndex], title, prevIndex, sourceName, sourceCode, vodId);
    } else {
        showToast('已经是第一集了', 'info');
    }
}


function playNextEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (episodes && currentIndex < episodes.length - 1) {
        const nextIndex = currentIndex + 1;
        const title = AppState.get('currentVideoTitle');
        const sourceName = AppState.get('currentSourceName') || '';
        const sourceCode = AppState.get('currentSourceCode') || '';
        const vodId = AppState.get('currentVideoId') || '';
        playVideo(episodes[nextIndex], title, nextIndex, sourceName, sourceCode, vodId);
    } else {
        showToast('已经是最后一集了', 'info');
    }
}

/**
 * Plays video from history (called by ui.js)
 * @param {string} url - Video URL
 * @param {string} title - Video title
 * @param {number} episodeIndex - Episode index
 * @param {number} playbackPosition - Playback position in seconds
 * @param {string} vodId - VOD ID from history item
 * @param {string} sourceName - Source name from history item
 * @param {string} sourceCode - Source code from history item
 * @param {Array} episodes - Episodes list from history item
 */
function playFromHistory(url, title, episodeIndex, playbackPosition = 0, vodId = '', sourceName = '', sourceCode = '', episodes = []) {
    console.log(`[App - playFromHistory] Called with: url=${url}, title=${title}, epIndex=${episodeIndex}, pos=${playbackPosition}, vodId=${vodId}`);

    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    AppState.set('currentVideoId', vodId);
    if (episodes && episodes.length > 0) {
        AppState.set('currentEpisodes', episodes);
        localStorage.setItem('currentEpisodes', JSON.stringify(episodes)); // For player.html fallback
    }
    localStorage.setItem('currentEpisodeIndex', episodeIndex.toString());
    localStorage.setItem('currentVideoTitle', title);


    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', url);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('index', episodeIndex.toString());
    if (vodId) playerUrl.searchParams.set('id', vodId);
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());
    
    // Pass episodes list to player if available from history item
    if (episodes && episodes.length > 0) {
        try {
            playerUrl.searchParams.set('episodes', encodeURIComponent(JSON.stringify(episodes)));
        } catch (e) {
            console.warn("Failed to stringify/encode episodes from history for player URL:", e);
        }
    }

    const adOn = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, false);
    playerUrl.searchParams.set('af', adOn ? '1' : '0');

    console.log(`[App - playFromHistory] Navigating to player: ${playerUrl.toString()}`);
    window.location.href = playerUrl.toString();
}


function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

document.addEventListener('DOMContentLoaded', function () {
    initializeAppState();
    initializeDOMCache(); // This must run and successfully cache elements
    APISourceManager.init();
    initializeEventListeners();
    if (typeof renderSearchHistory === 'function') { // Ensure ui.js is loaded
        renderSearchHistory();
    } else {
        console.warn("renderSearchHistory function not found, ui.js might not be loaded or initialized yet.");
    }
    restoreSearchFromCache(); 
});


function initializeAppState() {
    AppState.initialize({
        'selectedAPIs': JSON.parse(localStorage.getItem('selectedAPIs') || '["bfzy", "heimuer", "tyyszy", "dbzy"]'),
        'customAPIs': JSON.parse(localStorage.getItem('customAPIs') || '[]'),
        'currentEpisodeIndex': 0,
        'currentEpisodes': [],
        'currentVideoTitle': '',
        'currentVideoId': '', 
        'currentSourceName': '',
        'currentSourceCode': '',
        'episodesReversed': false
    });
}


function initializeDOMCache() {
    DOMCache.init({
        'searchInput': 'searchInput',
        'searchResults': 'searchResults', // Crucial for displaying results
        'searchForm': 'searchForm',
        'searchHistoryContainer': 'searchHistory', 
        'apiCheckboxes': 'apiCheckboxes',
        'customApisList': 'customApisList',
        'selectedApiCount': 'selectedApiCount',
        'addCustomApiForm': 'addCustomApiForm',
        'customApiName': 'customApiName',
        'customApiUrl': 'customApiUrl',
        'customApiIsAdult': 'customApiIsAdult',
        'yellowFilterToggle': 'yellowFilterToggle',
        'adFilteringToggle': 'adFilterToggle', 
        'preloadingToggle': 'preloadingToggle',
        'preloadCountInput': 'preloadCountInput',
        'resultsArea': 'resultsArea', // Crucial for results area visibility
        'searchResultsCount': 'searchResultsCount', // Crucial for displaying count
        'doubanArea': 'doubanArea',
        'searchArea': 'searchArea'
        // Ensure your main HTML file (e.g., index.html) has elements with these IDs:
        // - searchResults
        // - resultsArea
        // - searchResultsCount
    });
}


function initializeEventListeners() {
    const searchForm = DOMCache.get('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            search();
        });
    }

    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, enabled.toString());
            if (typeof showToast === 'function') showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, false);
    }

    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            if (typeof showToast === 'function') showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
        });
        yellowFilterToggle.checked = getBoolConfig('yellowFilterEnabled', true);
    }

    const preloadingToggle = DOMCache.get('preloadingToggle');
    const preloadCountInput = DOMCache.get('preloadCountInput');
    if (preloadingToggle && preloadCountInput) {
        const initPreloading = () => {
            const preloadingEnabled = getBoolConfig('preloadingEnabled', PLAYER_CONFIG.enablePreloading);
            preloadingToggle.checked = preloadingEnabled;
            PLAYER_CONFIG.enablePreloading = preloadingEnabled;
            preloadCountInput.disabled = !preloadingEnabled;

            const savedCount = localStorage.getItem('preloadCount');
            const preloadCount = savedCount ? parseInt(savedCount) : PLAYER_CONFIG.preloadCount;
            preloadCountInput.value = preloadCount;
            PLAYER_CONFIG.preloadCount = preloadCount;
        };

        preloadingToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('preloadingEnabled', enabled.toString());
            PLAYER_CONFIG.enablePreloading = enabled;
            preloadCountInput.disabled = !enabled;
            if (typeof showToast === 'function') showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');
        });
        
        preloadCountInput.addEventListener('change', function (e) {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) count = 1;
            else if (count > 10) count = 10;
            e.target.value = count.toString();
            localStorage.setItem('preloadCount', count.toString());
            PLAYER_CONFIG.preloadCount = count;
            if (typeof showToast === 'function') showToast(`预加载数量已设置为 ${count}`, 'info');
        });
        initPreloading();
    }
}


function search(options = {}) {
    const searchInput = DOMCache.get('searchInput');
    // searchResultsContainer is retrieved inside renderSearchResults using DOMCache

    if (!searchInput) { // Only check for searchInput here
        console.error("Search input field not found in DOMCache.");
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
    
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
    } catch(e) { console.warn("Failed to clear previous search cache", e); }


    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        const searchResultsContainer = DOMCache.get('searchResults'); // Get it here for the message
        if (searchResultsContainer) searchResultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">请至少选择一个API源</div>';
        else console.warn("searchResults container not found for 'no API' message.");
        if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
    }

    performSearch(query, selectedAPIs)
        .then(resultsData => {
            renderSearchResults(resultsData, options.doubanQuery ? query : null);
        })
        .catch(error => {
            const searchResultsContainer = DOMCache.get('searchResults'); // Get it here for error message
            if (searchResultsContainer) searchResultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
            else console.warn("searchResults container not found for error message.");
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


async function performSearch(query, selectedAPIs) {
    const searchPromises = selectedAPIs.map(apiId => {
        let fetchUrl;
        let apiName;
        let customApiUrlForFetch = ''; 

        if (apiId.startsWith('custom_')) {
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi && customApi.url) {
                apiName = customApi.name;
                customApiUrlForFetch = customApi.url; 
                fetchUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}&customApi=${encodeURIComponent(customApiUrlForFetch)}`;
            } else {
                console.warn(`Custom API config error for ${apiId}. Skipping.`);
                return Promise.resolve({ code: 400, msg: `自定义API配置错误: ${apiId}`, list: [], apiId: apiId });
            }
        } else {
            apiName = API_SITES[apiId]?.name || apiId;
            fetchUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;
        }

        return fetch(fetchUrl) 
            .then(response => response.json())
            .then(data => ({
                ...data,
                apiId: apiId, 
                apiName: apiName, 
            }))
            .catch(error => {
                console.error(`API(${apiName}) search failed:`, error);
                return {
                    code: 400,
                    msg: `API(${apiName})搜索失败: ${error.message}`,
                    list: [],
                    apiId: apiId
                };
            });
    }).filter(Boolean);

    return Promise.all(searchPromises);
}


function renderSearchResults(results, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults'); 
    const resultsArea = DOMCache.get('resultsArea'); 
    const searchResultsCountElement = DOMCache.get('searchResultsCount'); 

    if (!searchResultsContainer) {
        console.error("Element with ID 'searchResults' not found. Cannot render results.");
        return;
    }
    if (!resultsArea) {
        console.error("Element with ID 'resultsArea' not found. Cannot update results area visibility.");
        // Continue to try and render in searchResultsContainer if it exists
    }
    if (!searchResultsCountElement) {
        console.error("Element with ID 'searchResultsCount' not found. Cannot update results count.");
        // Continue
    }


    let allResults = [];
    let errors = [];
    results.forEach(result => {
        if (result && result.code === 200 && Array.isArray(result.list)) {
            allResults = allResults.concat(result.list);
        } else if (result && result.msg) {
            errors.push(result.msg);
        } else if (result) { // Catch other malformed results
            errors.push(`Received malformed result from API: ${result.apiName || result.apiId || 'Unknown API'}`);
        }
    });

    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }

    searchResultsContainer.innerHTML = ''; 

    if (allResults.length === 0) {
        if (resultsArea) resultsArea.classList.remove('hidden'); 
        if (searchResultsCountElement) searchResultsCountElement.textContent = '0'; 

        let messageTitle = doubanSearchedTitle ? `关于 <strong class="text-pink-400">《${sanitizeText(doubanSearchedTitle)}》</strong> 未找到结果` : '没有找到匹配的结果';
        let messageSuggestion = doubanSearchedTitle ? "请尝试使用其他关键词搜索，或检查您的数据源选择。" : "请尝试其他关键词或更换数据源。";
        let errorBlockHTML = errors.length > 0 ? `<div class="mt-4 text-xs text-red-300">${errors.map(err => sanitizeText(err)).join('<br>')}</div>` : '';

        searchResultsContainer.innerHTML = `
            <div class="col-span-full text-center py-10 sm:py-16">
                <svg class="mx-auto h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="mt-2 text-lg font-medium text-gray-300">${messageTitle}</h3>
                <p class="mt-1 text-sm text-gray-500">${messageSuggestion}</p>
                ${errorBlockHTML}
            </div>`;
        const searchArea = DOMCache.get('searchArea'); // Use DOMCache
        if (searchArea) {
            searchArea.classList.add('flex-1');
            searchArea.classList.remove('mb-8');
        }
        const doubanArea = DOMCache.get('doubanArea'); // Use DOMCache
        if (doubanArea) doubanArea.classList.add('hidden');
        return;
    }

    if (resultsArea) resultsArea.classList.remove('hidden');
    if (searchResultsCountElement) searchResultsCountElement.textContent = allResults.length.toString();

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

    const fragment = document.createDocumentFragment();
    allResults.forEach(item => { 
        try {
            const resultItemElement = createResultItemUsingTemplate(item);
            if (resultItemElement) { // Ensure it's not null/undefined
                 fragment.appendChild(resultItemElement);
            }
        } catch (error) {
            console.error("Error creating result card for item:", item, error);
        }
    });
    gridContainer.appendChild(fragment);
    searchResultsContainer.appendChild(gridContainer);

    if (errors.length > 0) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mt-4 p-3 bg-red-900 bg-opacity-30 rounded text-sm text-red-300 space-y-1';
        errors.forEach(errMsg => {
            const errorLine = document.createElement('p');
            errorLine.textContent = sanitizeText(errMsg);
            errorDiv.appendChild(errorLine);
        });
        searchResultsContainer.appendChild(errorDiv);
    }

    const searchArea = DOMCache.get('searchArea'); // Use DOMCache
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    const doubanArea = DOMCache.get('doubanArea'); // Use DOMCache
    if (doubanArea) doubanArea.classList.add('hidden');

    try {
        const searchInput = DOMCache.get('searchInput');
        const query = searchInput ? searchInput.value.trim() : '';
        if (query && allResults.length > 0) {
            sessionStorage.setItem('searchQuery', query);
            sessionStorage.setItem('searchResults', JSON.stringify(allResults));
            const selectedAPIs = AppState.get('selectedAPIs');
            if (selectedAPIs) {
                sessionStorage.setItem('searchSelectedAPIs', JSON.stringify(selectedAPIs));
            }
        }
    } catch (e) {
        console.error('缓存搜索结果失败:', e);
    }
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
                } catch (e) { console.warn('恢复API选择状态失败:', e); }
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
    const resultsArea = DOMCache.get('resultsArea');
    const searchResultsCountElement = DOMCache.get('searchResultsCount');

    if (!searchResultsContainer) {
        console.error("Element with ID 'searchResults' not found. Cannot render cached results.");
        return;
    }
     if (!resultsArea || !searchResultsCountElement) {
        console.warn("resultsArea or searchResultsCountElement not found, cached results might not display correctly.");
    }


    if(resultsArea) resultsArea.classList.remove('hidden');
    if(searchResultsCountElement) searchResultsCountElement.textContent = cachedResults.length.toString();
    
    searchResultsContainer.innerHTML = '';

    if (cachedResults.length > 0) {
        const gridContainer = document.createElement('div');
        gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
        const fragment = document.createDocumentFragment();
        cachedResults.forEach(item => {
            try {
                const resultItemElement = createResultItemUsingTemplate(item);
                if(resultItemElement) fragment.appendChild(resultItemElement);
            } catch (error) { console.error('渲染缓存结果项失败:', error); }
        });
        gridContainer.appendChild(fragment);
        searchResultsContainer.appendChild(gridContainer);
    }

    const searchArea = DOMCache.get('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    const doubanArea = DOMCache.get('doubanArea');
    if (doubanArea) doubanArea.classList.add('hidden');
}


async function getVideoDetail(id, sourceCode, apiUrl = '') {
    // This function is largely superseded by the modal flow.
    // If it were to be used, ensure it calls playVideo with all necessary parameters, including vodId.
    console.warn("getVideoDetail is likely deprecated in favor of showVideoEpisodesModal flow.");
    // Example of how it might have been:
    // showLoading('获取视频详情...');
    // try {
    //     let detailUrl = `/api/detail?id=${id}&source=${sourceCode}`;
    //     if (sourceCode.startsWith('custom_') && apiUrl) {
    //         detailUrl += `&customApi=${encodeURIComponent(apiUrl)}`;
    //         const customInfo = APISourceManager.getCustomApiInfo(parseInt(sourceCode.replace('custom_','')));
    //         if (customInfo && customInfo.detail) detailUrl += `&useDetail=true`;
    //     } else if (!sourceCode.startsWith('custom_') && API_SITES[sourceCode]?.detail) {
    //        // No need to add useDetail=true, api.js handles it
    //     }
    //     const response = await fetch(detailUrl);
    //     const data = await response.json();
    //     hideLoading();
    //     if (data.code !== 200 || !data.episodes || data.episodes.length === 0) {
    //         throw new Error(data.msg || '获取视频详情失败');
    //     }
    //     AppState.set('currentEpisodes', data.episodes);
    //     AppState.set('currentVideoTitle', data.videoInfo?.title || '未知视频');
    //     AppState.set('currentVideoId', data.videoInfo?.vod_id || id); // Store VOD ID
    //     AppState.set('currentSourceName', data.videoInfo?.source_name || '');
    //     AppState.set('currentSourceCode', sourceCode);
    //     localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
    //     localStorage.setItem('currentVideoTitle', data.videoInfo?.title || '未知视频');
    //     if (typeof addToViewingHistory === 'function') addToViewingHistory(data.videoInfo);
    //     playVideo(data.episodes[0], data.videoInfo?.title, 0, data.videoInfo?.source_name, sourceCode, data.videoInfo?.vod_id || id);
    // } catch (error) {
    //     hideLoading();
    //     showToast('获取视频详情失败: ' + error.message, 'error');
    // }
}


function resetToHome() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    const resultsArea = DOMCache.get('resultsArea');
    const doubanArea = DOMCache.get('doubanArea');
    const searchArea = DOMCache.get('searchArea');

    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';

    if (searchArea) {
        searchArea.classList.add('flex-1');
        searchArea.classList.remove('mb-8', 'hidden');
    }
    if(resultsArea) resultsArea.classList.add('hidden');
    if (doubanArea) {
        const showDouban = getBoolConfig('doubanEnabled', false);
        doubanArea.classList.toggle('hidden', !showDouban);
    }
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
    } catch (e) { console.error('清理搜索缓存失败:', e); }
    
    if (typeof renderSearchHistory === 'function') renderSearchHistory();
}


window.search = search;
// window.getVideoDetail = getVideoDetail; 
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.playPreviousEpisode = playPreviousEpisode;
window.playNextEpisode = playNextEpisode;
window.playFromHistory = playFromHistory; 

/**
 * Creates a search result item element from a template.
 * IMPORTANT: Your main HTML (e.g., index.html) must have a <template id="search-result-template">
 * with the following structure (Tailwind CSS classes are examples):
 * <template id="search-result-template">
 * <div class="card-hover bg-gray-800 rounded-lg overflow-hidden shadow-lg cursor-pointer">
 * <img class="result-img w-full h-48 object-cover" src="" alt="">
 * <div class="p-3">
 * <h3 class="result-title text-sm font-semibold text-white truncate"></h3>
 * <p class="result-remarks text-xs text-gray-400 truncate"></p>
 * <div class="mt-1 flex items-center justify-between text-xs text-gray-500">
 * <span class="result-type"></span>
 * <span class="result-year"></span>
 * </div>
 * <div class="mt-2">
 * <span class="result-source-name bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-xs"></span>
 * </div>
 * </div>
 * </div>
 * </template>
 */
function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) {
        console.error("搜索结果模板 #search-result-template 未找到！请检查HTML。");
        // Fallback to creating a simple text display if template is missing
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'p-2 border-b border-gray-700 text-sm text-gray-300';
        fallbackDiv.textContent = `${item.vod_name || '未知标题'} (${item.source_name || '未知来源'})`;
        fallbackDiv.dataset.id = item.vod_id || '';
        fallbackDiv.dataset.name = item.vod_name || '';
        fallbackDiv.dataset.sourceCode = item.source_code || '';
        if (item.api_url) fallbackDiv.dataset.apiUrl = item.api_url;
        fallbackDiv.onclick = handleResultClick; // Still make it clickable
        return fallbackDiv;
    }

    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');
    
    if (!cardElement) {
        console.error("卡片元素 (.card-hover) 在模板克隆中未找到，项目:", item);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'card-hover bg-red-900 text-white rounded-lg overflow-hidden p-2';
        errorDiv.innerHTML = `<h3>加载卡片错误</h3><p class="text-xs">无法显示此项目: ${sanitizeText(item.vod_name || '')}</p>`;
        return errorDiv;
    }

    const imgElement = clone.querySelector('.result-img');
    if (imgElement) {
        imgElement.src = item.vod_pic && item.vod_pic.startsWith('http') ?
            item.vod_pic : 'https://via.placeholder.com/100x150/191919/555555?text=No+Image';
        imgElement.alt = item.vod_name || '未知标题';
        imgElement.onerror = function () {
            this.onerror = null;
            this.src = 'https://via.placeholder.com/100x150/191919/555555?text=Error';
            this.classList.add('object-contain'); 
        };
    } else { console.warn("'.result-img' not found in template clone for item:", item.vod_name); }

    const titleElement = clone.querySelector('.result-title');
    if (titleElement) {
        titleElement.textContent = item.vod_name || '未知标题';
        titleElement.title = item.vod_name || '未知标题'; 
    } else { console.warn("'.result-title' not found in template clone for item:", item.vod_name); }

    const typeElement = clone.querySelector('.result-type');
    if (typeElement) {
        if (item.type_name) {
            typeElement.textContent = item.type_name;
            typeElement.classList.remove('hidden');
        } else {
            typeElement.classList.add('hidden');
        }
    } else { /* console.warn("'.result-type' not found in template clone"); */ }
    
    const yearElement = clone.querySelector('.result-year');
    if (yearElement) {
        if (item.vod_year) {
            yearElement.textContent = item.vod_year;
            yearElement.classList.remove('hidden');
        } else {
            yearElement.classList.add('hidden');
        }
    } else { /* console.warn("'.result-year' not found in template clone"); */ }

    const remarksElement = clone.querySelector('.result-remarks');
    if (remarksElement) {
        if (item.vod_remarks) {
            remarksElement.textContent = item.vod_remarks;
            remarksElement.classList.remove('hidden');
        } else {
            remarksElement.classList.add('hidden');
        }
    } else { /* console.warn("'.result-remarks' not found in template clone"); */ }
    
    const sourceNameElement = clone.querySelector('.result-source-name');
    if (sourceNameElement) {
        if (item.source_name) {
            sourceNameElement.textContent = item.source_name;
            // Ensure class is set correctly, example:
            sourceNameElement.className = 'result-source-name bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-xs';
            sourceNameElement.classList.remove('hidden');
        } else {
            sourceNameElement.classList.add('hidden');
        }
    } else { /* console.warn("'.result-source-name' not found in template clone"); */ }

    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || ''; 
    if (item.api_url) { 
        cardElement.dataset.apiUrl = item.api_url;
    }
    cardElement.onclick = handleResultClick;

    return clone;
}

function handleResultClick(event) {
    const card = event.currentTarget;
    const id = card.dataset.id; 
    const name = card.dataset.name;
    const sourceCode = card.dataset.sourceCode; 
    const apiUrl = card.dataset.apiUrl || ''; 

    if (typeof showVideoEpisodesModal === 'function') {
        showVideoEpisodesModal(id, name, sourceCode, apiUrl);
    } else {
        console.error('showVideoEpisodesModal function not found!');
        if(typeof showToast === 'function') showToast('无法加载剧集信息', 'error');
    }
}
window.handleResultClick = handleResultClick;


async function showVideoEpisodesModal(id, title, sourceCode, customApiUrl = '') {
    if(typeof showLoading === 'function') showLoading('加载剧集信息...');
    AppState.set('currentVideoId', id); 

    const selectedApi = APISourceManager.getSelectedApi(sourceCode);
    if (!selectedApi) {
        if(typeof hideLoading === 'function') hideLoading();
        if(typeof showToast === 'function') showToast('未找到有效的数据源信息', 'error');
        console.error('Selected API metadata is null for sourceCode:', sourceCode);
        return;
    }

    let detailFetchUrl = `/api/detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(sourceCode)}`;
    if (selectedApi.isCustom) {
        detailFetchUrl += `&customApi=${encodeURIComponent(selectedApi.url)}`; 
        const customInfo = APISourceManager.getCustomApiInfo(parseInt(sourceCode.replace('custom_','')));
        if (customInfo && customInfo.detail) { 
            detailFetchUrl += `&useDetail=true`;
        }
    }
    // For built-in APIs with a .detail field, api.js's handleApiRequest will manage scraping.

    try {
        const response = await fetch(detailFetchUrl); 
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if(typeof hideLoading === 'function') hideLoading();

        if (data.code !== 200 || !data.episodes || data.episodes.length === 0) {
            let errorMessage = data.msg || (data.videoInfo && data.videoInfo.msg) || '未找到剧集信息';
            if(typeof showToast === 'function') showToast(errorMessage, 'warning');
            console.warn('获取剧集详情数据问题:', data, `Requested URL: ${detailFetchUrl}`);
            return;
        }

        AppState.set('currentEpisodes', data.episodes);
        AppState.set('currentVideoTitle', title);
        AppState.set('currentSourceName', selectedApi.name);
        AppState.set('currentSourceCode', sourceCode);
        
        localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
        localStorage.setItem('currentVideoTitle', title);

        const episodeButtonsHtml = renderEpisodeButtons(data.episodes, title, sourceCode, selectedApi.name);
        if(typeof showModal === 'function') showModal(episodeButtonsHtml, `${title} (${selectedApi.name})`);

    } catch (error) {
        if(typeof hideLoading === 'function') hideLoading();
        console.error('获取剧集信息失败 (catch block):', error, `Original fetch URL for modal: ${detailFetchUrl}`);
        if(typeof showToast === 'function') showToast(`获取剧集信息失败: ${error.message}`, 'error');
    }
}


function renderEpisodeButtons(episodes, videoTitle, sourceCode, sourceName) {
    if (!episodes || episodes.length === 0) return '<p class="text-center text-gray-500">暂无剧集信息</p>';
    const currentReversedState = AppState.get('episodesReversed') || false;
    const vodId = AppState.get('currentVideoId') || ''; 

    let html = `
    <div class="mb-4 flex justify-end items-center space-x-2">
        <div class="text-sm text-gray-400 mr-auto">共 ${episodes.length} 集</div>
        <button onclick="copyLinks()"
                title="复制所有剧集链接"
                class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
        </button>
        <button id="toggleEpisodeOrderBtn" onclick="toggleEpisodeOrderUI()" 
                title="${currentReversedState ? '切换为正序排列' : '切换为倒序排列'}"
                class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center">
            <svg id="orderIcon" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="transition: transform 0.3s ease;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
        </button>
    </div>
    <div id="episodeButtonsContainer" class="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">`;

    const displayEpisodes = currentReversedState ? [...episodes].reverse() : [...episodes];

    displayEpisodes.forEach((episodeUrl, displayIndex) => {
        const originalIndex = currentReversedState ? (episodes.length - 1 - displayIndex) : displayIndex;
        const safeVideoTitle = encodeURIComponent(videoTitle);
        const safeSourceName = encodeURIComponent(sourceName);
        html += `
        <button 
            onclick="playVideo('${episodeUrl}', decodeURIComponent('${safeVideoTitle}'), ${originalIndex}, decodeURIComponent('${safeSourceName}'), '${sourceCode}', '${vodId}')" 
            class="episode-btn px-2 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs sm:text-sm transition-colors truncate"
            data-index="${originalIndex}"
            title="第 ${originalIndex + 1} 集" 
        >
            第 ${originalIndex + 1} 集      
        </button>`;
    });
    html += '</div>';

    requestAnimationFrame(() => {
        const orderIcon = document.getElementById('orderIcon');
        if (orderIcon) {
            orderIcon.style.transform = currentReversedState ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        const toggleBtn = document.getElementById('toggleEpisodeOrderBtn');
        if (toggleBtn) {
            toggleBtn.title = currentReversedState ? '切换为正序排列' : '切换为倒序排列';
        }
    });
    return html;
}
window.copyLinks = function() { 
    const reversed = AppState.get('episodesReversed') || false;
    const episodesToCopy = AppState.get('currentEpisodes');

    if (!episodesToCopy || episodesToCopy.length === 0) {
        if(typeof showToast === 'function') showToast('没有可复制的链接', 'warning');
        return;
    }
    const actualEpisodes = reversed ? [...episodesToCopy].reverse() : [...episodesToCopy];
    const linkList = actualEpisodes.join('\r\n');
    navigator.clipboard.writeText(linkList).then(() => {
        if(typeof showToast === 'function') showToast('所有剧集链接已复制', 'success');
    }).catch(err => {
        console.error('复制链接失败:', err);
        if(typeof showToast === 'function') showToast('复制失败，请检查浏览器权限', 'error');
    });
};

window.toggleEpisodeOrderUI = function() { 
    const container = document.getElementById('episodeButtonsContainer');
    const orderIcon = document.getElementById('orderIcon');
    const toggleBtn = document.getElementById('toggleEpisodeOrderBtn');

    if (!container || !orderIcon || !toggleBtn) return;

    let currentReversedState = AppState.get('episodesReversed') || false;
    currentReversedState = !currentReversedState;
    AppState.set('episodesReversed', currentReversedState);

    orderIcon.style.transform = currentReversedState ? 'rotate(180deg)' : 'rotate(0deg)';
    toggleBtn.title = currentReversedState ? '切换为正序排列' : '切换为倒序排列';

    const episodes = AppState.get('currentEpisodes');
    const title = AppState.get('currentVideoTitle');
    const sourceName = AppState.get('currentSourceName');
    const sourceCode = AppState.get('currentSourceCode');

    if (episodes && title && sourceCode) {
        const newButtonsHtml = renderEpisodeButtons(episodes, title, sourceCode, sourceName || '');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newButtonsHtml;
        const buttonsContainerFromRender = tempDiv.querySelector('#episodeButtonsContainer');
        if (buttonsContainerFromRender) {
            container.innerHTML = buttonsContainerFromRender.innerHTML;
        } else {
             console.error("Could not find #episodeButtonsContainer in rendered HTML for reordering.");
        }
    } else {
        console.error("Cannot re-render episode buttons: Missing state information (episodes, title, or sourceCode).");
    }
};

window.showVideoEpisodesModal = showVideoEpisodesModal;
