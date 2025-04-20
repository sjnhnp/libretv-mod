console.log('API_SITES 加载:', window.API_SITES);
// ========== 全局状态 ==========
const state = {
    selectedAPIs: safeParseArray(localStorage.getItem('selectedAPIs')) ?? ['heimuer'],
    customAPIs: safeParseArray(localStorage.getItem('customAPIs')) ?? [],
    currentEpisodeIndex: 0,
    currentEpisodes: [],
    currentVideoTitle: '',
    episodesReversed: false
};

// ========== 元素缓存 ==========
const els = {
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

// ========== 页面初始化 ==========
document.addEventListener('DOMContentLoaded', init);

function init() {
    initAPICheckboxes();
    renderCustomAPIsList();
    updateSelectedApiCount();
    renderSearchHistory();
    initializeDefaultSettings();
    setupEventListeners();
    setTimeout(checkAdultAPIsSelected, 100);
}

function safeParseArray(str) {
    try {
        let r = JSON.parse(str);
        return Array.isArray(r) ? r : [];
    } catch { return []; }
}
function initializeDefaultSettings() {
    if (!localStorage.getItem('hasInitializedDefaults')) {
        state.selectedAPIs = ["heimuer"];
        localStorage.setItem('selectedAPIs', JSON.stringify(state.selectedAPIs));
        localStorage.setItem('yellowFilterEnabled', 'true');
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, 'true');
        localStorage.setItem('hasInitializedDefaults', 'true');
    }
    if (els.yellowFilterToggle)
        els.yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') !== 'false';
    if (els.adFilterToggle)
        els.adFilterToggle.checked = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false';
}

// ========== API复选框区域 ==========
function initAPICheckboxes() {
    const frag = document.createDocumentFragment();
    addAPIGroup(frag, false);  // 普通
    if (!HIDE_BUILTIN_ADULT_APIS) addAPIGroup(frag, true); // 成人
    els.apiCheckboxes.innerHTML = '';
    els.apiCheckboxes.appendChild(frag);
    checkAdultAPIsSelected();
}

function addAPIGroup(container, isAdult) {
    const title = document.createElement('div');
    title.className = `api-group-title${isAdult ? ' adult' : ''}`;
    title.textContent = isAdult ? '黄色资源采集站' : '普通资源';
    if (isAdult) title.innerHTML += ` <span class="adult-warning"><svg xmlns="http://www.w3.org/2000/svg" ... /></span>`;
    container.appendChild(title);

    Object.entries(API_SITES).forEach(([apiKey, api]) => {
        if (api.adult !== isAdult) return;
        const el = createAPICheckbox(apiKey, api);
        container.appendChild(el);
    });
}

function createAPICheckbox(apiKey, api) {
    const box = document.createElement('div');
    box.className = 'flex items-center';
    box.innerHTML = `
        <input type="checkbox" id="api_${apiKey}" 
            class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]${api.adult ? ' api-adult' : ''}" 
            ${state.selectedAPIs.includes(apiKey) ? 'checked' : ''} 
            data-api="${apiKey}">
        <label for="api_${apiKey}" class="ml-1 text-xs ${api.adult ? 'text-pink-400' : 'text-gray-400'} truncate">${api.name}</label>
    `;
    box.querySelector('input').addEventListener('change', () => {
        updateSelectedAPIs();
        checkAdultAPIsSelected();
    });
    return box;
}

// ========== 自定义APIs渲染 ==========
function renderCustomAPIsList() {
    if (!els.customApisList) return;
    if (!state.customAPIs.length) {
        els.customApisList.innerHTML = '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
        return;
    }
    const frag = document.createDocumentFragment();
    state.customAPIs.forEach((api, idx) => {
        const e = createCustomAPIItem(api, idx);
        frag.appendChild(e);
    });
    els.customApisList.innerHTML='';
    els.customApisList.appendChild(frag);
}
function createCustomAPIItem(api, idx) {
    const apiItem = document.createElement('div');
    apiItem.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
    const txtClass = api.isAdult ? 'text-pink-400' : 'text-white';
    const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';
    apiItem.innerHTML = `
        <div class="flex items-center flex-1 min-w-0">
            <input type="checkbox" id="custom_api_${idx}" 
                   class="form-checkbox h-3 w-3 text-blue-600 mr-1 ${api.isAdult ? 'api-adult' : ''}" 
                   ${state.selectedAPIs.includes('custom_' + idx) ? 'checked' : ''} 
                   data-custom-index="${idx}">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-medium ${txtClass} truncate">${adultTag}${api.name||''}</div>
                <div class="text-xs text-gray-500 truncate">${api.url||''}</div>
            </div>
        </div>
        <div class="flex items-center">
            <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="editCustomApi(${idx})">✎</button>
            <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="removeCustomApi(${idx})">✕</button>
        </div>`;
    apiItem.querySelector('input').addEventListener('change', ()=>{
        updateSelectedAPIs();
        checkAdultAPIsSelected();
    });
    return apiItem;
}

// ========== API勾选状态 ==========
function updateSelectedAPIs() {
    const builtInApiCheckboxes = document.querySelectorAll('#apiCheckboxes input:checked');
    const customApiCheckboxes = document.querySelectorAll('#customApisList input:checked');
    const builtInApis = Array.from(builtInApiCheckboxes).map(input=>input.dataset.api);
    const customApiIndices = Array.from(customApiCheckboxes).map(input=>'custom_'+input.dataset.customIndex);
    state.selectedAPIs = [...builtInApis, ...customApiIndices];
    localStorage.setItem('selectedAPIs', JSON.stringify(state.selectedAPIs));
    updateSelectedApiCount();
}
function updateSelectedApiCount() {
    if (els.selectedApiCount) els.selectedApiCount.textContent = state.selectedAPIs.length;
}

// ========== 搜索核心 ==========
// 1.入口
async function search() {
    if (window.isPasswordProtected&&window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }
    const query = els.searchInput.value.trim();
    if(!query) { showToast('请输入搜索内容', 'info'); return;}
    if(!state.selectedAPIs.length){ showToast('请至少选择一个API源','warning'); return;}
    showLoading();
    try{
        saveSearchHistory(query);
        const allResults = await searchAllAPIs(query);
        displaySearchResults(allResults);
    } catch (err){
        console.error('搜索错误:', err);
        showToast('搜索过程中发生错误', 'error');
    } finally {hideLoading();}
}
async function searchAllAPIs(query) {
    const searchPromises = state.selectedAPIs.map(apiId=>searchSingleAPI(apiId,query));
    const arrs = await Promise.all(searchPromises);
    return arrs.flat();
}
async function searchSingleAPI(apiId, query){
    try{
        const { apiUrl, apiName } = getAPIInfo(apiId);
        const controller = new AbortController();
        const timeoutId = setTimeout(()=>controller.abort(), 8000);
        const response = await fetch(PROXY_URL+encodeURIComponent(apiUrl+encodeURIComponent(query)), {
            headers: API_CONFIG.search.headers,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.list)) throw new Error('API返回的数据格式无效');
        return data.list.map(item=>({
            ...item,
            source_name: apiName,
            source_code: apiId,
            api_url: apiId.startsWith('custom_')?getCustomApiInfo(apiId.replace('custom_',''))?.url:undefined
        }));
    }catch(e){
        console.warn(`API ${apiId} 搜索失败:`, e);
        return [];
    }
}
function getAPIInfo(apiId){
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
function displaySearchResults(allResults) {
    els.searchArea.classList.remove('flex-1');
    els.searchArea.classList.add('mb-8');
    els.resultsArea.classList.remove('hidden');
    if (!allResults?.length) { displayNoResults(); return; }
    // 过滤黄色
    const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
    let results = yellowFilterEnabled?filterYellowContent(allResults):allResults;
    els.results.innerHTML = results.map(createResultHTML).join('');
}
function filterYellowContent(results){
    const banned = ['伦理片','门事件','萝莉少女','制服诱惑','国产传媒','cosplay','黑丝诱惑','无码','日本无码','有码','日本有码','SWAG','网红主播', '色情片','同性片','福利视频','福利片'];
    return results.filter(item=>!(item.type_name&&banned.some(word=>item.type_name.includes(word))));
}
function displayNoResults() {
    els.results.innerHTML = `<div class="col-span-full text-center py-16">
        <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 class="mt-2 text-lg font-medium text-gray-400">没有找到匹配的结果</h3><p class="mt-1 text-sm text-gray-500">请尝试其他关键词或更换数据源</p>
    </div>`;
}
function createResultHTML(item){
    // 做转义
    const safeId = (item.vod_id||'').toString().replace(/[^\w-]/g, '');
    const safeName = escapeHTML(item.vod_name||'');
    const safeType = escapeHTML(item.type_name||'');
    const safeYear = (item.vod_year||'').toString();
    const safeRemarks = escapeHTML(item.vod_remarks||'暂无介绍');
    const sourceName = escapeHTML(item.source_name||'');
    const sourceCode = item.source_code||'';
    const apiUrlAttr = item.api_url?`data-api-url="${escapeAttribute(item.api_url)}"`:'';
    const hasCover = item.vod_pic&&/^https?:\/\//.test(item.vod_pic);
    return `<div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full" 
             onclick="showDetails('${safeId}','${safeName}','${sourceCode}')" ${apiUrlAttr}>
        <div class="md:flex">
            ${hasCover?`
            <div class="md:w-1/4 relative overflow-hidden">
                <div class="w-full h-40 md:h-full">
                    <img src="${escapeAttribute(item.vod_pic)}" alt="${safeName}" class="w-full h-full object-cover transition-transform hover:scale-110" 
                        onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=无封面'; this.classList.add('object-contain');" loading="lazy">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent opacity-60"></div>
                </div>
            </div>`:''}
            <div class="p-3 flex flex-col flex-grow ${hasCover?'md:w-3/4':'w-full'}">
                <div class="flex-grow">
                    <h3 class="text-lg font-semibold mb-2 break-words">${safeName}</h3>
                    <div class="flex flex-wrap gap-1 mb-2">
                        ${safeType?`<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">${safeType}</span>`:''}
                        ${safeYear?`<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">${safeYear}</span>`:''}
                    </div>
                    <p class="text-gray-400 text-xs h-9 overflow-hidden">${safeRemarks}</p>
                </div>
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
                    ${sourceName?`<div><span class="bg-[#222] text-xs px-2 py-1 rounded-full">${sourceName}</span></div>`:'<div></div>'}
                    <div><span class="text-xs text-gray-500 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1".../>
                        点击播放
                    </span></div>
                </div>
            </div>
        </div>
    </div>`;
}
function escapeHTML(str){
    return (str||'').toString()
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeAttribute(str){
    return (str||'').toString()
        .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ========== 详情/播放 ==========
async function showDetails(id, vod_name, sourceCode){
    if(window.isPasswordProtected && window.isPasswordVerified){
        if(window.isPasswordProtected() && !window.isPasswordVerified()){
            showPasswordModal && showPasswordModal();
            return;
        }
    }
    if(!id){ showToast('视频ID无效', 'error'); return; }
    showLoading();
    try{
        const apiParams = buildDetailParams(sourceCode);
        const response = await fetch('/api/detail?id=' + encodeURIComponent(id)+apiParams);
        const data = await response.json();
        const modal=document.getElementById('modal');
        const modalTitle=document.getElementById('modalTitle'), modalContent=document.getElementById('modalContent');
        const sourceName = data.videoInfo&&data.videoInfo.source_name?` <span class="text-sm font-normal text-gray-400">(${escapeHTML(data.videoInfo.source_name)})</span>`:'';
        modalTitle.innerHTML = `<span class="break-words">${escapeHTML(vod_name) || '未知视频'}</span>${sourceName}`;
        state.currentVideoTitle = vod_name || '未知视频';
        if(data.episodes && data.episodes.length){
            const safeEpisodes = data.episodes.map(url=>(/^https?:\/\//.test(url)?url.replace(/"/g,'&quot;'):'')).filter(Boolean);
            state.currentEpisodes = safeEpisodes; state.episodesReversed=false;
            modalContent.innerHTML = `<div class="flex justify-end mb-2">
                    <button onclick="toggleEpisodeOrder()" class="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5"...></svg> <span>倒序排列</span>
                    </button></div>
            <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                ${renderEpisodes(vod_name)}
            </div>`;
        } else {
            modalContent.innerHTML='<p class="text-center text-gray-400 py-8">没有找到可播放的视频</p>';
        }
        modal.classList.remove('hidden');
    }catch(e){
        console.error('获取详情错误:', e);
        showToast('获取详情失败，请稍后重试', 'error');
    }finally{ hideLoading(); }
}
function buildDetailParams(sourceCode){
    if(sourceCode.startsWith('custom_')){
        const idx = sourceCode.replace('custom_','');
        const customApi = getCustomApiInfo(idx);
        if(!customApi) throw new Error('自定义API配置无效');
        return `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
    }
    return `&source=${encodeURIComponent(sourceCode)}`;
}
// 剧集
function renderEpisodes(vodName){
    const episodes = state.episodesReversed ? [...state.currentEpisodes].reverse() : state.currentEpisodes;
    return episodes.map((episode,idx)=>{
        const realIndex = state.episodesReversed ? state.currentEpisodes.length-1-idx : idx;
        return `<button id="episode-${realIndex}" onclick="playVideo('${episode.replace(/'/g,"\\'").replace(/"/g,'&quot;')}', '${escapeAttribute(vodName)}', ${realIndex})" 
                  class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">
                第${realIndex+1}集
            </button>`;
    }).join('');
}
function toggleEpisodeOrder(){
    state.episodesReversed=!state.episodesReversed;
    const episodesGrid=document.getElementById('episodesGrid');
    if(episodesGrid) episodesGrid.innerHTML=renderEpisodes(state.currentVideoTitle);
    const toggleBtn=document.querySelector('button[onclick="toggleEpisodeOrder()"]');
    if(toggleBtn){
        toggleBtn.querySelector('span').textContent=state.episodesReversed?'正序排列':'倒序排列';
        const arrowIcon=toggleBtn.querySelector('svg');
        if(arrowIcon){arrowIcon.style.transform=state.episodesReversed?'rotate(180deg)':'rotate(0deg)';}
    }
}

// ========== 事件监听 ==========
function setupEventListeners(){
    if (els.searchInput)
        els.searchInput.addEventListener('keypress', e=>{ if(e.key==='Enter') search(); });
    document.addEventListener('click', e=>{
        if(!els.settingsPanel) return;
        const settingsButton=document.querySelector('button[onclick="toggleSettings(event)"]');
        if(!els.settingsPanel.contains(e.target)&&settingsButton&&!settingsButton.contains(e.target)&&els.settingsPanel.classList.contains('show')){
            els.settingsPanel.classList.remove('show');
        }
    });
    if(els.yellowFilterToggle)
        els.yellowFilterToggle.addEventListener('change',e=>{
            localStorage.setItem('yellowFilterEnabled', e.target.checked);
        });
    if(els.adFilterToggle)
        els.adFilterToggle.addEventListener('change',e=>{
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, e.target.checked);
        });
}

// ========== 成人/黄色过滤逻辑 ==========
function checkAdultAPIsSelected(){
    const adultBuiltinCheckboxes=document.querySelectorAll('#apiCheckboxes .api-adult:checked');
    const customApiCheckboxes=document.querySelectorAll('#customApisList .api-adult:checked');
    const hasAdultSelected = adultBuiltinCheckboxes.length>0||customApiCheckboxes.length>0;
    if(!els.yellowFilterToggle) return;
    const tgl=els.yellowFilterToggle,container=tgl.closest('div').parentNode;
    const desc=container.querySelector('p.filter-description');
    if(hasAdultSelected){
        tgl.checked=false; tgl.disabled=true;
        localStorage.setItem('yellowFilterEnabled','false');
        container.classList.add('filter-disabled');
        if(desc){desc.innerHTML='<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';}
        const tt=container.querySelector('.filter-tooltip'); if(tt)tt.remove();
    } else {
        tgl.disabled=false; container.classList.remove('filter-disabled');
        if(desc){desc.innerHTML='过滤"伦理片"等黄色内容';}
        const tt=container.querySelector('.filter-tooltip'); if(tt)tt.remove();
    }
}

// ========== 工具函数 ==========
// 自定义API辅助
function getCustomApiInfo(customApiIndex){
    const index = parseInt(customApiIndex);
    if(isNaN(index)||index<0||index>=state.customAPIs.length) return null;
    return state.customAPIs[index];
}

// (点击事件等留给原有onClick实现)

// ==================== 视频播放相关 =====================

/**
 * 播放视频
 * 供剧集/结果页的“播放”按钮调用（全局暴露给onclick）。
 * @param {string} url         播放地址
 * @param {string} vod_name    视频标题
 * @param {number} episodeIndex 集数索引（可选，默认0）
 */
function playVideo(url, vod_name, episodeIndex = 0) {
    // 若启用密码保护，但尚未校验，则弹出输入框
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return;
        }
    }
    if (!url) {
        showToast && showToast('无效的视频链接', 'error');
        return;
    }

    // 来源站点名自动提取（从模态标题的灰色小字）
    let sourceName = '';
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        const sourceSpan = modalTitle.querySelector('span.text-gray-400');
        if (sourceSpan) {
            const match = /\(([^)]+)\)/.exec(sourceSpan.textContent);
            sourceName = match?.[1]?.trim() || '';
        }
    }

    // 设置本次播放相关历史数据
    localStorage.setItem('currentVideoTitle', vod_name);
    localStorage.setItem('currentEpisodeIndex', episodeIndex);
    localStorage.setItem('currentEpisodes', JSON.stringify(window.state?.currentEpisodes ?? []));
    localStorage.setItem('episodesReversed', window.state?.episodesReversed ?? false);

    // 保存到观看历史（如果已实现该函数）
    const videoInfo = {
        title: vod_name,
        url,
        episodeIndex,
        sourceName,
        timestamp: Date.now(),
        episodes: Array.isArray(window.state?.currentEpisodes) ? [...window.state.currentEpisodes] : []
    };
    if (typeof addToViewingHistory === 'function') {
        addToViewingHistory(videoInfo);
    }

    // 跳转到播放器页面（带参数）
    const playerUrl = `player.html` +
        `?url=${encodeURIComponent(url)}` +
        `&title=${encodeURIComponent(vod_name)}` +
        `&index=${episodeIndex}` +
        `&source=${encodeURIComponent(sourceName)}`;

    window.location.href = playerUrl;
}

// 全局暴露，供HTML按钮onclick调用
window.playVideo = playVideo;


// ================= 数据源相关（API管理） =================

/**
 * 勾选全部内置源及自定义API源
 * 供“全选按钮”调用（全局暴露）
 */
function selectAllAPIs() {
    // 批量选中全部checkbox
    const apiCheckboxes = [
        ...document.querySelectorAll('#apiCheckboxes input[type="checkbox"]'),
        ...document.querySelectorAll('#customApisList input[type="checkbox"]')
    ];
    apiCheckboxes.forEach(cb => { cb.checked = true; });

    // 刷新选中源保存
    updateSelectedAPIs && updateSelectedAPIs();
    checkAdultAPIsSelected && checkAdultAPIsSelected();
}
window.selectAllAPIs = selectAllAPIs;


/**
 * 显示“添加自定义API”弹窗并清空表单
 * 供按钮调用（全局暴露）
 */
function showAddCustomApiForm() {
    // 获取表单控件
    const modal        = document.getElementById('customApiModal');
    const nameInput    = document.getElementById('customApiNameInput');
    const urlInput     = document.getElementById('customApiUrlInput');
    const adultCheckbox = document.getElementById('customApiAdultInput');

    // 显示弹窗
    if (modal) modal.classList.remove('hidden');
    // 清空表单内容
    if (nameInput)    nameInput.value = '';
    if (urlInput)     urlInput.value = '';
    if (adultCheckbox) adultCheckbox.checked = false;
}
window.showAddCustomApiForm = showAddCustomApiForm;

