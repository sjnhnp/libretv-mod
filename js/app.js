// ===================== 全局变量 & 统一常量 ========================

let selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '["heimuer", "wolong", "ruyi"]');
let customAPIs   = JSON.parse(localStorage.getItem('customAPIs') || '[]');
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let currentVideoTitle = '';
let episodesReversed = false;

// ===================== 页面初始化 ========================
document.addEventListener('DOMContentLoaded', function() {
    // API复选框、API自定义区、API计数渲染
    initAPICheckboxes();
    renderCustomAPIsList();
    updateSelectedApiCount();
    renderSearchHistory();

    // 初始化默认API（首开时）
    if (!localStorage.getItem('hasInitializedDefaults')) {
        selectedAPIs = ["heimuer", "wolong", "ruyi"];
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
        localStorage.setItem('yellowFilterEnabled', 'true');
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, 'true');
        localStorage.setItem('hasInitializedDefaults', 'true');
    }
    // "黄色内容过滤" 初始状态
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (yellowFilterToggle)
        yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') === 'true';
    // 广告过滤开关初始
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle)
        adFilterToggle.checked = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false';

    // 事件绑定
    setupEventListeners();

    // 初步检查"成人API选中"
    setTimeout(checkAdultAPIsSelected, 100);

    // 首页集数预加载功能开关和数字
    const preloadingToggle = document.getElementById('preloadingToggle');
    const preloadCountInput = document.getElementById('preloadCountInput');
    if (preloadingToggle && preloadCountInput) {
        preloadingToggle.checked = localStorage.getItem('enablePreloading') !== 'false' ||
            (typeof PLAYER_CONFIG.enablePreloading==='undefined' ? true : PLAYER_CONFIG.enablePreloading);
        const storedCount = parseInt(localStorage.getItem('preloadCount'));
        preloadCountInput.value = (!isNaN(storedCount) && storedCount>=1 && storedCount<=10) ?
            storedCount : (typeof PLAYER_CONFIG.preloadCount!=='undefined' ? PLAYER_CONFIG.preloadCount : 2);

        // 状态保存函数
        const applyPreloadingConfigChange = () => {
            localStorage.setItem('enablePreloading', preloadingToggle.checked ? 'true' : 'false');
            PLAYER_CONFIG.enablePreloading = preloadingToggle.checked;
        };
        const applyPreloadCountChange = () => {
            let val = Math.min(Math.max(parseInt(preloadCountInput.value) || 2, 1), 10);
            preloadCountInput.value = val;
            localStorage.setItem('preloadCount', val);
            PLAYER_CONFIG.preloadCount = val;
        };
        preloadingToggle.addEventListener('change', applyPreloadingConfigChange);
        preloadCountInput.addEventListener('change', applyPreloadCountChange);
        preloadCountInput.addEventListener('input', applyPreloadCountChange);
    }
});


// ===================== API复选框与自定义API ========================

function initAPICheckboxes() {
    const container = document.getElementById('apiCheckboxes');
    if (!container) return;

    container.innerHTML = '';

    // 普通API组标题
    let titleNormal = document.createElement('div');
    titleNormal.className = 'api-group-title';
    titleNormal.textContent = '普通资源';
    container.appendChild(titleNormal);

    // 普通API
    Object.keys(API_SITES).forEach(apiKey => {
        const api = API_SITES[apiKey];
        if (api.adult) return;
        let box = document.createElement('div');
        box.className = 'flex items-center';
        box.innerHTML = `<input type="checkbox" id="api_${apiKey}" 
            class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]" 
            ${selectedAPIs.includes(apiKey) ? 'checked' : ''} data-api="${apiKey}">
            <label for="api_${apiKey}" class="ml-1 text-xs text-gray-400 truncate">${api.name}</label>`;
        container.appendChild(box);
        box.querySelector('input').addEventListener('change', () => {updateSelectedAPIs();checkAdultAPIsSelected();});
    });

    // 内置成人API组（如未屏蔽）
    if (!HIDE_BUILTIN_ADULT_APIS) {
        let titleAdult = document.createElement('div');
        titleAdult.className = 'api-group-title adult';
        titleAdult.innerHTML = `黄色资源采集站 <span class="adult-warning">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:1em;height:1em">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
        </span>`;
        container.appendChild(titleAdult);
        Object.keys(API_SITES).filter(key=>API_SITES[key].adult).forEach(apiKey => {
            const api = API_SITES[apiKey];
            let box = document.createElement('div');
            box.className = 'flex items-center';
            box.innerHTML = `<input type="checkbox" id="api_${apiKey}" 
                class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333] api-adult"
                ${selectedAPIs.includes(apiKey)?'checked':''} data-api="${apiKey}">
                <label for="api_${apiKey}" class="ml-1 text-xs text-pink-400 truncate">${api.name}</label>`;
            container.appendChild(box);
            box.querySelector('input').addEventListener('change',()=>{updateSelectedAPIs();checkAdultAPIsSelected()});
        });
    }
}

/** 检查是否有成人API被选中，自动控制黄色内容过滤器的禁用 */
function checkAdultAPIsSelected() {
    const adultBuiltin = document.querySelectorAll('#apiCheckboxes .api-adult:checked');
    const customAdult  = document.querySelectorAll('#customApisList .api-adult:checked');
    const hasAdult = adultBuiltin.length > 0 || customAdult.length > 0;
    const yellowToggle = document.getElementById('yellowFilterToggle');
    const row = yellowToggle?.closest('div')?.parentNode;
    const desc = row?.querySelector('p.filter-description');
    if (!yellowToggle) return;
    if (hasAdult) {
        yellowToggle.checked = false;
        yellowToggle.disabled = true;
        localStorage.setItem('yellowFilterEnabled','false');
        row?.classList.add('filter-disabled');
        if (desc) desc.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
        // 去除提示信息
        row?.querySelector('.filter-tooltip')?.remove();
    } else {
        yellowToggle.disabled = false;
        row?.classList.remove('filter-disabled');
        if (desc) desc.textContent = '过滤"伦理片"等黄色内容';
        row?.querySelector('.filter-tooltip')?.remove();
    }
}

/** 渲染自定义API区域 */
function renderCustomAPIsList() {
    const container = document.getElementById('customApisList');
    if (!container) return;
    container.innerHTML = customAPIs.length ?
        '' : '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
    customAPIs.forEach((api, idx) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
        const textColorClass = api.isAdult ? 'text-pink-400' : 'text-white';
        const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';
        item.innerHTML = `
            <div class="flex items-center flex-1 min-w-0">
                <input type="checkbox" id="custom_api_${idx}" 
                    class="form-checkbox h-3 w-3 text-blue-600 mr-1 ${api.isAdult ? 'api-adult' : ''}"
                    ${selectedAPIs.includes('custom_'+idx)?'checked':''} data-custom-index="${idx}">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-medium ${textColorClass} truncate">${adultTag}${api.name}</div>
                    <div class="text-xs text-gray-500 truncate">${api.url}</div>
                </div>
            </div>
            <div class="flex items-center">
                <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="editCustomApi(${idx})">✎</button>
                <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="removeCustomApi(${idx})">✕</button>
            </div>`;
        container.appendChild(item);
        item.querySelector('input').addEventListener('change',()=>{
            updateSelectedAPIs();checkAdultAPIsSelected();
        });
    });
}

// 编辑自定义API
function editCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;
    
    const api = customAPIs[index];
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');
    
    // 填充表单数据
    nameInput.value = api.name;
    urlInput.value = api.url;
    if (isAdultInput) isAdultInput.checked = !!api.isAdult;
    
    // 显示表单
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.classList.remove('hidden');
        
        // 替换表单按钮操作
        const buttonContainer = form.querySelector('div:last-child');
        buttonContainer.innerHTML = `
            <button onclick="updateCustomApi(${index})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">更新</button>
            <button onclick="cancelEditCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
        `;
    }
}

// 更新自定义API
function updateCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;
    
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');
    
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const isAdult = isAdultInput ? isAdultInput.checked : false;
    
    if (!name || !url) {
        showToast('请输入API名称和链接', 'warning');
        return;
    }
    
    // 确保URL格式正确
    if (!/^https?:\/\/.+/.test(url)) {
        showToast('API链接格式不正确，需以http://或https://开头', 'warning');
        return;
    }
    
    // 移除URL末尾的斜杠
    if (url.endsWith('/')) url = url.slice(0, -1);
    
    // 更新API信息
    customAPIs[index] = { name, url, isAdult };
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    
    // 重新渲染自定义API列表
    renderCustomAPIsList();
    
    // 重新检查成人API选中状态
    checkAdultAPIsSelected();
    
    // 恢复添加按钮
    restoreAddCustomApiButtons();
    
    // 清空表单并隐藏
    nameInput.value = '';
    urlInput.value = '';
    if (isAdultInput) isAdultInput.checked = false;
    document.getElementById('addCustomApiForm').classList.add('hidden');
    
    showToast('已更新自定义API: ' + name, 'success');
}

// 取消编辑自定义API
function cancelEditCustomApi() {
    // 清空表单
    document.getElementById('customApiName').value = '';
    document.getElementById('customApiUrl').value = '';
    const isAdultInput = document.getElementById('customApiIsAdult');
    if (isAdultInput) isAdultInput.checked = false;
    
    // 隐藏表单
    document.getElementById('addCustomApiForm').classList.add('hidden');
    
    // 恢复添加按钮
    restoreAddCustomApiButtons();
}

// 恢复自定义API添加按钮
function restoreAddCustomApiButtons() {
    const form = document.getElementById('addCustomApiForm');
    if (!form) return;
    
    const buttonContainer = form.querySelector('div:last-child');
    buttonContainer.innerHTML = `
        <button onclick="addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
        <button onclick="cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
    `;
}

/** 更新已选API状态，保存到localStorage并刷新数量 */
function updateSelectedAPIs() {
    const builtIn = Array.from(document.querySelectorAll('#apiCheckboxes input:checked')).map(input=>input.dataset.api);
    const custom  = Array.from(document.querySelectorAll('#customApisList input:checked')).map(input=>'custom_'+input.dataset.customIndex);
    selectedAPIs = [...builtIn, ...custom];
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
    updateSelectedApiCount();
}

/** 显示当前已选API数量 */
function updateSelectedApiCount() {
    const el = document.getElementById('selectedApiCount');
    if (el) el.textContent = selectedAPIs.length;
}

/** 批量选择API，一键全选/全取消/仅普通 */
function selectAllAPIs(selectAll=true, excludeAdult=false) {
    const checkboxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');
    checkboxes.forEach(box=>{
        if (excludeAdult && box.classList.contains('api-adult')) box.checked=false;
        else box.checked = selectAll;
    });
    updateSelectedAPIs();
    checkAdultAPIsSelected();
}

// 显示添加自定义API表单
function showAddCustomApiForm() {
    const form = document.getElementById('addCustomApiForm');
    if (form) form.classList.remove('hidden');
}

// 取消添加自定义API
function cancelAddCustomApi() {
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.classList.add('hidden');
        document.getElementById('customApiName').value = '';
        document.getElementById('customApiUrl').value = '';
        const isAdultInput = document.getElementById('customApiIsAdult');
        if (isAdultInput) isAdultInput.checked = false;
        
        // 确保按钮是添加按钮
        restoreAddCustomApiButtons();
    }
}

// 添加自定义API
function addCustomApi() {
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');
    
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const isAdult = isAdultInput ? isAdultInput.checked : false;
    
    if (!name || !url) {
        showToast('请输入API名称和链接', 'warning');
        return;
    }
    
    // 确保URL格式正确
    if (!/^https?:\/\/.+/.test(url)) {
        showToast('API链接格式不正确，需以http://或https://开头', 'warning');
        return;
    }
    
    // 移除URL末尾的斜杠
    if (url.endsWith('/')) url = url.slice(0, -1);
    
    // 添加到自定义API列表 - 增加isAdult属性
    customAPIs.push({ name, url, isAdult });
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    
    // 默认选中新添加的API
    const newApiIndex = customAPIs.length - 1;
    selectedAPIs.push('custom_' + newApiIndex);
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
    
    // 重新渲染自定义API列表
    renderCustomAPIsList();
    
    // 更新选中的API数量
    updateSelectedApiCount();
    
    // 重新检查成人API选中状态
    checkAdultAPIsSelected();
    
    // 清空表单并隐藏
    nameInput.value = '';
    urlInput.value = '';
    if (isAdultInput) isAdultInput.checked = false;
    document.getElementById('addCustomApiForm').classList.add('hidden');
    
    showToast('已添加自定义API: ' + name, 'success');
}

// 移除自定义API
function removeCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;
    
    const apiName = customAPIs[index].name;
    
    // 从列表中移除API
    customAPIs.splice(index, 1);
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    
    // 从选中列表中移除此API
    selectedAPIs = selectedAPIs.filter(id => id !== 'custom_' + index);
    
    // 更新大于此索引的自定义API索引
    selectedAPIs = selectedAPIs.map(id => {
        if (id.startsWith('custom_')) {
            const currentIndex = parseInt(id.replace('custom_', ''));
            if (currentIndex > index) {
                return 'custom_' + (currentIndex - 1);
            }
        }
        return id;
    });
    
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
    
    // 重新渲染自定义API列表
    renderCustomAPIsList();
    
    // 更新选中的API数量
    updateSelectedApiCount();
    
    // 重新检查成人API选中状态
    checkAdultAPIsSelected();
    
    showToast('已移除自定义API: ' + apiName, 'info');
}

// ===================== 事件监听总线 ========================

function setupEventListeners() {
    // 输入框回车搜索
    document.getElementById('searchInput')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') search();
    });
    // 点击外部关闭右侧设置
    document.addEventListener('click', function(e){
        const panel = document.getElementById('settingsPanel');
        const btn   = document.querySelector('button[onclick="toggleSettings(event)"]');
        if (!panel.contains(e.target) && !btn?.contains(e.target) && panel.classList.contains('show')){
            panel.classList.remove('show');
        }
    });
    // 黄色/广告过滤器切换同步到本地
    document.getElementById('yellowFilterToggle')?.addEventListener('change',e=>{
        localStorage.setItem('yellowFilterEnabled',e.target.checked);
    });
    document.getElementById('adFilterToggle')?.addEventListener('change',e=>{
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, e.target.checked);
    });
}

// 重置搜索区域
function resetSearchArea() {
    document.getElementById('results').innerHTML = '';
    document.getElementById('searchInput').value = '';
    
    // 恢复搜索区域的样式
    const searchArea = document.getElementById('searchArea');
    const resultsArea = document.getElementById('resultsArea');
    if (searchArea) {
        searchArea.classList.add('flex-1');
        searchArea.classList.remove('mb-8');
    }
    if (resultsArea) resultsArea.classList.add('hidden');
    
    // 确保页脚正确显示，移除相对定位
    const footer = document.querySelector('.footer');
    if (footer) footer.style.position = '';
    
    // 如果有豆瓣功能，检查是否需要显示豆瓣推荐区域
    if (typeof updateDoubanVisibility === 'function') updateDoubanVisibility();
}

// 获取自定义API信息
function getCustomApiInfo(customApiIndex) {
    const index = parseInt(customApiIndex);
    return isNaN(index) || index < 0 || index >= customAPIs.length ? null : customAPIs[index];
}

// 搜索功能 - 支持多选API
async function search() {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal?.();
            return;
        }
    }
    
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        showToast('请输入搜索内容', 'info');
        return;
    }
    
    if (selectedAPIs.length === 0) {
        showToast('请至少选择一个API源', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        // 保存搜索历史
        saveSearchHistory(query);
        
        // 从所有选中的API源搜索
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
                
                const result = await fetchWithTimeout(PROXY_URL + encodeURIComponent(apiUrl), {
                    headers: API_CONFIG.search.headers
                });
                
                if (!result || !Array.isArray(result.list) || result.list.length === 0) {
                    return [];
                }
                
                // 添加源信息
                return result.list.map(item => ({
                    ...item,
                    source_name: apiName,
                    source_code: apiId,
                    api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
                }));
            } catch (error) {
                console.warn(`API ${apiId} 搜索失败:`, error);
                return [];
            }
        });
        
        // 等待所有搜索请求完成
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        let allResults = [];
        resultsArray.forEach(results => {
            if (Array.isArray(results) && results.length > 0) {
                allResults = [...allResults, ...results];
            }
        });
        
        // 更新搜索结果计数
        const searchResultsCount = document.getElementById('searchResultsCount');
        if (searchResultsCount) searchResultsCount.textContent = allResults.length;
        
        // 显示结果区域，调整搜索区域
        const searchArea = document.getElementById('searchArea');
        const resultsArea = document.getElementById('resultsArea');
        if (searchArea) {
            searchArea.classList.remove('flex-1');
            searchArea.classList.add('mb-8');
        }
        if (resultsArea) resultsArea.classList.remove('hidden');
        
        // 隐藏豆瓣推荐区域（如果存在）
        const doubanArea = document.getElementById('doubanArea');
        if (doubanArea) doubanArea.classList.add('hidden');
        
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;
        
        // 如果没有结果
        if (allResults.length === 0) {
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
        
        // 处理搜索结果过滤：如果启用了黄色内容过滤，过滤掉敏感分类
        const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
        if (yellowFilterEnabled) {
            // 用户要求将banned内容替换为数字123
            const banned = ['伦理片','门事件','萝莉少女','制服诱惑','国产传媒','cosplay','黑丝诱惑','无码','日本无码','有码','日本有码','SWAG','网红主播', '色情片','同性片','福利视频','福利片'];
            allResults = allResults.filter(item => {
                const typeName = item.type_name || '';
                return !banned.some(keyword => typeName.includes(keyword));
            });
        }

        // 添加XSS保护
        const safeResults = allResults.map(item => {
            const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, '') : '';
            const safeName = (item.vod_name || '').toString()
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            
            const sourceInfo = item.source_name 
                ? `<span class="bg-[#222] text-xs px-1.5 py-0.5 rounded-full">${item.source_name}</span>` 
                : '';
            
            const sourceCode = item.source_code || '';
            
            // 修改为水平卡片布局，图片在左侧，文本在右侧，并优化样式
            const hasCover = item.vod_pic && item.vod_pic.startsWith('http');
            
            return {
                safeId,
                safeName,
                sourceInfo,
                sourceCode,
                hasCover,
                html: `
                <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full shadow-sm hover:shadow-md" 
                     onclick="showDetails('${safeId}','${safeName}','${sourceCode}')" ${apiUrlAttr}>
                    <div class="flex h-full">
                        ${hasCover ? `
                        <div class="relative flex-shrink-0 search-card-img-container">
                            <img src="${item.vod_pic}" alt="${safeName}" 
                                 class="h-full w-full object-cover transition-transform hover:scale-110" 
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=无封面'; this.classList.add('object-contain');" 
                                 loading="lazy">
                            <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>
                        </div>` : ''}
                        
                        <div class="p-2 flex flex-col flex-grow">
                            <div class="flex-grow">
                                <h3 class="font-semibold mb-2 break-words line-clamp-2 ${hasCover ? '' : 'text-center'}" title="${safeName}">${safeName}</h3>
                                
                                <div class="flex flex-wrap ${hasCover ? '' : 'justify-center'} gap-1 mb-2">
                                    ${(item.type_name || '').toString().replace(/</g, '&lt;') ? 
                                      `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">
                                          ${(item.type_name || '').toString().replace(/</g, '&lt;')}
                                      </span>` : ''}
                                    ${(item.vod_year || '') ? 
                                      `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">
                                          ${item.vod_year}
                                      </span>` : ''}
                                </div>
                                <p class="text-gray-400 line-clamp-2 overflow-hidden ${hasCover ? '' : 'text-center'} mb-2">
                                    ${(item.vod_remarks || '暂无介绍').toString().replace(/</g, '&lt;')}
                                </p>
                            </div>
                            
                            <div class="flex justify-between items-center mt-1 pt-1 border-t border-gray-800">
                                ${sourceInfo ? `<div>${sourceInfo}</div>` : '<div></div>'}
                                <div>
                                    <span class="text-gray-500 flex items-center hover:text-blue-400 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        </svg>
                                        播放
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                `
            };
        });
        
        // 添加到DOM
        resultsDiv.innerHTML = safeResults.map(result => result.html).join('');
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

// 显示详情 - 支持自定义API
async function showDetails(id, vod_name, sourceCode) {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal?.();
            return;
        }
    }
    
    if (!id) {
        showToast('视频ID无效', 'error');
        return;
    }
    
    showLoading();
    
    try {
        // 构建API参数
        let apiParams = '';
        
        // 处理自定义API源
        if (sourceCode.startsWith('custom_')) {
            const customIndex = sourceCode.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) {
                showToast('自定义API配置无效', 'error');
                hideLoading();
                return;
            }
            
            apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
        } else {
            // 内置API
            apiParams = '&source=' + sourceCode;
        }
        
        const response = await fetch('/api/detail?id=' + encodeURIComponent(id) + apiParams);
        const data = await response.json();
        
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        
        // 显示来源信息
        const sourceName = data.videoInfo?.source_name ? 
            ` <span class="text-sm font-normal text-gray-400">(${data.videoInfo.source_name})</span>` : '';
        
        modalTitle.innerHTML = `<span class="break-words">${vod_name || '未知视频'}</span>${sourceName}`;
        currentVideoTitle = vod_name || '未知视频';
        
        if (data.episodes && data.episodes.length > 0) {
            // 安全处理集数URL
            const safeEpisodes = data.episodes.map(url => {
                try {
                    return url && (url.startsWith('http://') || url.startsWith('https://')) 
                        ? url.replace(/"/g, '&quot;') 
                        : '';
                } catch (e) {
                    return '';
                }
            }).filter(url => url);
            
            // 保存当前视频的所有集数
            currentEpisodes = safeEpisodes;
            episodesReversed = false; // 默认正序
            
            modalContent.innerHTML = `
                <div class="flex justify-end mb-2">
                    <button onclick="toggleEpisodeOrder('${sourceCode}')" 
                            class="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M11 10.586V7h3v3.586l2.134 2.134M12 18a8 8 0 110-16 8 8 0 0116 0z" />
                        </svg>
                        <span>倒序排列</span>
                    </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodes(vod_name, sourceCode)}
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

// 更新播放视频函数，修改为在新标签页中打开播放页面，并保存到历史记录
function playVideo(url, vod_name, sourceCode, episodeIndex = 0) {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal?.();
            return;
        }
    }
    
    if (!url) {
        showToast('无效的视频链接', 'error');
        return;
    }
    
    // 获取当前视频来源名称
    let sourceName = '';
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        const sourceSpan = modalTitle.querySelector('span.text-gray-400');
        if (sourceSpan) {
            // 提取括号内的来源名称
            const sourceText = sourceSpan.textContent;
            const match = sourceText.match(/\(([^)]+)\)/);
            if (match && match[1]) {
                sourceName = match[1].trim();
            }
        }
    }
    
    // 保存当前状态到localStorage，让播放页面可以获取
    const currentVideoTitle = vod_name;
    localStorage.setItem('currentVideoTitle', currentVideoTitle);
    localStorage.setItem('currentEpisodeIndex', episodeIndex);
    localStorage.setItem('currentEpisodes', JSON.stringify(currentEpisodes));
    localStorage.setItem('episodesReversed', episodesReversed);
    
    // 构建视频信息对象
    const videoInfo = {
        title: currentVideoTitle,
        url: url,
        episodeIndex: episodeIndex,
        sourceName: sourceName,
        timestamp: Date.now(),
        episodes: currentEpisodes && currentEpisodes.length > 0 ? [...currentEpisodes] : []
    };
    
    // 保存到观看历史
    if (typeof addToViewingHistory === 'function') {
        addToViewingHistory(videoInfo);
    }
    
    // 构建播放页面URL
    const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(currentVideoTitle)}&index=${episodeIndex}&source=${encodeURIComponent(sourceName)}&source_code=${encodeURIComponent(sourceCode)}`;
    
    // 在新标签页中打开播放页面
    window.location.href = playerUrl;
}

// 播放上一集
function playPreviousEpisode(sourceCode) {
    if (currentEpisodeIndex > 0) {
        const prevIndex = currentEpisodeIndex - 1;
        const prevUrl = currentEpisodes[prevIndex];
        playVideo(prevUrl, currentVideoTitle, sourceCode, prevIndex);
    }
}

// 播放下一集
function playNextEpisode(sourceCode) {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        const nextIndex = currentEpisodeIndex + 1;
        const nextUrl = currentEpisodes[nextIndex];
        playVideo(nextUrl, currentVideoTitle, sourceCode, nextIndex);
    }
}

// 处理播放器加载错误
function handlePlayerError() {
    hideLoading();
    showToast('视频播放加载失败，请尝试其他视频源', 'error');
}

// 辅助函数用于渲染剧集按钮（使用当前的排序状态）
function renderEpisodes(vodName, sourceCode) {
    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    return episodes.map((episode, index) => {
        // 根据倒序状态计算真实的剧集索引
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        return `
            <button id="episode-${realIndex}" onclick="playVideo('${episode}','${vodName.replace(/"/g, '&quot;')}', '${sourceCode}', ${realIndex})" 
                    class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">
                第${realIndex + 1}集
            </button>
        `;
    }).join('');
}

// 切换排序状态的函数
function toggleEpisodeOrder(sourceCode) {
    episodesReversed = !episodesReversed;
    
    // 重新渲染剧集区域
    const episodesGrid = document.getElementById('episodesGrid');
    if (episodesGrid) {
        episodesGrid.innerHTML = renderEpisodes(currentVideoTitle, sourceCode);
    }
    
    // 更新按钮文本和箭头方向
    const toggleBtn = document.querySelector(`button[onclick="toggleEpisodeOrder('${sourceCode}')"]`);
    if (toggleBtn) {
        const span = toggleBtn.querySelector('span');
        const svg = toggleBtn.querySelector('svg');
        if (span) span.textContent = episodesReversed ? '正序排列' : '倒序排列';
        if (svg) svg.style.transform = episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}


