/**
 * 播放页搜索和历史功能
 * 复用首页的搜索和历史逻辑，但适配播放页的UI结构
 */

// 播放页专用的状态管理
const PlayerPageState = {
    isSearchPanelOpen: false,
    isHistoryPanelOpen: false,
    searchResults: [],
    currentSearchQuery: ''
};

/**
 * 初始化播放页的搜索和历史功能
 */
function initPlayerSearchHistory() {
    // 确保在DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPlayerSearchHistory);
    } else {
        // 使用setTimeout确保所有元素都已渲染
        setTimeout(setupPlayerSearchHistory, 100);
    }
}

/**
 * 设置播放页的搜索和历史功能
 */
function setupPlayerSearchHistory() {
    // 初始化AppState（如果还没有初始化）
    if (typeof AppState !== 'undefined' && !AppState.get('selectedAPIs')) {
        const selectedAPIsRaw = localStorage.getItem('selectedAPIs');
        const selectedAPIs = selectedAPIsRaw ? JSON.parse(selectedAPIsRaw) : (window.DEFAULT_SELECTED_APIS || []);
        AppState.set('selectedAPIs', selectedAPIs);
        
        const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
        AppState.set('customAPIs', customAPIs);
    }
    
    // 初始化API源管理器
    if (typeof APISourceManager !== 'undefined' && APISourceManager.init) {
        APISourceManager.init();
    }
    
    // 初始化事件监听器
    setupPlayerEventListeners();
    
    // 初始化搜索历史显示
    if (typeof renderSearchHistory === 'function') {
        renderSearchHistory();
        // 重新绑定搜索历史标签的点击事件
        setTimeout(() => {
            const recentSearches = document.getElementById('recentSearches');
            if (recentSearches) {
                // 移除旧的事件监听器，添加新的
                recentSearches.removeEventListener('click', handlePlayerSearchTagClick);
                recentSearches.addEventListener('click', handlePlayerSearchTagClick);
            }
        }, 100);
    }
    
    // 设置面板自动关闭
    setupPlayerPanelAutoClose();
}

/**
 * 设置播放页的事件监听器
 */
function setupPlayerEventListeners() {
    // 历史按钮
    const historyButton = document.getElementById('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', togglePlayerHistory);
    }
    
    // 搜索按钮
    const searchButton = document.getElementById('searchButton');
    if (searchButton) {
        searchButton.addEventListener('click', togglePlayerSearch);
    }
    
    // 关闭历史面板按钮
    const closeHistoryButton = document.getElementById('closeHistoryPanelButton');
    if (closeHistoryButton) {
        closeHistoryButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closePlayerHistory();
        });
    }
    
    // 关闭搜索面板按钮
    const closeSearchButton = document.getElementById('closeSearchPanelButton');
    if (closeSearchButton) {
        closeSearchButton.addEventListener('click', closePlayerSearch);
    }
    
    // 搜索表单
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handlePlayerSearch);
    }
    
    // 历史列表点击事件
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.addEventListener('click', handlePlayerHistoryClick);
    }
    
    // 搜索历史标签点击事件
    const recentSearches = document.getElementById('recentSearches');
    if (recentSearches) {
        recentSearches.addEventListener('click', handlePlayerSearchTagClick);
    }
    
    // 关闭模态框按钮
    const closeModalButton = document.getElementById('closeModalButton');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closePlayerModal);
    }
    
    // ESC键关闭面板
    document.addEventListener('keydown', handlePlayerKeydown);
}

/**
 * 切换历史面板
 */
function togglePlayerHistory(e) {
    if (e) e.stopPropagation();
    
    const historyPanel = document.getElementById('historyPanel');
    if (!historyPanel) return;
    
    if (PlayerPageState.isHistoryPanelOpen) {
        closePlayerHistory();
    } else {
        openPlayerHistory();
    }
}

/**
 * 打开历史面板
 */
function openPlayerHistory() {
    const historyPanel = document.getElementById('historyPanel');
    if (!historyPanel) return;
    
    // 关闭搜索面板
    closePlayerSearch();
    
    historyPanel.classList.add('show');
    historyPanel.style.transform = 'translateX(0)';
    historyPanel.setAttribute('aria-hidden', 'false');
    PlayerPageState.isHistoryPanelOpen = true;
    
    // 加载历史记录
    if (typeof loadViewingHistory === 'function') {
        loadViewingHistory();
    }
}

/**
 * 关闭历史面板
 */
function closePlayerHistory() {
    const historyPanel = document.getElementById('historyPanel');
    if (!historyPanel) return;
    
    historyPanel.classList.remove('show');
    historyPanel.style.transform = 'translateX(-100%)';
    historyPanel.setAttribute('aria-hidden', 'true');
    PlayerPageState.isHistoryPanelOpen = false;
}

/**
 * 切换搜索面板
 */
function togglePlayerSearch(e) {
    if (e) e.stopPropagation();
    
    if (PlayerPageState.isSearchPanelOpen) {
        closePlayerSearch();
    } else {
        openPlayerSearch();
    }
}

/**
 * 打开搜索面板
 */
function openPlayerSearch() {
    const searchPanel = document.getElementById('searchPanel');
    if (!searchPanel) return;
    
    // 关闭历史面板
    closePlayerHistory();
    
    searchPanel.classList.remove('hidden');
    searchPanel.setAttribute('aria-hidden', 'false');
    PlayerPageState.isSearchPanelOpen = true;
    
    // 聚焦搜索框
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }
    
    // 渲染搜索历史
    if (typeof renderSearchHistory === 'function') {
        renderSearchHistory();
    }
}

/**
 * 关闭搜索面板
 */
function closePlayerSearch() {
    const searchPanel = document.getElementById('searchPanel');
    if (!searchPanel) return;
    
    searchPanel.classList.add('hidden');
    searchPanel.setAttribute('aria-hidden', 'true');
    PlayerPageState.isSearchPanelOpen = false;
    
    // 清空搜索结果
    const searchResults = document.getElementById('searchResults');
    const searchResultsArea = document.getElementById('searchResultsArea');
    if (searchResults) searchResults.innerHTML = '';
    if (searchResultsArea) searchResultsArea.classList.add('hidden');
}

/**
 * 处理搜索表单提交
 */
function handlePlayerSearch(e) {
    e.preventDefault();
    
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    if (!query) {
        if (typeof showToast === 'function') {
            showToast('请输入搜索内容', 'warning');
        }
        return;
    }
    
    PlayerPageState.currentSearchQuery = query;
    
    // 保存搜索历史
    if (typeof saveSearchHistory === 'function') {
        saveSearchHistory(query);
    }
    
    // 执行搜索
    performPlayerSearch(query);
}

/**
 * 执行搜索
 */
async function performPlayerSearch(query) {
    const searchResultsArea = document.getElementById('searchResultsArea');
    const searchResults = document.getElementById('searchResults');
    const searchResultsCount = document.getElementById('searchResultsCount');
    
    if (!searchResults || !searchResultsArea) return;
    
    // 显示加载状态
    if (typeof showLoading === 'function') {
        showLoading(`正在搜索"${query}"`);
    }
    
    try {
        // 获取选中的API源
        let selectedAPIs = AppState.get('selectedAPIs');
        if (!selectedAPIs) {
            // 尝试从localStorage获取
            const storedAPIs = localStorage.getItem('selectedAPIs');
            if (storedAPIs) {
                selectedAPIs = JSON.parse(storedAPIs);
                AppState.set('selectedAPIs', selectedAPIs);
            } else {
                selectedAPIs = window.DEFAULT_SELECTED_APIS || [];
            }
        }
        
        if (!selectedAPIs || selectedAPIs.length === 0) {
            if (typeof showToast === 'function') {
                showToast('请至少选择一个API源', 'warning');
            }
            return;
        }
        
        // 调用搜索函数
        let results;
        if (typeof performSearch === 'function') {
            results = await performSearch(query, selectedAPIs);
        } else {
            // 备用搜索逻辑
            results = await performBasicSearch(query, selectedAPIs);
        }
        
        // 显示搜索结果
        renderPlayerSearchResults(results);
        
        // 更新结果计数
        if (searchResultsCount) {
            searchResultsCount.textContent = results.length;
        }
        
        // 显示结果区域
        searchResultsArea.classList.remove('hidden');
        
    } catch (error) {
        console.error('搜索出错:', error);
        if (searchResults) {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        }
    } finally {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}

/**
 * 备用搜索逻辑
 */
async function performBasicSearch(query, selectedAPIs) {
    const searchPromises = selectedAPIs.map(async (apiId) => {
        try {
            let apiUrl = `/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`;
            
            if (apiId.startsWith('custom_')) {
                const customIndex = parseInt(apiId.replace('custom_', ''));
                const customApi = APISourceManager?.getCustomApiInfo(customIndex);
                if (customApi && customApi.url) {
                    apiUrl += `&customApi=${encodeURIComponent(customApi.url)}`;
                } else {
                    return [];
                }
            }
            
            const response = await fetch(apiUrl);
            const data = await response.json();
            
            if (data.code === 200 && Array.isArray(data.list)) {
                return data.list.map(item => ({
                    ...item,
                    source_name: apiId.startsWith('custom_') 
                        ? (APISourceManager?.getCustomApiInfo(parseInt(apiId.replace('custom_', '')))?.name || '自定义源')
                        : (API_SITES[apiId]?.name || apiId),
                    source_code: apiId,
                    loadSpeed: '检测中...',
                    quality: '检测中...',
                    detectionMethod: 'pending'
                }));
            }
            return [];
        } catch (error) {
            console.error(`API ${apiId} 搜索失败:`, error);
            return [];
        }
    });
    
    const results = await Promise.all(searchPromises);
    return results.flat();
}

/**
 * 渲染搜索结果
 */
function renderPlayerSearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    if (!results || results.length === 0) {
        searchResults.innerHTML = '<div class="text-center py-8 text-gray-400">未找到相关内容</div>';
        return;
    }
    
    // 应用黄色内容过滤
    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        results = results.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }
    
    // 使用模板渲染搜索结果
    renderSearchResultsWithTemplate(results);
}

/**
 * 基础搜索结果渲染（备用）
 */
function renderBasicSearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    const fragment = document.createDocumentFragment();
    
    // 创建网格容器
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
    
    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card-hover bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all duration-300 cursor-pointer';
        card.dataset.id = item.vod_id;
        card.dataset.sourceCode = item.source_code;
        card.onclick = () => handlePlayerSearchResultClick(item);
        
        // 构建速度标签
        let speedBadge = '';
        if (item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
            speedBadge = `<span class="speed-tag inline-block px-2 py-1 text-xs rounded-full bg-green-600 text-white ml-2">${item.loadSpeed}</span>`;
        } else {
            speedBadge = `<span data-field="speed-tag" class="speed-tag hidden inline-block px-2 py-1 text-xs rounded-full bg-green-600 text-white ml-2"></span>`;
        }
        
        card.innerHTML = `
            <div class="flex items-start gap-4">
                <div class="flex-1">
                    <h3 class="text-white font-medium text-lg mb-2">${sanitizeText(item.vod_name || '')}</h3>
                    <div class="flex flex-wrap gap-2 text-sm text-gray-400 items-center">
                        <span>${sanitizeText(item.type_name || '')}</span>
                        ${item.vod_year ? `<span>·</span><span>${item.vod_year}</span>` : ''}
                        <span>·</span>
                        <span class="text-blue-400">${sanitizeText(item.source_name || '')}</span>
                        ${speedBadge}
                    </div>
                    ${item.vod_content ? `<p class="text-gray-300 text-sm mt-2 line-clamp-2">${sanitizeText(item.vod_content.slice(0, 100))}...</p>` : ''}
                </div>
            </div>
        `;
        
        gridContainer.appendChild(card);
    });
    
    searchResults.innerHTML = '';
    searchResults.appendChild(gridContainer);
}

/**
 * 使用模板渲染搜索结果
 */
function renderSearchResultsWithTemplate(results) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    
    const fragment = document.createDocumentFragment();
    
    results.forEach(item => {
        const resultCard = createResultItemUsingTemplate(item);
        if (resultCard) {
            fragment.appendChild(resultCard);
        }
    });
    
    gridContainer.appendChild(fragment);
    searchResults.innerHTML = '';
    searchResults.appendChild(gridContainer);
}

/**
 * 使用模板创建搜索结果项
 */
function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) return null;
    
    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');
    
    if (!cardElement) return null;
    
    // 设置数据属性
    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    
    // 填充数据
    const titleElement = cardElement.querySelector('[data-field="title"]');
    if (titleElement) titleElement.textContent = item.vod_name || '';
    
    const typeElement = cardElement.querySelector('[data-field="type"]');
    if (typeElement) typeElement.textContent = item.type_name || '';
    
    const yearElement = cardElement.querySelector('[data-field="year"]');
    if (yearElement) {
        if (item.vod_year) {
            yearElement.textContent = item.vod_year;
            yearElement.style.display = 'inline';
        } else {
            yearElement.style.display = 'none';
        }
    }
    
    const sourceElement = cardElement.querySelector('[data-field="source"]');
    if (sourceElement) sourceElement.textContent = item.source_name || '';
    
    const contentElement = cardElement.querySelector('[data-field="content"]');
    if (contentElement) contentElement.textContent = item.vod_content || '';
    
    const qualityElement = cardElement.querySelector('[data-field="quality"]');
    if (qualityElement) {
        qualityElement.textContent = item.quality || '检测中...';
    }
    
    // 速度标签
    const speedElement = cardElement.querySelector('[data-field="speed-tag"]');
    if (speedElement && item.loadSpeed && isValidSpeedValue(item.loadSpeed)) {
        speedElement.textContent = item.loadSpeed;
        speedElement.classList.remove('hidden');
    }
    
    // 添加点击事件
    cardElement.addEventListener('click', (e) => {
        e.preventDefault();
        handlePlayerSearchResultClick(item);
    });
    
    // 详情按钮点击事件
    const detailButton = cardElement.querySelector('[data-action="show-detail"]');
    if (detailButton) {
        detailButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showPlayerVideoDetail(item);
        });
    }
    
    return cardElement;
}

/**
 * 显示视频详情
 */
function showPlayerVideoDetail(item) {
    const template = document.getElementById('video-details-template');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    
    // 填充详情数据
    const typeElement = clone.querySelector('[data-field="type"]');
    if (typeElement) typeElement.textContent = item.type_name || '未知';
    
    const yearElement = clone.querySelector('[data-field="year"]');
    if (yearElement) yearElement.textContent = item.vod_year || '未知';
    
    const areaElement = clone.querySelector('[data-field="area"]');
    if (areaElement) areaElement.textContent = item.vod_area || '未知';
    
    const langElement = clone.querySelector('[data-field="lang"]');
    if (langElement) langElement.textContent = item.vod_lang || '未知';
    
    const directorElement = clone.querySelector('[data-field="director"]');
    if (directorElement) directorElement.textContent = item.vod_director || '未知';
    
    const actorElement = clone.querySelector('[data-field="actor"]');
    if (actorElement) actorElement.textContent = item.vod_actor || '未知';
    
    const sourceElement = clone.querySelector('[data-field="source"]');
    if (sourceElement) sourceElement.textContent = item.source_name || '未知';
    
    const contentElement = clone.querySelector('[data-field="content"]');
    if (contentElement) contentElement.textContent = item.vod_content || '暂无简介';
    
    // 处理剧集列表
    const episodesContainer = clone.querySelector('[data-field="episodes"]');
    if (episodesContainer && item.vod_play_url) {
        const episodes = item.vod_play_url.split('#');
        episodesContainer.innerHTML = '';
        
        episodes.forEach((episode, index) => {
            if (episode.trim()) {
                const episodeButton = document.createElement('button');
                episodeButton.className = 'bg-gray-700 hover:bg-blue-600 text-white text-xs px-3 py-2 rounded transition-colors';
                
                let episodeName = `第${index + 1}集`;
                if (episode.includes('$')) {
                    episodeName = episode.split('$')[0] || episodeName;
                }
                
                episodeButton.textContent = episodeName;
                episodeButton.addEventListener('click', () => {
                    closePlayerModal();
                    closePlayerSearch();
                    
                    // 播放选中的剧集
                    const playerUrl = new URL('player.html', window.location.origin);
                    let playUrl = episode;
                    if (episode.includes('$')) {
                        playUrl = episode.split('$')[1];
                    }
                    
                    playerUrl.searchParams.set('url', playUrl);
                    playerUrl.searchParams.set('title', item.vod_name);
                    playerUrl.searchParams.set('index', index.toString());
                    if (item.vod_id) playerUrl.searchParams.set('id', item.vod_id);
                    if (item.source_name) playerUrl.searchParams.set('source', item.source_name);
                    if (item.source_code) playerUrl.searchParams.set('source_code', item.source_code);
                    if (item.vod_year) playerUrl.searchParams.set('year', item.vod_year);
                    if (item.type_name) playerUrl.searchParams.set('typeName', item.type_name);
                    
                    const universalId = generateUniversalId(item.vod_name, item.vod_year, index);
                    playerUrl.searchParams.set('universalId', universalId);
                    
                    const adOn = getBoolConfig('adFilteringEnabled', false);
                    playerUrl.searchParams.set('af', adOn ? '1' : '0');
                    
                    window.location.href = playerUrl.toString();
                });
                
                episodesContainer.appendChild(episodeButton);
            }
        });
    }
    
    // 显示模态框
    if (typeof showModal === 'function') {
        showModal(clone, item.vod_name || '视频详情');
    }
}

/**
 * 检查速度值是否有效
 */
function isValidSpeedValue(speed) {
    if (!speed || speed === 'N/A' || speed === '连接超时' || speed === '未知' || speed === '检测失败') {
        return false;
    }
    return /^\d+(\.\d+)?\s*(KB\/s|MB\/s|kb\/s|mb\/s)$/i.test(speed);
}

/**
 * 处理搜索结果点击
 */
function handlePlayerSearchResultClick(item) {
    try {
        // 关闭搜索面板
        closePlayerSearch();
        
        // 显示详情模态框
        showPlayerVideoDetail(item);
    } catch (error) {
        console.error('处理搜索结果点击失败:', error);
        if (typeof showToast === 'function') {
            showToast('打开视频详情失败', 'error');
        }
    }
}

/**
 * 处理历史记录点击
 */
function handlePlayerHistoryClick(e) {
    // 复用首页的历史点击处理逻辑
    if (typeof handleHistoryListClick === 'function') {
        handleHistoryListClick(e);
    }
    
    // 关闭历史面板
    closePlayerHistory();
}

/**
 * 处理搜索标签点击
 */
function handlePlayerSearchTagClick(e) {
    // 处理删除按钮点击
    const delSpan = e.target.closest('span[data-deletequery]');
    if (delSpan) {
        if (typeof deleteSingleSearchHistory === 'function') {
            deleteSingleSearchHistory(delSpan.dataset.deletequery);
        }
        e.stopPropagation();
        return;
    }

    // 标签点击（只有非X按钮才允许搜索）
    const tagBtn = e.target.closest('.search-tag');
    if (tagBtn && !e.target.closest('span[data-deletequery]')) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const query = tagBtn.textContent.trim();
            searchInput.value = query;
            
            // 直接执行搜索
            PlayerPageState.currentSearchQuery = query;
            performPlayerSearch(query);
        }
        return;
    }
}

/**
 * 关闭模态框
 */
function closePlayerModal() {
    if (typeof closeModal === 'function') {
        closeModal();
    }
}

/**
 * 处理键盘事件
 */
function handlePlayerKeydown(e) {
    // 检查是否在输入框中
    const activeElement = document.activeElement;
    const isInInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
    );
    
    // ESC键关闭面板
    if (e.key === 'Escape') {
        if (PlayerPageState.isSearchPanelOpen) {
            closePlayerSearch();
            e.preventDefault();
        } else if (PlayerPageState.isHistoryPanelOpen) {
            closePlayerHistory();
            e.preventDefault();
        }
    }
    
    // 快捷键（仅在非输入状态下生效）
    if (!isInInput) {
        // Ctrl+F 或 / 键打开搜索
        if ((e.ctrlKey && e.key === 'f') || e.key === '/') {
            e.preventDefault();
            openPlayerSearch();
        }
        
        // H键打开历史
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            togglePlayerHistory();
        }
    }
}

/**
 * 设置面板自动关闭
 */
function setupPlayerPanelAutoClose() {
    document.addEventListener('click', function(event) {
        // 检查点击的元素
        const historyButton = document.getElementById('historyButton');
        const searchButton = document.getElementById('searchButton');
        const historyPanel = document.getElementById('historyPanel');
        const searchPanel = document.getElementById('searchPanel');
        
        // 如果点击的是按钮或面板内部，不做处理
        if (historyButton && historyButton.contains(event.target)) return;
        if (searchButton && searchButton.contains(event.target)) return;
        if (historyPanel && historyPanel.contains(event.target)) return;
        if (searchPanel && searchPanel.contains(event.target)) return;
        
        // 关闭面板
        if (PlayerPageState.isHistoryPanelOpen) {
            closePlayerHistory();
        }
        // 注意：搜索面板是模态框，不需要自动关闭
    });
}

/**
 * 文本净化函数
 */
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 生成视频统一标识符（复用播放页逻辑）
 */
function generateUniversalId(title, year, episodeIndex) {
    if (typeof getCoreTitle === 'function') {
        const coreTitle = getCoreTitle(title);
        const normalizedTitle = coreTitle.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
        const normalizedYear = year ? String(year) : 'unknown';
        return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
    }
    // 备用逻辑
    const normalizedTitle = title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').replace(/\s+/g, '');
    const normalizedYear = year ? String(year) : 'unknown';
    return `${normalizedTitle}_${normalizedYear}_${episodeIndex}`;
}

/**
 * 获取布尔配置值
 */
function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 导出函数到全局作用域
window.initPlayerSearchHistory = initPlayerSearchHistory;
window.togglePlayerHistory = togglePlayerHistory;
window.togglePlayerSearch = togglePlayerSearch;

// 自动初始化
initPlayerSearchHistory();