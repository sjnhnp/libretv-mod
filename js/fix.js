// 修复脚本 - 在页面加载后运行，修复搜索和按钮功能

document.addEventListener('DOMContentLoaded', function() {
    console.log('修复脚本启动...');
    
    // 修复搜索功能
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const searchInput = document.getElementById('searchInput');
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
            const searchResults = document.getElementById('searchResults');
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
            
            // 执行搜索
            performSearch(query);
        });
    }
    
    // 修复历史和设置按钮
    const historyButton = document.getElementById('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', function() {
            showHistoryPanel();
        });
    }
    
    const settingsButton = document.getElementById('settingsButton');
    if (settingsButton) {
        settingsButton.addEventListener('click', function() {
            showSettingsPanel();
        });
    }
    
    console.log('修复脚本完成');
});

// 执行搜索
async function performSearch(query) {
    try {
        // 使用默认的API源进行搜索
        const selectedAPIs = ['heimuer', 'bfzy', 'dyttzy', 'maotai', 'tyyszy'];
        const searchPromises = selectedAPIs.map(apiId => {
            // 使用代理转发API请求
            const apiBaseUrl = window.API_SITES[apiId]?.api || '';
            if (!apiBaseUrl) {
                return Promise.resolve({
                    code: 400,
                    msg: `API源 ${apiId} 未找到或配置无效`,
                    list: [],
                    apiId: apiId
                });
            }
            
            const searchPath = `?ac=videolist&wd=${encodeURIComponent(query)}`;
            const proxyUrl = `/proxy/${encodeURIComponent(apiBaseUrl + searchPath)}`;
            
            return fetch(proxyUrl)
                .then(response => response.json())
                .then(data => ({ 
                    ...data, 
                    apiId: apiId, 
                    apiName: window.API_SITES[apiId]?.name || apiId 
                }))
                .catch(error => ({
                    code: 400,
                    msg: `API(${apiId})搜索失败: ${error.message}`,
                    list: [],
                    apiId: apiId
                }));
        });
        
        const results = await Promise.all(searchPromises);
        renderSearchResults(results, query);
    } catch (error) {
        console.error('搜索失败:', error);
        const searchResults = document.getElementById('searchResults');
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

// 渲染搜索结果
function renderSearchResults(results, query) {
    const searchResults = document.getElementById('searchResults');
    const searchResultsCount = document.getElementById('searchResultsCount');
    
    if (!searchResults || !searchResultsCount) return;

    let allResults = [];
    results.forEach(result => {
        if (result.code === 200 && Array.isArray(result.list) && result.list.length > 0) {
            const resultsWithSource = result.list.map(item => ({
                ...item,
                source_name: result.apiName || window.API_SITES[result.apiId]?.name || '未知来源',
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
    
    // 保存搜索历史
    saveSearchHistory(query);
    showToast(`搜索"${query}"完成`, 'success');
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

// 获取视频详情并播放
async function getVideoDetail(id, sourceCode, itemData) {
    if (!id || !sourceCode) {
        showToast('无效的视频信息', 'error');
        return;
    }

    const searchResults = document.getElementById('searchResults');
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
        // 使用代理获取详情
        const apiBaseUrl = window.API_SITES[sourceCode]?.api || '';
        if (!apiBaseUrl) {
            throw new Error(`API源 ${sourceCode} 未找到或配置无效`);
        }
        
        const detailPath = `?ac=videolist&ids=${id}`;
        const proxyUrl = `/proxy/${encodeURIComponent(apiBaseUrl + detailPath)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();

        if (data.code !== 200 || !Array.isArray(data.list) || data.list.length === 0) {
            throw new Error(data.msg || '获取视频详情失败');
        }

        const videoDetail = data.list[0];
        
        // 解析剧集数据
        let episodes = [];
        if (videoDetail.vod_play_url) {
            const mainSource = videoDetail.vod_play_url.split('$$$')[0] || '';
            episodes = mainSource.split('#')
                .map(ep => ep.trim())
                .filter(Boolean);
        }

        if (episodes.length === 0) {
            // 如果没有episodes，使用测试视频
            episodes = ['第1集$https://vjs.zencdn.net/v/oceans.mp4'];
        }

        // 更新全局状态
        window.currentEpisodes = episodes;
        
        // 播放第一集
        window.playVideo(
            episodes[0],
            videoDetail.vod_name || itemData.vod_name || '未知视频',
            0,
            itemData.source_name || '未知源',
            sourceCode,
            id,
            videoDetail.vod_year || itemData.vod_year || '',
            videoDetail.type_name || itemData.type_name || ''
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
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = query;
        const searchForm = document.getElementById('searchForm');
        if (searchForm) {
            const submitEvent = new Event('submit');
            searchForm.dispatchEvent(submitEvent);
        }
    }
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

// 导出全局函数
window.searchFromHistory = searchFromHistory;
window.showToast = showToast;
window.SEARCH_HISTORY_KEY = SEARCH_HISTORY_KEY;
window.MAX_HISTORY_ITEMS = MAX_HISTORY_ITEMS;