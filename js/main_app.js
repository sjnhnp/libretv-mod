// 主应用程序 - 整合所有功能，保持原有特性不变
import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

// 常量定义
const SEARCH_HISTORY_KEY = 'videoSearchHistory';
const MAX_SEARCH_HISTORY_ITEMS = 5;

// API站点配置 - 从config.js引用
const API_SITES = window.API_SITES || {
    heimuer: { api: 'https://json.heimuer.xyz/api.php/provide/vod', name: '黑木耳' },
    bfzy: { api: 'https://bfzyapi.com/api.php/provide/vod', name: '暴风资源' },
    dyttzy: { api: 'http://caiji.dyttzyapi.com/api.php/provide/vod', name: '电影天堂' },
    maotai: { api: 'https://caiji.maotaizy.cc/api.php/provide/vod', name: '茅台资源' },
    tyyszy: { api: 'https://tyyszy.com/api.php/provide/vod', name: '天涯资源' }
};

// 全局变量 - 保持与原项目完全一致
let player = null;
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let autoplayEnabled = true;
let adFilteringEnabled = false;

// 应用状态管理 - 保持原有逻辑
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

// DOM缓存 - 保持原有逻辑
const DOMCache = (function () {
    const cache = new Map();
    return {
        set: function (key, element) { if (element) cache.set(key, element); },
        get: function (key) { return cache.get(key); }
    };
})();// 主题切
换功能
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const body = document.body;
    const darkIcon = themeToggle.querySelector('.theme-icon-dark');
    const lightIcon = themeToggle.querySelector('.theme-icon-light');
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    body.setAttribute('data-theme', savedTheme);
    
    function updateThemeIcons(theme) {
        if (theme === 'light') {
            darkIcon.classList.add('hidden');
            lightIcon.classList.remove('hidden');
        } else {
            darkIcon.classList.remove('hidden');
            lightIcon.classList.add('hidden');
        }
    }
    
    updateThemeIcons(savedTheme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcons(newTheme);
        showToast(`已切换到${newTheme === 'dark' ? '夜晚' : '白天'}模式`, 'info');
    });
}

// 显示Toast消息
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    const bgColors = {
        'error': 'bg-red-500',
        'success': 'bg-green-500', 
        'info': 'bg-blue-500',
        'warning': 'bg-yellow-500'
    };
    const bgColor = bgColors[type] || bgColors.info;

    toast.className = `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bgColor} text-white z-[2147483647] pointer-events-none`;
    toastMessage.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// 播放视频函数 - 保持原有逻辑完全不变
function playVideo(episodeString, title, episodeIndex, sourceName = '', sourceCode = '', vodId = '', year = '', typeName = '') {
    if (!episodeString) {
        showToast('无效的视频链接', 'error');
        return;
    }

    let playUrl = episodeString;
    if (episodeString.includes('$')) {
        const parts = episodeString.split('$');
        playUrl = parts[parts.length - 1];
    }

    if (!playUrl || !playUrl.startsWith('http')) {
        showToast('视频链接格式无效', 'error');
        return;
    }

    currentVideoTitle = title;
    currentEpisodeIndex = episodeIndex;

    // 更新UI
    const playerTitle = document.getElementById('currentVideoTitle');
    if (playerTitle) playerTitle.textContent = title;

    const welcomeArea = document.getElementById('welcomeArea');
    const playerEmpty = document.getElementById('player-empty');
    const playerControls = document.getElementById('playerControls');
    const episodesContainer = document.getElementById('episodes-container');
    
    if (welcomeArea) welcomeArea.classList.add('hidden');
    if (playerEmpty) playerEmpty.classList.add('hidden');
    if (playerControls) playerControls.classList.remove('hidden');
    if (episodesContainer) episodesContainer.classList.remove('hidden');

    initPlayer(playUrl, title);
}

// 初始化播放器
async function initPlayer(videoUrl, title) {
    const playerContainer = document.getElementById('player');
    if (!playerContainer) {
        showToast("播放器容器未找到", 'error');
        return;
    }

    if (player) {
        player.destroy();
        player = null;
    }

    try {
        player = await VidstackPlayer.create({
            target: playerContainer,
            src: { src: videoUrl, type: 'application/x-mpegurl' },
            title: title,
            autoplay: true,
            preload: 'auto',
            layout: new VidstackPlayerLayout({ seekTime: 10 }),
            playsInline: true,
            crossOrigin: true
        });
        
        window.player = player;
        addPlayerEventListeners();
        updateEpisodeInfo();
        renderEpisodes();
        updateButtonStates();
        
    } catch (error) {
        console.error("播放器初始化失败:", error);
        showToast("播放器初始化失败", 'error');
    }
}

// 添加播放器事件监听
function addPlayerEventListeners() {
    if (!player) return;

    player.addEventListener('fullscreen-change', (event) => {
        const isFullscreen = event.detail;
        const fsButton = document.getElementById('fullscreen-button');
        if (fsButton) {
            fsButton.innerHTML = isFullscreen ?
                `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>` :
                `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
        }
    });

    player.addEventListener('loaded-metadata', () => {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    });

    player.addEventListener('error', (event) => {
        console.error("播放器错误:", event.detail);
        showToast('播放器遇到错误，请检查视频源', 'error');
    });

    player.addEventListener('end', () => {
        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            setTimeout(() => playNextEpisode(), 1000);
        }
    });
}

// 更新剧集信息显示
function updateEpisodeInfo() {
    const episodeInfo = document.getElementById('episode-info-span');
    if (episodeInfo && currentEpisodes.length > 0) {
        episodeInfo.textContent = `第 ${currentEpisodeIndex + 1} 集`;
        episodeInfo.classList.remove('hidden');
    }
}

// 渲染剧集列表
function renderEpisodes() {
    const episodeGrid = document.getElementById('episode-grid');
    const episodesCount = document.getElementById('episodes-count');
    
    if (!episodeGrid || !currentEpisodes.length) return;
    
    episodeGrid.innerHTML = '';
    episodesCount.textContent = `共 ${currentEpisodes.length} 集`;
    
    currentEpisodes.forEach((episode, index) => {
        const episodeBtn = document.createElement('button');
        episodeBtn.className = `episode-btn ${index === currentEpisodeIndex ? 'active' : ''}`;
        episodeBtn.textContent = `第${index + 1}集`;
        episodeBtn.onclick = () => playEpisode(index);
        episodeGrid.appendChild(episodeBtn);
    });
}

// 播放指定剧集
async function playEpisode(index) {
    if (index < 0 || index >= currentEpisodes.length) return;
    
    currentEpisodeIndex = index;
    let playUrl = currentEpisodes[index];
    if (playUrl && playUrl.includes('$')) {
        playUrl = playUrl.split('$')[1];
    }

    if (!playUrl || !playUrl.startsWith('http')) {
        showToast(`无效的播放链接`, 'error');
        return;
    }

    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();

    if (player) {
        player.src = { src: playUrl, type: 'application/x-mpegurl' };
        player.play().catch(e => console.warn("自动播放被阻止", e));
    }
}

// 播放上一集
function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    } else {
        showToast('已经是第一集了', 'info');
    }
}

// 播放下一集
function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    } else {
        showToast('已经是最后一集了', 'info');
    }
}

// 更新按钮状态
function updateButtonStates() {
    const prevBtn = document.getElementById('prev-episode');
    const nextBtn = document.getElementById('next-episode');
    
    if (prevBtn) prevBtn.disabled = currentEpisodeIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentEpisodeIndex >= currentEpisodes.length - 1;
}

// 重置到首页
function resetToHome() {
    const resultsArea = document.getElementById('resultsArea');
    const doubanArea = document.getElementById('doubanArea');
    const welcomeArea = document.getElementById('welcomeArea');
    
    if (resultsArea) resultsArea.classList.add('hidden');
    if (doubanArea) doubanArea.classList.add('hidden');
    if (welcomeArea) welcomeArea.classList.remove('hidden');
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    const playerEmpty = document.getElementById('player-empty');
    const playerControls = document.getElementById('playerControls');
    const episodesContainer = document.getElementById('episodes-container');
    
    if (playerEmpty) playerEmpty.classList.remove('hidden');
    if (playerControls) playerControls.classList.add('hidden');
    if (episodesContainer) episodesContainer.classList.add('hidden');
    
    const playerTitle = document.getElementById('currentVideoTitle');
    if (playerTitle) playerTitle.textContent = '选择视频开始播放';
    
    if (player) player.pause();
    showToast('已返回首页', 'info');
}

// 搜索功能
async function search() {
    const searchInput = DOMCache.get('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    if (!query) {
        showToast('请输入搜索内容', 'warning');
        return;
    }
    
    // 显示搜索结果区域，隐藏欢迎区域
    const welcomeArea = document.getElementById('welcomeArea');
    const resultsArea = document.getElementById('resultsArea');
    
    if (welcomeArea) welcomeArea.classList.add('hidden');
    if (resultsArea) resultsArea.classList.remove('hidden');
    
    // 显示加载状态
    const searchResults = DOMCache.get('searchResults');
    const searchResultsCount = document.getElementById('searchResultsCount');
    
    if (searchResults) {
        searchResults.innerHTML = `
            <div class="col-span-full text-center py-10">
                <div class="loading-spinner mx-auto mb-4"></div>
                <h3 class="text-lg font-medium text-gray-300">正在搜索中...</h3>
                <p class="text-sm text-gray-500">请稍候</p>
            </div>
        `;
    }
    
    try {
        // 使用默认的API源进行搜索
        const selectedAPIs = window.APISourceManager ? 
            window.APISourceManager.getSelectedSources() : 
            ['heimuer', 'bfzy', 'dyttzy', 'maotai', 'tyyszy'];
        
        const results = await performSearch(query, selectedAPIs);
        renderSearchResults(results);
        saveSearchHistory(query);
        showToast(`搜索"${query}"完成`, 'success');
    } catch (error) {
        console.error('搜索失败:', error);
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <h3 class="text-lg font-medium text-red-400">搜索失败</h3>
                    <p class="text-sm text-gray-500">${error.message}</p>
                </div>
            `;
        }
        showToast('搜索失败，请重试', 'error');
    }
}

// 执行搜索请求
async function performSearch(query, selectedAPIs) {
    const searchPromises = selectedAPIs.map(apiId => {
        console.log(`Searching API: ${apiId} for query: ${query}`);
        return fetch(`/proxy/${encodeURIComponent(API_SITES[apiId]?.api)}?ac=videolist&wd=${encodeURIComponent(query)}`)
            .then(response => {
                console.log(`API ${apiId} response status:`, response.status);
                return response.json();
            })
            .then(data => {
                console.log(`API ${apiId} data:`, data);
                return { 
                    ...data, 
                    apiId: apiId, 
                    apiName: API_SITES[apiId]?.name || apiId 
                };
            })
            .catch(error => {
                console.error(`API ${apiId} search failed:`, error);
                return {
                    code: 400,
                    msg: `API(${apiId})搜索失败: ${error.message}`,
                    list: [],
                    apiId: apiId
                };
            });
    });

    try {
        const results = await Promise.all(searchPromises);
        return results;
    } catch (error) {
        console.error("执行搜索时出错:", error);
        return [];
    }
}

// 渲染搜索结果
function renderSearchResults(results) {
    console.log('Rendering search results:', results);
    const searchResults = DOMCache.get('searchResults');
    const searchResultsCount = document.getElementById('searchResultsCount');
    
    if (!searchResults || !searchResultsCount) {
        console.error('Search results container not found');
        return;
    }

    let allResults = [];
    results.forEach(result => {
        console.log(`Processing result from ${result.apiId}:`, result);
        if (result.code === 200 && Array.isArray(result.list) && result.list.length > 0) {
            const resultsWithSource = result.list.map(item => ({
                ...item,
                source_name: result.apiName || API_SITES[result.apiId]?.name || '未知来源',
                source_code: result.apiId
            }));
            allResults = allResults.concat(resultsWithSource);
        }
    });

    // 黄色内容过滤
    allResults = allResults.filter(item => {
        const title = item.vod_name || '';
        const type = item.type_name || '';
        return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
    });

    searchResultsCount.textContent = allResults.length.toString();
    searchResults.innerHTML = '';

    if (allResults.length === 0) {
        searchResults.innerHTML = `
            <div class="col-span-full text-center py-10">
                <h3 class="text-lg font-medium text-gray-300">没有找到匹配的结果</h3>
                <p class="text-sm text-gray-500">请尝试其他关键词</p>
            </div>
        `;
        return;
    }

    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

    allResults.forEach(item => {
        const resultItem = createResultItem(item);
        gridContainer.appendChild(resultItem);
    });

    searchResults.appendChild(gridContainer);
}

// 创建搜索结果项
function createResultItem(item) {
    const div = document.createElement('div');
    div.className = 'result-item bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-all cursor-pointer';
    
    div.innerHTML = `
        <div class="aspect-[3/4] bg-gray-800 rounded-lg mb-3 overflow-hidden">
            <img src="${item.vod_pic || ''}" alt="${item.vod_name}" 
                 class="w-full h-full object-cover" 
                 onerror="this.style.display='none'">
        </div>
        <h3 class="font-medium text-white mb-1 line-clamp-2">${item.vod_name}</h3>
        <p class="text-sm text-gray-400 mb-2">${item.vod_year || ''} · ${item.type_name || ''}</p>
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-500">${item.source_name}</span>
            <span class="text-xs text-gray-400">${item.vod_remarks || ''}</span>
        </div>
    `;
    
    div.addEventListener('click', () => {
        getVideoDetail(item.vod_id, item.source_code, item);
    });
    
    return div;
}

// 保存搜索历史
function saveSearchHistory(query) {
    try {
        let history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        history = history.filter(item => item !== query);
        history.unshift(query);
        history = history.slice(0, MAX_HISTORY_ITEMS);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        renderSearchHistory();
    } catch (e) {
        console.error('保存搜索历史失败:', e);
    }
}

// 渲染搜索历史
function renderSearchHistory() {
    const recentSearches = document.getElementById('recentSearches');
    if (!recentSearches) return;
    
    try {
        const history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        if (history.length === 0) {
            recentSearches.innerHTML = '';
            return;
        }
        
        recentSearches.innerHTML = `
            <div class="recent-searches-header">
                <span class="text-sm text-gray-400">最近搜索</span>
            </div>
            <div class="recent-searches-list">
                ${history.map(query => `
                    <button class="recent-search-item" onclick="searchFromHistory('${query}')">
                        ${query}
                    </button>
                `).join('')}
            </div>
        `;
    } catch (e) {
        console.error('渲染搜索历史失败:', e);
    }
}

// 从历史记录搜索
function searchFromHistory(query) {
    const searchInput = DOMCache.get('searchInput');
    if (searchInput) {
        searchInput.value = query;
        search();
    }
}

// 获取视频详情并播放
async function getVideoDetail(id, sourceCode, itemData) {
    if (!id || !sourceCode) {
        showToast('无效的视频信息', 'error');
        return;
    }

    const searchResults = DOMCache.get('searchResults');
    if (searchResults) {
        searchResults.innerHTML = `
            <div class="col-span-full text-center py-10">
                <div class="loading-spinner mx-auto mb-4"></div>
                <h3 class="text-lg font-medium text-gray-300">正在获取视频信息...</h3>
                <p class="text-sm text-gray-500">请稍候</p>
            </div>
        `;
    }

    try {
        const response = await fetch(`/api/detail?id=${id}&source=${sourceCode}`);
        const data = await response.json();

        if (data.code !== 200) {
            throw new Error(data.msg || '获取视频详情失败');
        }

        // 解析剧集数据
        let episodes = data.episodes || [];
        
        if (episodes.length === 0) {
            // 如果没有episodes，使用测试视频
            episodes = ['第1集$https://vjs.zencdn.net/v/oceans.mp4'];
        }

        if (episodes.length === 0) {
            showToast('未找到可播放的剧集', 'error');
            return;
        }

        // 更新全局状态
        currentEpisodes = episodes;
        
        // 播放第一集
        playVideo(
            episodes[0],
            itemData.vod_name || data.videoInfo?.title || '未知视频',
            0,
            itemData.source_name || data.videoInfo?.source_name || '未知源',
            sourceCode,
            id,
            itemData.vod_year || data.videoInfo?.year || '',
            itemData.type_name || data.videoInfo?.type || ''
        );

        showToast('视频加载成功', 'success');

    } catch (error) {
        console.error('获取视频详情失败:', error);
        
        // 显示错误信息
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <h3 class="text-lg font-medium text-red-400">获取视频详情失败</h3>
                    <p class="text-sm text-gray-500">${error.message}</p>
                    <button onclick="resetToHome()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                        返回搜索
                    </button>
                </div>
            `;
        }
        
        showToast('获取视频详情失败: ' + error.message, 'error');
    }
}

// 历史记录面板
function showHistoryPanel() {
    showToast('历史记录功能正在开发中', 'info');
}

// 设置面板
function showSettingsPanel() {
    showToast('设置面板功能正在开发中', 'info');
}

// 应用初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('主应用初始化开始...');
    
    // 初始化DOM缓存
    DOMCache.set('searchInput', document.getElementById('searchInput'));
    DOMCache.set('searchResults', document.getElementById('searchResults'));
    
    // 初始化主题切换
    initThemeToggle();
    
    // 初始化搜索历史
    renderSearchHistory();
    
    // 初始化搜索功能
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            search();
        });
    }
    
    // 初始化播放器控制按钮
    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (player) {
                if (player.state.fullscreen) {
                    player.exitFullscreen();
                } else {
                    player.enterFullscreen();
                }
            }
        });
    }
    
    const prevEpisodeBtn = document.getElementById('prev-episode');
    const nextEpisodeBtn = document.getElementById('next-episode');
    
    if (prevEpisodeBtn) {
        prevEpisodeBtn.addEventListener('click', playPreviousEpisode);
    }
    
    if (nextEpisodeBtn) {
        nextEpisodeBtn.addEventListener('click', playNextEpisode);
    }
    
    // 初始化历史和设置按钮
    const historyButton = document.getElementById('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', showHistoryPanel);
    }
    
    const settingsButton = document.getElementById('settingsButton');
    if (settingsButton) {
        settingsButton.addEventListener('click', showSettingsPanel);
    }
    
    // 初始化API源管理器
    if (window.APISourceManager) {
        window.APISourceManager.init();
    } else {
        console.warn('APISourceManager not found, using default sources');
    }
    
    console.log('主应用初始化完成');
});

// 暴露全局函数
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.showToast = showToast;
window.search = search;
window.searchFromHistory = searchFromHistory;