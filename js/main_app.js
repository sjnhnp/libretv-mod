// 主应用程序 - 整合所有功能，保持原有特性不变
import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player';

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
})();

// 主题切换功能
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
function search() {
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
    
    // 模拟搜索结果
    const searchResults = DOMCache.get('searchResults');
    const searchResultsCount = document.getElementById('searchResultsCount');
    
    if (searchResults && searchResultsCount) {
        searchResultsCount.textContent = '0';
        searchResults.innerHTML = `
            <div class="col-span-full text-center py-10">
                <h3 class="text-lg font-medium text-gray-300">搜索功能开发中</h3>
                <p class="text-sm text-gray-500">请等待完整功能实现</p>
            </div>
        `;
    }
    
    showToast(`搜索"${query}"`, 'info');
}

// 获取视频详情并播放
function getVideoDetail(id, sourceCode, itemData) {
    // 模拟视频详情数据
    const mockEpisodes = [
        '第1集$https://example.com/video1.m3u8',
        '第2集$https://example.com/video2.m3u8',
        '第3集$https://example.com/video3.m3u8'
    ];
    
    currentEpisodes = mockEpisodes;
    
    // 播放第一集
    playVideo(
        mockEpisodes[0],
        itemData.vod_name || '测试视频',
        0,
        itemData.source_name || '测试源',
        sourceCode,
        id,
        itemData.vod_year || '2024',
        itemData.type_name || '电视剧'
    );
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

// 暴露全局函数
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.showToast = showToast;
window.search = search;

// 应用初始化
document.addEventListener('DOMContentLoaded', function () {
    console.log('主应用初始化开始...');
    
    // 初始化DOM缓存
    DOMCache.set('searchInput', document.getElementById('searchInput'));
    DOMCache.set('searchResults', document.getElementById('searchResults'));
    
    // 初始化主题切换
    initThemeToggle();
    
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
    if (prevEpisodeBtn) prevEpisodeBtn.addEventListener('click', playPreviousEpisode);

    const nextEpisodeBtn = document.getElementById('next-episode');
    if (nextEpisodeBtn) nextEpisodeBtn.addEventListener('click', playNextEpisode);
    
    // 添加测试按钮（临时用于演示）
    const testBtn = document.createElement('button');
    testBtn.textContent = '测试播放';
    testBtn.className = 'fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg z-50';
    testBtn.onclick = () => {
        const mockEpisodes = [
            '第1集$https://vjs.zencdn.net/v/oceans.mp4',
            '第2集$https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            '第3集$https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
        ];
        
        currentEpisodes = mockEpisodes;
        playVideo(mockEpisodes[0], '测试视频', 0, '测试源', 'test', '123', '2024', '电视剧');
    };
    document.body.appendChild(testBtn);
    
    console.log('主应用初始化完成');
});