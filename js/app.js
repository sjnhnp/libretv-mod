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
    initializeDOMCache();
    APISourceManager.init();
    initializeEventListeners();
    renderSearchHistory(); // From ui.js
    restoreSearchFromCache(); // Restore search if applicable
});


function initializeAppState() {
    AppState.initialize({
        'selectedAPIs': JSON.parse(localStorage.getItem('selectedAPIs') || '["bfzy", "heimuer", "tyyszy", "dbzy"]'),
        'customAPIs': JSON.parse(localStorage.getItem('customAPIs') || '[]'),
        'currentEpisodeIndex': 0,
        'currentEpisodes': [],
        'currentVideoTitle': '',
        'currentVideoId': '', // Added for VOD ID
        'currentSourceName': '',
        'currentSourceCode': '',
        'episodesReversed': false
    });
}


function initializeDOMCache() {
    DOMCache.init({
        'searchInput': 'searchInput',
        'searchResults': 'searchResults',
        'searchForm': 'searchForm',
        'searchHistoryContainer': 'searchHistory', // Used by ui.js renderSearchHistory
        'apiCheckboxes': 'apiCheckboxes',
        'customApisList': 'customApisList',
        'selectedApiCount': 'selectedApiCount',
        'addCustomApiForm': 'addCustomApiForm',
        'customApiName': 'customApiName',
        'customApiUrl': 'customApiUrl',
        'customApiIsAdult': 'customApiIsAdult',
        'yellowFilterToggle': 'yellowFilterToggle',
        'adFilteringToggle': 'adFilterToggle', // Ensure ID matches HTML
        'preloadingToggle': 'preloadingToggle',
        'preloadCountInput': 'preloadCountInput',
        'resultsArea': 'resultsArea',
        'searchResultsCount': 'searchResultsCount',
        'doubanArea': 'doubanArea',
        'searchArea': 'searchArea'
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
            showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, false);
    }

    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
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
            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');
        });
        
        preloadCountInput.addEventListener('change', function (e) {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) count = 1;
            else if (count > 10) count = 10;
            e.target.value = count.toString();
            localStorage.setItem('preloadCount', count.toString());
            PLAYER_CONFIG.preloadCount = count;
            showToast(`预加载数量已设置为 ${count}`, 'info');
        });
        initPreloading();
    }
}


function search(options = {}) {
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

    if (!options.doubanQuery) { // Only save to history if it's not a Douban-triggered search
        if (typeof saveSearchHistory === 'function') saveSearchHistory(query);
    }
    
    // Clear previous search cache before new search
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
    } catch(e) { console.warn("Failed to clear previous search cache", e); }


    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        if (searchResultsContainer) searchResultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">请至少选择一个API源</div>';
        if (isNormalSearch && typeof hideLoading === 'function') hideLoading();
        if (typeof options.onComplete === 'function') options.onComplete();
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


async function performSearch(query, selectedAPIs) {
    const searchPromises = selectedAPIs.map(apiId => {
        let fetchUrl;
        let apiName;
        let customApiUrlForFetch = ''; // Specifically for custom APIs to pass to /api/search

        if (apiId.startsWith('custom_')) {
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi && customApi.url) {
                apiName = customApi.name;
                customApiUrlForFetch = customApi.url; // This is the base URL of the custom API
                // The source parameter will be 'custom_X', and customApi will be the actual URL
                fetchUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}&customApi=${encodeURIComponent(customApiUrlForFetch)}`;
            } else {
                return Promise.resolve({ code: 400, msg: `自定义API配置错误: ${apiId}`, list: [], apiId: apiId });
            }
        } else {
            apiName = API_SITES[apiId]?.name || apiId;
            // For built-in APIs, only source is needed; customApi param is not used by handleApiRequest for built-in
            fetchUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;
        }

        return fetch(fetchUrl) // This fetch is intercepted by api.js
            .then(response => response.json())
            .then(data => ({
                ...data,
                apiId: apiId, // Keep original apiId (e.g., 'custom_0' or 'heimuer')
                apiName: apiName, // Display name
                // api_url is added by handleApiRequest if it's a custom API
            }))
            .catch(error => ({
                code: 400,
                msg: `API(${apiName})搜索失败: ${error.message}`,
                list: [],
                apiId: apiId
            }));
    }).filter(Boolean);

    return Promise.all(searchPromises);
}


function renderSearchResults(results, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults'); 
    const resultsArea = getElement('resultsArea'); 
    const searchResultsCountElement = getElement('searchResultsCount'); 

    if (!searchResultsContainer || !resultsArea || !searchResultsCountElement) return;

    let allResults = [];
    let errors = [];
    results.forEach(result => {
        if (result.code === 200 && Array.isArray(result.list)) {
            // source_name and api_url should already be set by handleApiRequest (from api.js)
            allResults = allResults.concat(result.list);
        } else if (result.msg) {
            errors.push(result.msg);
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
        resultsArea.classList.remove('hidden'); 
        searchResultsCountElement.textContent = '0'; 

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
        const searchArea = getElement('searchArea');
        if (searchArea) {
            searchArea.classList.add('flex-1');
            searchArea.classList.remove('mb-8');
        }
        getElement('doubanArea')?.classList.add('hidden');
        return;
    }

    resultsArea.classList.remove('hidden');
    searchResultsCountElement.textContent = allResults.length.toString();

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

    const fragment = document.createDocumentFragment();
    allResults.forEach(item => { 
        try {
            fragment.appendChild(createResultItemUsingTemplate(item));
        } catch (error) {
            console.error("Error creating result card:", item, error);
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

    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8');
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden');

    // Cache search results to sessionStorage
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
                    // Optionally, re-render API checkboxes if their state is not automatically updated
                    if (typeof APISourceManager !== 'undefined' && typeof APISourceManager.initAPICheckboxes === 'function') {
                       // APISourceManager.initAPICheckboxes(); // This might be too much, depends on how checkboxes are managed
                    }
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
            } catch (error) { console.error('渲染缓存结果项失败:', error); }
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

/**
 * This function is not directly called anymore as per the new flow.
 * Details are fetched in showVideoEpisodesModal.
 * Kept for reference or if a different flow is introduced.
 */
async function getVideoDetail(id, sourceCode, apiUrl = '') {
    // ... (original getVideoDetail logic, now largely superseded by showVideoEpisodesModal)
    // This function would typically lead to playVideo.
    // The main change needed if this were used is to ensure vod_id is passed to playVideo.
    console.warn("getVideoDetail is likely deprecated in favor of showVideoEpisodesModal flow.");
}


function resetToHome() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    const resultsArea = getElement('resultsArea');
    const doubanArea = getElement('doubanArea');
    const searchArea = getElement('searchArea');

    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';

    if (searchArea) {
        searchArea.classList.add('flex-1');
        searchArea.classList.remove('mb-8', 'hidden');
    }
    resultsArea?.classList.add('hidden');
    if (doubanArea) {
        const showDouban = getBoolConfig('doubanEnabled', false);
        doubanArea.classList.toggle('hidden', !showDouban);
    }
    // Clear search cache on reset
    try {
        sessionStorage.removeItem('searchQuery');
        sessionStorage.removeItem('searchResults');
        sessionStorage.removeItem('searchSelectedAPIs');
    } catch (e) { console.error('清理搜索缓存失败:', e); }
    
    if (typeof renderSearchHistory === 'function') renderSearchHistory();
}


window.search = search;
// window.getVideoDetail = getVideoDetail; // Potentially deprecated
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.playPreviousEpisode = playPreviousEpisode;
window.playNextEpisode = playNextEpisode;
// window.showDetails = showDetails; // Stub, might not be used
window.playFromHistory = playFromHistory; // Ensure this is globally available for ui.js

function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) {
        console.error("搜索结果模板未找到！");
        return document.createDocumentFragment(); // Return empty fragment
    }

    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');
    
    if (!cardElement) {
        console.error("卡片元素 (.card-hover) 在模板克隆中未找到，项目:", item);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'card-hover bg-[#222] rounded-lg overflow-hidden p-2 text-red-400';
        errorDiv.innerHTML = `<h3>加载错误</h3><p class="text-xs">无法显示此项目</p>`;
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
            this.classList.add('object-contain'); // Ensure error image is contained
        };
    }

    const titleElement = clone.querySelector('.result-title');
    if (titleElement) {
        titleElement.textContent = item.vod_name || '未知标题';
        titleElement.title = item.vod_name || '未知标题'; // Tooltip for long titles
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
            sourceNameElement.className = 'result-source-name bg-[#222222] text-xs text-gray-200 px-2 py-1 rounded-md';
        } else {
            sourceNameElement.className = 'result-source-name hidden';
        }
    }

    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || ''; // e.g. 'heimuer' or 'custom_0'
    // api_url is the base URL for the API, useful for custom APIs.
    // It's added by performSearch (if custom) or handleApiRequest (if custom).
    if (item.api_url) { 
        cardElement.dataset.apiUrl = item.api_url;
    }
    cardElement.onclick = handleResultClick;

    return clone;
}

function handleResultClick(event) {
    const card = event.currentTarget;
    const id = card.dataset.id; // This is vod_id
    const name = card.dataset.name;
    const sourceCode = card.dataset.sourceCode; // e.g. 'heimuer' or 'custom_0'
    const apiUrl = card.dataset.apiUrl || ''; // Base URL for custom API, or empty for built-in

    if (typeof showVideoEpisodesModal === 'function') {
        // Pass vod_id (as id), name, sourceCode, and apiUrl (if custom)
        showVideoEpisodesModal(id, name, sourceCode, apiUrl);
    } else {
        console.error('showVideoEpisodesModal function not found!');
        showToast('无法加载剧集信息', 'error');
    }
}
window.handleResultClick = handleResultClick;


async function showVideoEpisodesModal(id, title, sourceCode, customApiUrl = '') {
    showLoading('加载剧集信息...');
    AppState.set('currentVideoId', id); // Store VOD ID

    const selectedApi = APISourceManager.getSelectedApi(sourceCode);
    if (!selectedApi) {
        hideLoading();
        showToast('未找到有效的数据源信息', 'error');
        console.error('Selected API metadata is null for sourceCode:', sourceCode);
        return;
    }

    // Construct the detail API URL
    // The `source` param in /api/detail will be like 'heimuer' or 'custom_0'
    // The `customApi` param will be the base URL if it's a custom API.
    // The `useDetail` param signals if HTML scraping is preferred for this custom source.
    let detailFetchUrl = `/api/detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(sourceCode)}`;
    if (selectedApi.isCustom) {
        detailFetchUrl += `&customApi=${encodeURIComponent(selectedApi.url)}`; // selectedApi.url is the base search/JSON detail URL
        // Check if this custom API has a specific .detail property for HTML scraping
        const customInfo = APISourceManager.getCustomApiInfo(parseInt(sourceCode.replace('custom_','')));
        if (customInfo && customInfo.detail) { // If custom API has a 'detail' field for scraping
            detailFetchUrl += `&useDetail=true`;
        }
    } else if (API_SITES[sourceCode] && API_SITES[sourceCode].detail) {
        // For built-in APIs that have a .detail field, api.js handleApiRequest will use it for scraping
        // No need to add useDetail=true here, handleApiRequest checks API_SITES[sourceCode].detail
    }


    try {
        const response = await fetch(detailFetchUrl); // This fetch is intercepted by api.js
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        hideLoading();

        if (data.code !== 200 || !data.episodes || data.episodes.length === 0) {
            let errorMessage = data.msg || (data.videoInfo && data.videoInfo.msg) || '未找到剧集信息';
            showToast(errorMessage, 'warning');
            console.warn('获取剧集详情数据问题:', data, `Requested URL: ${detailFetchUrl}`);
            return;
        }

        AppState.set('currentEpisodes', data.episodes);
        AppState.set('currentVideoTitle', title);
        AppState.set('currentSourceName', selectedApi.name);
        AppState.set('currentSourceCode', sourceCode);
        // currentVideoId is already set from card's data-id

        localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
        localStorage.setItem('currentVideoTitle', title);

        const episodeButtonsHtml = renderEpisodeButtons(data.episodes, title, sourceCode, selectedApi.name);
        showModal(episodeButtonsHtml, `${title} (${selectedApi.name})`);

    } catch (error) {
        hideLoading();
        console.error('获取剧集信息失败 (catch block):', error, `Original fetch URL for modal: ${detailFetchUrl}`);
        showToast(`获取剧集信息失败: ${error.message}`, 'error');
    }
}


function renderEpisodeButtons(episodes, videoTitle, sourceCode, sourceName) {
    if (!episodes || episodes.length === 0) return '<p class="text-center text-gray-500">暂无剧集信息</p>';
    const currentReversedState = AppState.get('episodesReversed') || false;
    const vodId = AppState.get('currentVideoId') || ''; // Get VOD ID from AppState

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
        // Pass vodId to playVideo
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
window.copyLinks = function() { // Ensure it's global if called from HTML string
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
};

window.toggleEpisodeOrderUI = function() { // Ensure it's global
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
        }
    }
};

window.showVideoEpisodesModal = showVideoEpisodesModal;
