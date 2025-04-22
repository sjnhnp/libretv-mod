
// 全局变量
let selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '["heimuer", "dbzy"]'); // 默认选中黑木耳和豆瓣资源
let customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]'); // 存储自定义API列表

// 添加当前播放的集数索引

let currentEpisodeIndex = 0;
let currentEpisodes = [];
let currentVideoTitle = '';
let episodesReversed = false;

/**
 * 从localStorage获取数据，带默认值与JSON安全解析
 */
function getStateFromStorage(key, defaultValue) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch {
        return defaultValue;
    }
}

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function() {
    initAPICheckboxes();
    renderCustomAPIsList();
    updateSelectedApiCount();
    renderSearchHistory();

    // 初始化默认配置
    if (!localStorage.getItem('hasInitializedDefaults')) {

        // 仅选择黑木耳源和豆瓣资源
        selectedAPIs = ["heimuer", "dbzy"];

        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
        localStorage.setItem('yellowFilterEnabled', 'true');
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, 'true');
        localStorage.setItem('hasInitializedDefaults', 'true');
    }

    // 恢复过滤开关状态
    setToggleByStorage('yellowFilterToggle', 'yellowFilterEnabled', true);
    setToggleByStorage('adFilterToggle', PLAYER_CONFIG.adFilteringStorage, true);

    setupEventListeners();
    setTimeout(checkAdultAPIsSelected, 100);
});

/**
 * 设置过滤器的开关状态（兼容localStorage和默认值）
 */
function setToggleByStorage(inputId, storageKey, defaultChecked) {
    const el = document.getElementById(inputId);
    if (el) el.checked = localStorage.getItem(storageKey) !== 'false';
}

// ========== 内置&自定义API复选框初始化 ==========

function initAPICheckboxes() {
    const container = document.getElementById('apiCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    container.appendChild(renderApiGroupTitle('普通资源'));

    Object.entries(API_SITES).forEach(([apiKey, api]) => {
        if (!api.adult) {
            container.appendChild(renderApiCheckbox(apiKey, api.name, selectedAPIs.includes(apiKey), false));
        }
    });

    if (!HIDE_BUILTIN_ADULT_APIS) {
        container.appendChild(renderApiGroupTitle('黄色资源采集站', true));
        Object.entries(API_SITES).forEach(([apiKey, api]) => {
            if (api.adult) {
                container.appendChild(renderApiCheckbox(apiKey, api.name, selectedAPIs.includes(apiKey), true));
            }
        });
    }
    checkAdultAPIsSelected();
}
function renderApiGroupTitle(title, isAdult) {
    const d = document.createElement('div');
    d.className = 'api-group-title' + (isAdult ? ' adult' : '');
    d.innerHTML = isAdult
        ? `黄色资源采集站 <span class="adult-warning">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </span>`
        : title;
    return d;
}
function renderApiCheckbox(apiKey, apiName, checked, isAdult) {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center';
    wrap.innerHTML = `
        <input type="checkbox" id="api_${apiKey}" 
            class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]${isAdult ? ' api-adult' : ''}" 
            ${checked ? 'checked' : ''} data-api="${apiKey}">
        <label for="api_${apiKey}" class="ml-1 text-xs ${isAdult ? "text-pink-400" : "text-gray-400"} truncate">${apiName}</label>
    `;
    const input = wrap.querySelector('input');
    input.addEventListener('change', () => {
        updateSelectedAPIs();
        checkAdultAPIsSelected();
    });
    return wrap;
}

// =========== 成人API选择、过滤器状态维护 ============

function checkAdultAPIsSelected() {
    const builtin = document.querySelectorAll('#apiCheckboxes .api-adult:checked');
    const custom = document.querySelectorAll('#customApisList .api-adult:checked');
    const hasAdultSelected = builtin.length > 0 || custom.length > 0;

    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (!yellowFilterToggle) return;
    const yellowFilterContainer = yellowFilterToggle.closest('div').parentNode;
    const filterDescription = yellowFilterContainer.querySelector('p.filter-description');
    if (hasAdultSelected) {
        yellowFilterToggle.checked = false;
        yellowFilterToggle.disabled = true;
        localStorage.setItem('yellowFilterEnabled', 'false');
        yellowFilterContainer.classList.add('filter-disabled');
        if (filterDescription)
            filterDescription.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
        const tip = yellowFilterContainer.querySelector('.filter-tooltip');
        tip && tip.remove();
    } else {
        yellowFilterToggle.disabled = false;
        yellowFilterContainer.classList.remove('filter-disabled');
        if (filterDescription)
            filterDescription.innerHTML = '过滤"伦理片"等黄色内容';
        const tip = yellowFilterContainer.querySelector('.filter-tooltip');
        tip && tip.remove();
    }
}

// ========== 自定义API管理功能 ==========

function renderCustomAPIsList() {
    const container = document.getElementById('customApisList');
    if (!container) return;

    if (!customAPIs.length) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
        return;
    }
    container.innerHTML = '';
    customAPIs.forEach((api, idx) => container.appendChild(renderCustomApiItem(api, idx)));
}
function renderCustomApiItem(api, index) {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
    const textColor = api.isAdult ? 'text-pink-400' : 'text-white';
    const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';

    item.innerHTML = `
      <div class="flex items-center flex-1 min-w-0">
        <input type="checkbox" id="custom_api_${index}" 
            class="form-checkbox h-3 w-3 text-blue-600 mr-1${api.isAdult ? ' api-adult' : ''}" 
            ${selectedAPIs.includes('custom_' + index) ? 'checked' : ''} data-custom-index="${index}">
        <div class="flex-1 min-w-0">
            <div class="text-xs font-medium ${textColor} truncate">${adultTag}${api.name}</div>
            <div class="text-xs text-gray-500 truncate">${api.url}</div>
        </div>
      </div>
      <div class="flex items-center">
        <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="editCustomApi(${index})">✎</button>
        <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="removeCustomApi(${index})">✕</button>
      </div>
    `;
    const input = item.querySelector('input');
    input.addEventListener('change', () => {
        updateSelectedAPIs();
        checkAdultAPIsSelected();
    });
    return item;
}

// ========== 自定义API编辑、新增/删除 ==========

function editCustomApi(idx) {
    if (idx < 0 || idx >= customAPIs.length) return;
    const api = customAPIs[idx];
    setApiFormInputs(api.name, api.url, api.isAdult);
    setCustomApiFormMode('edit', idx);
}

function updateCustomApi(idx) {
    if (idx < 0 || idx >= customAPIs.length) return;
    const {name, url, isAdult} = readApiFormInputs();
    if (!validateApiForm(name, url)) return;
    customAPIs[idx] = { name, url, isAdult };
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    renderCustomAPIsList();
    checkAdultAPIsSelected();
    restoreAddCustomApiButtons();
    clearApiFormInputs();
    hideApiForm();
    showToast('已更新自定义API: ' + name, 'success');
    updateSelectedApiCount();
}

function addCustomApi() {
    const {name, url, isAdult} = readApiFormInputs();
    if (!validateApiForm(name, url)) return;
    customAPIs.push({ name, url, isAdult });
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    const newApiIndex = customAPIs.length - 1;
    selectedAPIs.push('custom_' + newApiIndex);
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
    renderCustomAPIsList(); updateSelectedApiCount(); checkAdultAPIsSelected();
    clearApiFormInputs(); hideApiForm(); restoreAddCustomApiButtons();
    showToast('已添加自定义API: ' + name, 'success');
}

function removeCustomApi(idx) {
    if (idx < 0 || idx >= customAPIs.length) return;
    const apiName = customAPIs[idx].name;
    customAPIs.splice(idx, 1);
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    selectedAPIs = selectedAPIs.filter(id => id !== 'custom_' + idx)
        .map(id => /^custom_(\d+)$/.test(id) ? (
            (parseInt(id.replace('custom_', '')) > idx) ? 'custom_' + (parseInt(id.replace('custom_', '')) - 1) : id) : id);
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
    renderCustomAPIsList(); updateSelectedApiCount(); checkAdultAPIsSelected();
    showToast('已移除自定义API: ' + apiName, 'info');
}

function setCustomApiFormMode(mode, idx) {
    const form = document.getElementById('addCustomApiForm');
    const btnWrap = form.querySelector('div:last-child');
    btnWrap.innerHTML = mode === 'edit'
        ? `<button onclick="updateCustomApi(${idx})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">更新</button>
           <button onclick="cancelEditCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>`
        : `<button onclick="addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
           <button onclick="cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>`;
    form.classList.remove('hidden');
}
function restoreAddCustomApiButtons() { setCustomApiFormMode('add'); }
function hideApiForm() { document.getElementById('addCustomApiForm').classList.add('hidden'); }
function clearApiFormInputs() {
    document.getElementById('customApiName').value = '';
    document.getElementById('customApiUrl').value = '';
    const isAdult = document.getElementById('customApiIsAdult');
    if (isAdult) isAdult.checked = false;
}


// 重置搜索区域
function resetSearchArea() {
    // 清理搜索结果
    document.getElementById('results').innerHTML = '';
    document.getElementById('searchInput').value = '';
    
    // 恢复搜索区域的样式
    document.getElementById('searchArea').classList.add('flex-1');
    document.getElementById('searchArea').classList.remove('mb-8');
    document.getElementById('resultsArea').classList.add('hidden');
    
    // 确保页脚正确显示，移除相对定位
    const footer = document.querySelector('.footer');
    if (footer) {
        footer.style.position = '';
    }
    
    // 如果有豆瓣功能，检查是否需要显示豆瓣推荐区域
    if (typeof updateDoubanVisibility === 'function') {
        updateDoubanVisibility();
    }

}

function cancelEditCustomApi() { clearApiFormInputs(); hideApiForm(); restoreAddCustomApiButtons(); }
function cancelAddCustomApi() { clearApiFormInputs(); hideApiForm(); restoreAddCustomApiButtons(); }
function showAddCustomApiForm() { document.getElementById('addCustomApiForm').classList.remove('hidden'); }

// ============= API复选与选中数量维护 ==============

function updateSelectedAPIs() {
    const builtIn = Array.from(document.querySelectorAll('#apiCheckboxes input:checked')).map(i => i.dataset.api);
    const custom = Array.from(document.querySelectorAll('#customApisList input:checked')).map(i => 'custom_' + i.dataset.customIndex);
    selectedAPIs = [...builtIn, ...custom];
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
    updateSelectedApiCount();
}
function updateSelectedApiCount() {
    const el = document.getElementById('selectedApiCount');
    if (el) el.textContent = selectedAPIs.length;
}
function selectAllAPIs(selectAll = true, excludeAdult = false) {
    const boxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');
    boxes.forEach(cb => {
        if (excludeAdult && cb.classList.contains('api-adult')) cb.checked = false;
        else cb.checked = selectAll;
    });
    updateSelectedAPIs(); checkAdultAPIsSelected();
}

// ============= 搜索核心逻辑 ===============

async function search() {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return showToast('请输入搜索内容', 'info');
    if (!selectedAPIs.length) return showToast('请至少选择一个API源', 'warning');

    showLoading();
    try {
        saveSearchHistory(query);
        let allResults = [];

        const searchPromises = selectedAPIs.map(async (apiId) => {
            try {
                let apiUrl, apiName;
                
                // 处理自定义API
                if (apiId.startsWith('custom_')) {
                    const customIndex = apiId.replace('custom_', '');
                    const customApi = getCustomApiInfo(customIndex);
                    if (!customApi) return [];
                    
                    apiUrl = customApi.url + API_CONFIG.search.path + encodeURIComponent(query);
                    apiName = customApi.name;
                } else {
                    // 内置API
                    if (!API_SITES[apiId]) return [];
                    apiUrl = API_SITES[apiId].api + API_CONFIG.search.path + encodeURIComponent(query);
                    apiName = API_SITES[apiId].name;
                }
                
                // 添加超时处理
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                
                const response = await fetch(PROXY_URL + encodeURIComponent(apiUrl), {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    return [];
                }
                
                const data = await response.json();
                
                if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
                    return [];
                }
                
                // 添加源信息到每个结果
                const results = data.list.map(item => ({
                    ...item,
                    source_name: apiName,
                    source_code: apiId,
                    api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
                }));
                
                return results;
            } catch (error) {
                console.warn(`API ${apiId} 搜索失败:`, error);
                return [];
            }
        });
        
        // 等待所有搜索请求完成
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        resultsArray.forEach(results => {
            if (Array.isArray(results) && results.length > 0) {
                allResults = allResults.concat(results);
            }
        });
        
        // 更新搜索结果计数
        const searchResultsCount = document.getElementById('searchResultsCount');
        if (searchResultsCount) {
            searchResultsCount.textContent = allResults.length;
        }
        
        // 显示结果区域，调整搜索区域
        document.getElementById('searchArea').classList.remove('flex-1');
        document.getElementById('searchArea').classList.add('mb-8');
        document.getElementById('resultsArea').classList.remove('hidden');
        
        // 隐藏豆瓣推荐区域（如果存在）
        const doubanArea = document.getElementById('doubanArea');
        if (doubanArea) {
            doubanArea.classList.add('hidden');
        }
        
        const resultsDiv = document.getElementById('results');
        
        // 如果没有结果
        if (!allResults || allResults.length === 0) {
            resultsDiv.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 class="mt-2 text-lg font-medium text-gray-400">没有找到匹配的结果</h3>
                    <p class="mt-1 text-sm text-gray-500">请尝试其他关键词或更换数据源</p>
                </div>
            `;
            hideLoading();
            return;
        }

        // 处理搜索结果过滤：如果启用了黄色内容过滤，则过滤掉分类含有敏感内容的项目
        const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
        if (yellowFilterEnabled) {
            const banned = ['伦理片','门事件','萝莉少女','制服诱惑','国产传媒','cosplay','黑丝诱惑','无码','日本无码','有码','日本有码','SWAG','网红主播', '色情片','同性片','福利视频','福利片'];
            allResults = allResults.filter(item => {
                const typeName = item.type_name || '';
                return !banned.some(keyword => typeName.includes(keyword));
            });
        }

        // 添加XSS保护，使用textContent和属性转义
        resultsDiv.innerHTML = allResults.map(item => {
            const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, '') : '';
            const safeName = (item.vod_name || '').toString()
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            const sourceInfo = item.source_name ? 
                `<span class="bg-[#222] text-xs px-2 py-1 rounded-full">${item.source_name}</span>` : '';
            const sourceCode = item.source_code || '';
            
            // 添加API URL属性，用于详情获取
            const apiUrlAttr = item.api_url ? 
                `data-api-url="${item.api_url.replace(/"/g, '&quot;')}"` : '';
            
            // 重新设计的卡片布局 - 支持更好的封面图显示
            const hasCover = item.vod_pic && item.vod_pic.startsWith('http');
            
            return `
                <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full" 
                     onclick="showDetails('${safeId}','${safeName}','${sourceCode}')" ${apiUrlAttr}>
                    <div class="md:flex">
                        ${hasCover ? `
                        <div class="md:w-1/4 relative overflow-hidden">
                            <div class="w-full h-40 md:h-full">
                                <img src="${item.vod_pic}" alt="${safeName}" 
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
                                    ${(item.type_name || '').toString().replace(/</g, '&lt;') ? 
                                      `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">
                                          ${(item.type_name || '').toString().replace(/</g, '&lt;')}
                                      </span>` : ''}
                                    ${(item.vod_year || '') ? 
                                      `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">
                                          ${item.vod_year}
                                      </span>` : ''}
                                </div>
                                <p class="text-gray-400 text-xs h-9 overflow-hidden">
                                    ${(item.vod_remarks || '暂无介绍').toString().replace(/</g, '&lt;')}
                                </p>
                            </div>
                            
                            <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
                                ${sourceInfo ? `<div>${sourceInfo}</div>` : '<div></div>'}
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
        }).join('');
    } catch (error) {
        console.error('搜索错误:', error);
        if (error.name === 'AbortError') {
            showToast('搜索请求超时，请检查网络连接', 'error');
        } else {
            showToast('搜索请求失败，请稍后重试', 'error');
        }

    } finally {
        hideLoading();
    }
}

/**
 * 单个API进行一次安全搜索，返回标准结果数组（含adult api/name差异等处理）
 */
async function searchSingleApi(apiId, query) {
    try {
        let apiUrl, apiName, customApiUrl;
        if (apiId.startsWith('custom_')) {
            const idx = apiId.replace('custom_', '');
            const customApi = getCustomApiInfo(idx);
            if (!customApi) return [];
            apiUrl = customApi.url + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = customApi.name;
            customApiUrl = customApi.url;
        } else {
            if (!API_SITES[apiId]) return [];
            apiUrl = API_SITES[apiId].api + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = API_SITES[apiId].name;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(PROXY_URL + encodeURIComponent(apiUrl), {
            headers: API_CONFIG.search.headers,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) return [];
        const data = await response.json();
        if (!Array.isArray(data.list)) return [];
        return data.list.map(item => ({
            ...item,
            source_name: apiName,
            source_code: apiId,
            api_url: customApiUrl
        }));
    } catch {
        return [];
    }
}
function showSearchUI() {
    document.getElementById('searchArea').classList.remove('flex-1');
    document.getElementById('searchArea').classList.add('mb-8');
    document.getElementById('resultsArea').classList.remove('hidden');
}
function renderNoResultsHtml() {
    return `
      <div class="col-span-full text-center py-16">
        <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <h3 class="mt-2 text-lg font-medium text-gray-400">没有找到匹配的结果</h3>
        <p class="mt-1 text-sm text-gray-500">请尝试其他关键词或更换数据源</p>
      </div>`;
}
/**
 * 搜索结果黄色内容敏感过滤
 */
function filterResultsByYellow(results) {
    if (localStorage.getItem('yellowFilterEnabled') !== 'true') return results;
    const banned = ['伦理片','门事件','萝莉少女','制服诱惑','国产传媒','cosplay','黑丝诱惑','无码','日本无码','有码','日本有码','SWAG','网红主播', '色情片','同性片','福利视频','福利片'];
    return results.filter(item =>
        !(item.type_name && banned.some(kw => item.type_name.includes(kw)))
    );
}
/**
 * 搜索列表每一项安全渲染
 */
function renderResultCard(item) {
    // 创建卡片主体
    const card = document.createElement('div');
    card.classList.add(
        'card-hover', 'bg-[#111]', 'rounded-lg', 'overflow-hidden',
        'cursor-pointer', 'transition-all', 'hover:scale-[1.02]', 'h-full'
    );

    // 设置自定义数据属性（如 api_url），如果有
    if (item.api_url) {
        card.setAttribute('data-api-url', item.api_url);
    }

    // onclick 安全闭包（原始item.vod_id/vod_name/source_code不会被注入为JS代码）
    card.onclick = function() {
        showDetails(
            (item.vod_id || '').toString(),
            item.vod_name || '',
            item.source_code || ''
        );
    };

    // 主体布局容器
    const flexDiv = document.createElement('div');
    flexDiv.classList.add('md:flex');

    // 左侧封面
    let hasCover = item.vod_pic && typeof item.vod_pic === 'string' && item.vod_pic.startsWith('http');
    if (hasCover) {
        const leftDiv = document.createElement('div');
        leftDiv.classList.add('md:w-1/4', 'relative', 'overflow-hidden');

        const wrapperDiv = document.createElement('div');
        wrapperDiv.classList.add('w-full', 'h-40', 'md:h-full');

        const img = document.createElement('img');
        img.classList.add('w-full', 'h-full', 'object-cover', 'transition-transform', 'hover:scale-110');
        img.setAttribute('alt', item.vod_name || '');
        img.setAttribute('loading', 'lazy');
        img.setAttribute('src', item.vod_pic);
        img.onerror = function() {
            this.onerror = null;
            this.src = 'https://via.placeholder.com/300x450?text=无封面';
            this.classList.add('object-contain');
        };

        // 覆盖层
        const overlay = document.createElement('div');
        overlay.classList.add('absolute', 'inset-0', 'bg-gradient-to-t', 'from-[#111]', 'to-transparent', 'opacity-60');

        wrapperDiv.appendChild(img);
        wrapperDiv.appendChild(overlay);
        leftDiv.appendChild(wrapperDiv);
        flexDiv.appendChild(leftDiv);
    }

    // 右侧内容区
    const contentDiv = document.createElement('div');
    contentDiv.className = `p-3 flex flex-col flex-grow ${hasCover ? 'md:w-3/4' : 'w-full'}`;

    // 上部内容
    const topContent = document.createElement('div');
    topContent.classList.add('flex-grow');

    // 片名
    const h3 = document.createElement('h3');
    h3.classList.add('text-lg', 'font-semibold', 'mb-2', 'break-words');
    h3.textContent = item.vod_name || '';
    topContent.appendChild(h3);

    // 类型与年份标签
    const tagsDiv = document.createElement('div');
    tagsDiv.classList.add('flex', 'flex-wrap', 'gap-1', 'mb-2');

    if (item.type_name) {
        const typeTag = document.createElement('span');
        typeTag.classList.add('text-xs', 'py-0.5', 'px-1.5', 'rounded', 'bg-opacity-20', 'bg-blue-500', 'text-blue-300');
        typeTag.textContent = item.type_name;
        tagsDiv.appendChild(typeTag);
    }
    if (item.vod_year) {
        const yearTag = document.createElement('span');
        yearTag.classList.add('text-xs', 'py-0.5', 'px-1.5', 'rounded', 'bg-opacity-20', 'bg-purple-500', 'text-purple-300');
        yearTag.textContent = item.vod_year;
        tagsDiv.appendChild(yearTag);
    }
    topContent.appendChild(tagsDiv);

    // 剧情简介
    const p = document.createElement('p');
    p.classList.add('text-gray-400', 'text-xs', 'h-9', 'overflow-hidden');
    p.textContent = item.vod_remarks || '暂无介绍';
    topContent.appendChild(p);

    contentDiv.appendChild(topContent);

    // 下部区块（来源名与播放提示）
    const infoRow = document.createElement('div');
    infoRow.classList.add('flex', 'justify-between', 'items-center', 'mt-2', 'pt-2', 'border-t', 'border-gray-800');

    // 来源信息
    if (item.source_name) {
        const sourceDiv = document.createElement('div');
        const srcBadge = document.createElement('span');
        srcBadge.classList.add('bg-[#222]', 'text-xs', 'px-2', 'py-1', 'rounded-full');
        srcBadge.textContent = item.source_name;
        sourceDiv.appendChild(srcBadge);
        infoRow.appendChild(sourceDiv);
    } else {
        infoRow.appendChild(document.createElement('div'));
    }

    // “点击播放”提示（含svg）
    const playHint = document.createElement('span');
    playHint.classList.add('text-xs', 'text-gray-500', 'flex', 'items-center');
    playHint.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>` +
        '点击播放';
    infoRow.appendChild(playHint);

    contentDiv.appendChild(infoRow);
    flexDiv.appendChild(contentDiv);
    card.appendChild(flexDiv);

    return card;
}


// ============= 详情展示 & 剧集按钮渲染 ==============

async function showDetails(id, vod_name, sourceCode) {
    // 密码保护
    if (window.isPasswordProtected && window.isPasswordVerified)
        if (window.isPasswordProtected() && !window.isPasswordVerified()) { showPasswordModal && showPasswordModal(); return; }
    if (!id) return showToast('视频ID无效', 'error');
    showLoading();
    try {
        let apiParams = '';
        if (sourceCode.startsWith('custom_')) {
            const customIndex = sourceCode.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) { showToast('自定义API配置无效', 'error'); hideLoading(); return; }
            apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
        } else {
            apiParams = '&source=' + sourceCode;
        }
        const response = await fetch('/api/detail?id=' + encodeURIComponent(id) + apiParams);
        const data = await response.json();

        
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        const sourceName = data.videoInfo && data.videoInfo.source_name
            ? ` <span class="text-sm font-normal text-gray-400">(${data.videoInfo.source_name})</span>` : '';
        modalTitle.innerHTML = `<span class="break-words">${vod_name || '未知视频'}</span>${sourceName}`;
        currentVideoTitle = vod_name || '未知视频';
        if (data.episodes && data.episodes.length) {
            currentEpisodes = data.episodes.filter(u => /^https?:\/\//.test(u));
            episodesReversed = false;
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
                    ${renderEpisodes(currentVideoTitle)}
                </div>`;
        } else {
            modalContent.innerHTML = '<p class="text-center text-gray-400 py-8">没有找到可播放的视频</p>';
        }
        modal.classList.remove('hidden');
    } catch (e) {
        showToast('获取详情失败，请稍后重试', 'error');
    } finally { hideLoading(); }
}

/** 渲染剧集按钮（根据倒序状态） */
function renderEpisodes(vodName) {
    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    return episodes.map((ep, idx) => {
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - idx : idx;
        return `<button id="episode-${realIndex}" onclick="playVideo('${ep}','${vodName.replace(/"/g, '&quot;')}', ${realIndex})" class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">第${realIndex + 1}集</button>`;
    }).join('');
}
/** 切换剧集排序 */
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    const grid = document.getElementById('episodesGrid');
    if (grid) grid.innerHTML = renderEpisodes(currentVideoTitle);
    const btn = document.querySelector('button[onclick="toggleEpisodeOrder()"]');
    if (btn) {
        btn.querySelector('span').textContent = episodesReversed ? '正序排列' : '倒序排列';
        const arrowIcon = btn.querySelector('svg');
        if (arrowIcon) arrowIcon.style.transform = episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

// ============== 事件监听 & 辅助函数 ================

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') search(); });
    // 设置面板自动关闭
    document.addEventListener('click', function(e) {
        const panel = document.getElementById('settingsPanel');
        const settingsButton = document.querySelector('button[onclick="toggleSettings(event)"]');
        if (panel && settingsButton && !panel.contains(e.target) && !settingsButton.contains(e.target) && panel.classList.contains('show')) {
            panel.classList.remove('show');
        }
    });
    // 各种开关本地状态存储
    addToggleListener('yellowFilterToggle', 'yellowFilterEnabled');
    addToggleListener('adFilterToggle', PLAYER_CONFIG.adFilteringStorage);
}
function addToggleListener(id, storageKey) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => localStorage.setItem(storageKey, e.target.checked));
}

function resetSearchArea() {
    document.getElementById('results').innerHTML = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchArea').classList.add('flex-1');
    document.getElementById('searchArea').classList.remove('mb-8');
    document.getElementById('resultsArea').classList.add('hidden');
    const footer = document.querySelector('.footer');
    if (footer) footer.style.position = '';
}

// 当前API索引→自定义API对象
function getCustomApiInfo(idx) {
    const index = parseInt(idx);
    if (isNaN(index) || index < 0 || index >= customAPIs.length) return null;
    return customAPIs[index];
}

// ========== Player集数辅助函数 ==========

function playVideo(url, vod_name, episodeIndex = 0) {
    if (window.isPasswordProtected && window.isPasswordVerified)
        if (window.isPasswordProtected() && !window.isPasswordVerified()) { showPasswordModal && showPasswordModal(); return; }
    if (!url) return showToast('无效的视频链接', 'error');

    // 获取视频来源名称
    let sourceName = '';
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        const span = modalTitle.querySelector('span.text-gray-400');
        if (span) {
            const match = span.textContent.match(/\(([^)]+)\)/);
            if (match && match[1]) sourceName = match[1].trim();
        }
    }
    localStorage.setItem('currentVideoTitle', vod_name);
    localStorage.setItem('currentEpisodeIndex', episodeIndex);
    localStorage.setItem('currentEpisodes', JSON.stringify(currentEpisodes));
    localStorage.setItem('episodesReversed', episodesReversed);

    const videoTitle = vod_name;
    const videoInfo = {
        title: videoTitle,
        url: url,
        episodeIndex: episodeIndex,
        sourceName: sourceName,
        timestamp: Date.now(),
        episodes: currentEpisodes && currentEpisodes.length ? [...currentEpisodes] : []
    };
    if (typeof addToViewingHistory === 'function') addToViewingHistory(videoInfo);

    const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(videoTitle)}&index=${episodeIndex}&source=${encodeURIComponent(sourceName)}`;
    window.location.href = playerUrl;
}

// 辅助：上一集/下一集
function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) playVideo(currentEpisodes[currentEpisodeIndex - 1], currentVideoTitle, currentEpisodeIndex - 1);
}
function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) playVideo(currentEpisodes[currentEpisodeIndex + 1], currentVideoTitle, currentEpisodeIndex + 1);
}
function handlePlayerError() {
    hideLoading(); showToast('视频播放加载失败，请尝试其他视频源', 'error');
}
