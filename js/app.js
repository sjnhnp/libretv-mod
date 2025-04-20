// 全局状态管理
const state = {
    selectedAPIs: JSON.parse(localStorage.getItem('selectedAPIs') || '["heimuer"]'),
    customAPIs: JSON.parse(localStorage.getItem('customAPIs') || '[]'),
    currentEpisodeIndex: 0,
    currentEpisodes: [],
    currentVideoTitle: '',
    episodesReversed: false
};

// DOM 元素缓存
const elements = {
    searchInput: document.getElementById('searchInput'),
    results: document.getElementById('results'),
    settingsPanel: document.getElementById('settingsPanel'),
    apiCheckboxes: document.getElementById('apiCheckboxes'),
    customApisList: document.getElementById('customApisList'),
    yellowFilterToggle: document.getElementById('yellowFilterToggle'),
    adFilterToggle: document.getElementById('adFilterToggle'),
    searchArea: document.getElementById('searchArea'),
    resultsArea: document.getElementById('resultsArea'),
    selectedApiCount: document.getElementById('selectedApiCount')
};

// 初始化函数
function init() {
    initAPICheckboxes();
    renderCustomAPIsList();
    updateSelectedApiCount();
    renderSearchHistory();
    initializeDefaultSettings();
    setupEventListeners();
    setTimeout(checkAdultAPIsSelected, 100);
}

// 初始化默认设置
function initializeDefaultSettings() {
    if (!localStorage.getItem('hasInitializedDefaults')) {
        state.selectedAPIs = ["heimuer"];
        localStorage.setItem('selectedAPIs', JSON.stringify(state.selectedAPIs));
        localStorage.setItem('yellowFilterEnabled', 'true');
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, 'true');
        localStorage.setItem('hasInitializedDefaults', 'true');
    }

    if (elements.yellowFilterToggle) {
        elements.yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') !== 'false';
    }

    if (elements.adFilterToggle) {
        elements.adFilterToggle.checked = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false';
    }
}

// API 复选框初始化
function initAPICheckboxes() {
    const fragment = document.createDocumentFragment();
    addAPIGroup(fragment, false);
    if (!HIDE_BUILTIN_ADULT_APIS) {
        addAPIGroup(fragment, true);
    }
    elements.apiCheckboxes.innerHTML = '';
    elements.apiCheckboxes.appendChild(fragment);
    checkAdultAPIsSelected();
}

// 添加 API 组
function addAPIGroup(container, isAdult) {
    const title = document.createElement('div');
    title.className = `api-group-title${isAdult ? ' adult' : ''}`;
    title.textContent = isAdult ? '黄色资源采集站' : '普通资源';
    if (isAdult) {
        title.innerHTML += ' <span class="adult-warning"><svg>...</svg></span>';
    }
    container.appendChild(title);

    Object.entries(API_SITES).forEach(([apiKey, api]) => {
        if (api.adult !== isAdult) return;
        const checkbox = createAPICheckbox(apiKey, api);
        container.appendChild(checkbox);
    });
}

// 创建 API 复选框
function createAPICheckbox(apiKey, api) {
    const checkbox = document.createElement('div');
    checkbox.className = 'flex items-center';
    checkbox.innerHTML = `
        <input type="checkbox" id="api_${apiKey}" 
               class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]${api.adult ? ' api-adult' : ''}" 
               ${state.selectedAPIs.includes(apiKey) ? 'checked' : ''} 
               data-api="${apiKey}">
        <label for="api_${apiKey}" class="ml-1 text-xs ${api.adult ? 'text-pink-400' : 'text-gray-400'} truncate">${api.name}</label>
    `;
    checkbox.querySelector('input').addEventListener('change', () => {
        updateSelectedAPIs();
        checkAdultAPIsSelected();
    });
    return checkbox;
}

// 渲染自定义 API 列表
function renderCustomAPIsList() {
    if (!elements.customApisList) return;
    if (state.customAPIs.length === 0) {
        elements.customApisList.innerHTML = '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    state.customAPIs.forEach((api, index) => {
        const apiItem = createCustomAPIItem(api, index);
        fragment.appendChild(apiItem);
    });
    elements.customApisList.innerHTML = '';
    elements.customApisList.appendChild(fragment);
}

// 创建自定义 API 项
function createCustomAPIItem(api, index) {
    const apiItem = document.createElement('div');
    apiItem.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
    const textColorClass = api.isAdult ? 'text-pink-400' : 'text-white';
    const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';
    apiItem.innerHTML = `
        <div class="flex items-center flex-1 min-w-0">
            <input type="checkbox" id="custom_api_${index}" 
                   class="form-checkbox h-3 w-3 text-blue-600 mr-1 ${api.isAdult ? 'api-adult' : ''}" 
                   ${state.selectedAPIs.includes('custom_' + index) ? 'checked' : ''} 
                   data-custom-index="${index}">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-medium ${textColorClass} truncate">
                    ${adultTag}${api.name}
                </div>
                <div class="text-xs text-gray-500 truncate">${api.url}</div>
            </div>
        </div>
        <div class="flex items-center">
            <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="editCustomApi(${index})">✎</button>
            <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="removeCustomApi(${index})">✕</button>
        </div>
    `;
    apiItem.querySelector('input').addEventListener('change', () => {
        updateSelectedAPIs();
        checkAdultAPIsSelected();
    });
    return apiItem;
}

// 更新选中的 API 列表
function updateSelectedAPIs() {
    const builtInApiCheckboxes = document.querySelectorAll('#apiCheckboxes input:checked');
    const customApiCheckboxes = document.querySelectorAll('#customApisList input:checked');
    
    const builtInApis = Array.from(builtInApiCheckboxes).map(input => input.dataset.api);
    const customApiIndices = Array.from(customApiCheckboxes).map(input => 'custom_' + input.dataset.customIndex);
    
    state.selectedAPIs = [...builtInApis, ...customApiIndices];
    localStorage.setItem('selectedAPIs', JSON.stringify(state.selectedAPIs));
    updateSelectedApiCount();
}

// 更新选中的 API 数量显示
function updateSelectedApiCount() {
    if (elements.selectedApiCount) {
        elements.selectedApiCount.textContent = state.selectedAPIs.length;
    }
}

// 搜索功能
async function search() {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }

    const query = elements.searchInput.value.trim();
    if (!query) {
        showToast('请输入搜索内容', 'info');
        return;
    }

    if (state.selectedAPIs.length === 0) {
        showToast('请至少选择一个API源', 'warning');
        return;
    }

    showLoading();

    try {
        saveSearchHistory(query);
        const allResults = await searchAllAPIs(query);
        displaySearchResults(allResults);
    } catch (error) {
        console.error('搜索错误:', error);
        showToast('搜索过程中发生错误', 'error');
    } finally {
        hideLoading();
    }
}

// 搜索所有选中的 API
async function searchAllAPIs(query) {
    const searchPromises = state.selectedAPIs.map(apiId => searchSingleAPI(apiId, query));
    const resultsArray = await Promise.all(searchPromises);
    return resultsArray.flat();
}

// 搜索单个 API
async function searchSingleAPI(apiId, query) {
    try {
        const { apiUrl, apiName } = getAPIInfo(apiId);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(PROXY_URL + encodeURIComponent(apiUrl + encodeURIComponent(query)), {
            headers: API_CONFIG.search.headers,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();

        if (!data || !Array.isArray(data.list)) {
            throw new Error('API返回的数据格式无效');
        }

        return data.list.map(item => ({
            ...item,
            source_name: apiName,
            source_code: apiId,
            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
        }));
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}

// 获取 API 信息
function getAPIInfo(apiId) {
    if (apiId.startsWith('custom_')) {
        const customIndex = apiId.replace('custom_', '');
        const customApi = getCustomApiInfo(customIndex);
        if (!customApi) throw new Error('无效的自定义API');
        return {
            apiUrl: customApi.url + API_CONFIG.search.path,
            apiName: customApi.name
        };
    } else {
        if (!API_SITES[apiId]) throw new Error('无效的API源');
        return {
            apiUrl: API_SITES[apiId].api + API_CONFIG.search.path,
            apiName: API_SITES[apiId].name
        };
    }
}

// 显示搜索结果
function displaySearchResults(allResults) {
    elements.searchArea.classList.remove('flex-1');
    elements.searchArea.classList.add('mb-8');
    elements.resultsArea.classList.remove('hidden');

    if (!allResults || allResults.length === 0) {
        displayNoResults();
        return;
    }

    const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
    if (yellowFilterEnabled) {
        allResults = filterYellowContent(allResults);
    }

    const resultsHTML = allResults.map(createResultHTML).join('');
    elements.results.innerHTML = resultsHTML;
}

// 过滤黄色内容
function filterYellowContent(results) {
    const banned = ['伦理片','门事件','萝莉少女','制服诱惑','国产传媒','cosplay','黑丝诱惑','无码','日本无码','有码','日本有码','SWAG','网红主播', '色情片','同性片','福利视频','福利片'];
    return results.filter(item => {
        const typeName = item.type_name || '';
        return !banned.some(keyword => typeName.includes(keyword));
    });
}

// 显示无搜索结果提示
function displayNoResults() {
    elements.results.innerHTML = `
        <div class="col-span-full text-center py-16">
            <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="mt-2 text-lg font-medium text-gray-400">没有找到匹配的结果</h3>
            <p class="mt-1 text-sm text-gray-500">请尝试其他关键词或更换数据源</p>
        </div>
    `;
}

// 创建单条搜索结果HTML（XSS防护）
function createResultHTML(item) {
    // 安全处理文本显示
    const safeId = (item.vod_id || '').toString().replace(/[^\w-]/g, '');
    const safeName = escapeHTML(item.vod_name || '');
    const safeType = escapeHTML(item.type_name || '');
    const safeYear = (item.vod_year || '').toString();
    const safeRemarks = escapeHTML(item.vod_remarks || '暂无介绍');
    const sourceName = escapeHTML(item.source_name || '');
    const sourceCode = item.source_code || '';
    const apiUrlAttr = item.api_url ? `data-api-url="${escapeAttribute(item.api_url)}"` : '';
    const hasCover = item.vod_pic && /^https?:\/\//.test(item.vod_pic);

    return `
        <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full" 
             onclick="showDetails('${safeId}','${safeName}','${sourceCode}')" ${apiUrlAttr}>
            <div class="md:flex">
                ${hasCover ? `
                <div class="md:w-1/4 relative overflow-hidden">
                    <div class="w-full h-40 md:h-full">
                        <img src="${escapeAttribute(item.vod_pic)}" alt="${safeName}" 
                             class="w-full h-full object-cover transition-transform hover:scale-110" 
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=无封面'; this.classList.add('object-contain');" 
                             loading="lazy">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent opacity-60"></div>
                    </div>
                </div>` : ''}
                <div class="p-3 flex flex-col flex-grow ${hasCover ? 'md:w-3/4' : 'w-full'}">
                    <div class="flex-grow">
                        <h3 class="text-lg font-semibold mb-2 break-words">${safeName}</h3>
                        <div class="flex flex-wrap gap-1 mb-2">
                            ${safeType ? `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">${safeType}</span>` : ''}
                            ${safeYear ? `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">${safeYear}</span>` : ''}
                        </div>
                        <p class="text-gray-400 text-xs h-9 overflow-hidden">${safeRemarks}</p>
                    </div>
                    <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
                        ${sourceName ? `<div><span class="bg-[#222] text-xs px-2 py-1 rounded-full">${sourceName}</span></div>` : '<div></div>'}
                        <div>
                            <span class="text-xs text-gray-500 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                点击播放
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 简单防XSS函数，转义HTML文本
function escapeHTML(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 防止属性注入的简单转义
function escapeAttribute(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// 显示详情
async function showDetails(id, vod_name, sourceCode) {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }

    if (!id) {
        showToast('视频ID无效', 'error');
        return;
    }

    showLoading();

    try {
        const apiParams = buildDetailParams(sourceCode);
        const response = await fetch('/api/detail?id=' + encodeURIComponent(id) + apiParams);
        const data = await response.json();

        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');

        // 来源信息安全处理
        const sourceName = data.videoInfo && data.videoInfo.source_name ? ` <span class="text-sm font-normal text-gray-400">(${escapeHTML(data.videoInfo.source_name)})</span>` : '';
        modalTitle.innerHTML = `<span class="break-words">${escapeHTML(vod_name) || '未知视频'}</span>${sourceName}`;
        state.currentVideoTitle = vod_name || '未知视频';

        if (data.episodes && data.episodes.length > 0) {
            // 安全过滤集数URL
            const safeEpisodes = data.episodes.map(url => (url && (url.startsWith('http://') || url.startsWith('https://'))) ? url.replace(/"/g, '&quot;') : '').filter(Boolean);

            state.currentEpisodes = safeEpisodes;
            state.episodesReversed = false;

            modalContent.innerHTML = `
                <div class="flex justify-end mb-2">
                    <button onclick="toggleEpisodeOrder()" class="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
                        </svg>
                        <span>倒序排列</span>
                    </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodes(vod_name)}
                </div>
            `;
        } else {
            modalContent.innerHTML = '<p class="text-center text-gray-400 py-8">没有找到可播放的视频</p>';
        }
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('获取详情错误:', error);
        showToast('获取详情失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

// 构建详情请求参数
function buildDetailParams(sourceCode) {
    if (sourceCode.startsWith('custom_')) {
        const idx = sourceCode.replace('custom_', '');
        const customApi = getCustomApiInfo(idx);
        if (!customApi) throw new Error('自定义API配置无效');
        return `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
    } else {
        return `&source=${encodeURIComponent(sourceCode)}`;
    }
}

// 渲染剧集按钮列表
function renderEpisodes(vodName) {
    const episodes = state.episodesReversed ? [...state.currentEpisodes].reverse() : state.currentEpisodes;
    return episodes.map((episode, idx) => {
        const realIndex = state.episodesReversed ? state.currentEpisodes.length - 1 - idx : idx;
        return `
            <button id="episode-${realIndex}" onclick="playVideo('${episode.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${escapeAttribute(vodName)}', ${realIndex})" 
                    class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">
                第${realIndex + 1}集
            </button>
        `;
    }).join('');
}

// 切换剧集排序
function toggleEpisodeOrder() {
    state.episodesReversed = !state.episodesReversed;
    const episodesGrid = document.getElementById('episodesGrid');
    if (episodesGrid) {
        episodesGrid.innerHTML = renderEpisodes(state.currentVideoTitle);
    }
    const toggleBtn = document.querySelector('button[onclick="toggleEpisodeOrder()"]');
    if (toggleBtn) {
        toggleBtn.querySelector('span').textContent = state.episodesReversed ? '正序排列' : '倒序排列';
        const arrowIcon = toggleBtn.querySelector('svg');
        if (arrowIcon) {
            arrowIcon.style.transform = state.episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
}

// 播放视频函数
function playVideo(url, vod_name, episodeIndex = 0) {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }
    if (!url) {
        showToast('无效的视频链接', 'error');
        return;
    }

    // 来源名称解析（从模态框标题中提取）
    let sourceName = '';
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        const sourceSpan = modalTitle.querySelector('span.text-gray-400');
        if (sourceSpan) {
            const match = sourceSpan.textContent.match(/\(([^)]+)\)/);
            if (match && match[1]) {
                sourceName = match[1].trim();
            }
        }
    }

    localStorage.setItem('currentVideoTitle', vod_name);
    localStorage.setItem('currentEpisodeIndex', episodeIndex);
    localStorage.setItem('currentEpisodes', JSON.stringify(state.currentEpisodes));
    localStorage.setItem('episodesReversed', state.episodesReversed);

    const videoInfo = {
        title: vod_name,
        url,
        episodeIndex,
        sourceName,
        timestamp: Date.now(),
        episodes: [...(state.currentEpisodes || [])]
    };

    if (typeof addToViewingHistory === 'function') {
        addToViewingHistory(videoInfo);
    }

    const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(vod_name)}&index=${episodeIndex}&source=${encodeURIComponent(sourceName)}`;

    window.location.href = playerUrl;
}

// 其他辅助函数...

// 事件监听器设置
function setupEventListeners() {
    if (elements.searchInput) {
        elements.searchInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') search();
        });
    }

    document.addEventListener('click', e => {
        if (!elements.settingsPanel) return;
        const settingsButton = document.querySelector('button[onclick="toggleSettings(event)"]');
        if (!elements.settingsPanel.contains(e.target) && settingsButton && !settingsButton.contains(e.target) && elements.settingsPanel.classList.contains('show')) {
            elements.settingsPanel.classList.remove('show');
        }
    });

    if (elements.yellowFilterToggle) {
        elements.yellowFilterToggle.addEventListener('change', e => {
            localStorage.setItem('yellowFilterEnabled', e.target.checked);
        });
    }

    if (elements.adFilterToggle) {
        elements.adFilterToggle.addEventListener('change', e => {
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, e.target.checked);
        });
    }
}

// 检查成人API选中状态
function checkAdultAPIsSelected() {
    const adultBuiltinCheckboxes = document.querySelectorAll('#apiCheckboxes .api-adult:checked');
    const customApiCheckboxes = document.querySelectorAll('#customApisList .api-adult:checked');
    const hasAdultSelected = adultBuiltinCheckboxes.length > 0 || customApiCheckboxes.length > 0;
    if (!elements.yellowFilterToggle) return;

    const yellowFilterToggle = elements.yellowFilterToggle;
    const yellowFilterContainer = yellowFilterToggle.closest('div').parentNode;
    const filterDescription = yellowFilterContainer.querySelector('p.filter-description');

    if (hasAdultSelected) {
        yellowFilterToggle.checked = false;
        yellowFilterToggle.disabled = true;
        localStorage.setItem('yellowFilterEnabled', 'false');
        yellowFilterContainer.classList.add('filter-disabled');
        if (filterDescription) {
            filterDescription.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
        }
        const existingTooltip = yellowFilterContainer.querySelector('.filter-tooltip');
        if (existingTooltip) existingTooltip.remove();
    } else {
        yellowFilterToggle.disabled = false;
        yellowFilterContainer.classList.remove('filter-disabled');
        if (filterDescription) {
            filterDescription.innerHTML = '过滤"伦理片"等黄色内容';
        }
        const existingTooltip = yellowFilterContainer.querySelector('.filter-tooltip');
        if (existingTooltip) existingTooltip.remove();
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', init);
