document.addEventListener('click', function(e) {
    const card = e.target.closest('.card-hover');
    if (card && card.dataset.videoId && card.dataset.source) {
        const results = document.getElementById('results');
        if (results && results.contains(card)) {
            showDetails(card.dataset.videoId, card.querySelector('h3')?.textContent || '', card.dataset.source);
        }
    }
});
import {
    PROXY_URL, API_SITES, HIDE_BUILTIN_ADULT_APIS, PLAYER_CONFIG
} from './config.js';
import {
    showToast, showLoading, hideLoading, renderSearchHistory
} from './ui.js';
import {
    isPasswordProtected, isPasswordVerified, showPasswordModal
} from './password.js';

import {
    getState,
    updateSelectedAPIs,
    updateCustomAPIs,
    setSetting,
    addSearchHistoryItem,
    addViewingHistoryItem,
    deleteViewingHistoryItem,
    clearViewingHistoryStore,
    clearSearchHistoryStore,
    setUIState
} from './store.js';

import { searchVideos, getVideoDetails } from './apiService.js';
import { createSearchResultCardElement } from './components/SearchResultCard.js';
import { createApiCheckboxElement } from './components/ApiCheckbox.js';
import { createCustomApiListItemElement } from './components/CustomApiListItem.js';

// ========== 当前页面局部状态 ==========
let currentEpisodes = [];
let currentVideoTitle = '';
let episodesReversed = false;


// ========== 页面初始化 ==========
document.addEventListener('DOMContentLoaded', function() {
    // 1. API 和自定义 API 复选框
    initAPICheckboxes();
    renderCustomAPIsList();
    updateSelectedApiCount();

    // 2. 渲染搜索历史
    renderSearchHistory();

    // 3. UI控制按钮注册
    document.getElementById('settingsBtn')?.addEventListener('click', toggleSettings);
    document.getElementById('historyBtn')?.addEventListener('click', toggleHistory);
    document.getElementById('settingsPanelClose')?.addEventListener('click', toggleSettings);
    document.getElementById('historyPanelClose')?.addEventListener('click', toggleHistory);

    document.getElementById('clearViewingHistoryBtn')?.addEventListener('click', clearViewingHistory);

    document.getElementById('selectAllAPIsBtn')?.addEventListener('click', () => selectAllAPIs(true));
    document.getElementById('selectNoneAPIsBtn')?.addEventListener('click', () => selectAllAPIs(false));
    document.getElementById('selectNormalAPIsBtn')?.addEventListener('click', () => selectAllAPIs(true, true));

    document.getElementById('showAddCustomApiFormBtn')?.addEventListener('click', showAddCustomApiForm);

    document.getElementById('addCustomApiForm')?.addEventListener('submit', function(e){
        e.preventDefault();
        addCustomApi();
    });
    document.getElementById('addCustomApiFormCancel')?.addEventListener('click', cancelAddCustomApi);

    // 搜索表单
    document.getElementById('searchForm')?.addEventListener('submit', e => {
        e.preventDefault();
        search();
    });

    // API复选框与自定义API列表 事件委托
    document.getElementById('apiCheckboxes')?.addEventListener('change', e => {
        if (e.target.type === 'checkbox' && e.target.dataset.api) {
            updateSelectedAPIs(getCheckedAPIs());
            checkAdultAPIsSelected();
        }
    });
    document.getElementById('customApisList')?.addEventListener('change', e => {
        if (e.target.type === 'checkbox' && e.target.dataset.customIndex) {
            updateSelectedAPIs(getCheckedAPIs());
            checkAdultAPIsSelected();
        }
    });
    document.getElementById('customApisList')?.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx || btn.dataset.customindex, 10);
        if (btn.textContent === '✎' && !isNaN(idx)) editCustomApi(idx);
        if (btn.textContent === '✕' && !isNaN(idx)) removeCustomApi(idx);
    });



// ===================== 组件式 API & 数据源 =====================

// 动态渲染所有 API 复选框
function initAPICheckboxes() {
    const container = document.getElementById('apiCheckboxes');
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(renderApiGroupTitle('普通资源'));
    Object.entries(API_SITES).forEach(([apiKey, api]) => {
        if (!api.adult) {
            const checkbox = createApiCheckboxElement(
                { name: api.name, key: apiKey, isAdult: !!api.adult },
                getState().selectedAPIs.includes(apiKey),
                false,
                (checked, key) => { updateApiSelection(key, checked); }
            );
            container.appendChild(checkbox);
        }
    });
    if (!HIDE_BUILTIN_ADULT_APIS) {
        container.appendChild(renderApiGroupTitle('黄色资源采集站', true));
        Object.entries(API_SITES).forEach(([apiKey, api]) => {
            if (api.adult) {
                const checkbox = createApiCheckboxElement(
                    { name: api.name, key: apiKey, isAdult: !!api.adult },
                    getState().selectedAPIs.includes(apiKey),
                    false,
                    (checked, key) => { updateApiSelection(key, checked); }
                );
                container.appendChild(checkbox);
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

function updateApiSelection(key, checked) {
    const curr = new Set(getState().selectedAPIs);
    checked ? curr.add(key) : curr.delete(key);
    updateSelectedAPIs([...curr]);
}
function getCheckedAPIs() {
    const builtIn = Array.from(document.querySelectorAll('#apiCheckboxes input:checked')).map(i => i.dataset.api);
    const custom = Array.from(document.querySelectorAll('#customApisList input:checked')).map(i => 'custom_' + i.dataset.customIndex);
    return [...builtIn, ...custom];
}
function updateSelectedApiCount() {
    const el = document.getElementById('selectedApiCount');
    if (el) el.textContent = getState().selectedAPIs.length;
}
function selectAllAPIs(selectAll = true, excludeAdult = false) {
    const boxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');
    boxes.forEach(cb => {
        if (excludeAdult && cb.classList.contains('api-adult')) cb.checked = false;
        else cb.checked = selectAll;
    });
    updateSelectedAPIs(getCheckedAPIs());
    checkAdultAPIsSelected();
}

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

function renderCustomAPIsList() {
    const container = document.getElementById('customApisList');
    if (!container) return;
    const customAPIs = getState().customAPIs;
    if (!customAPIs.length) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
        return;
    }
    container.innerHTML = '';
    customAPIs.forEach((api, idx) => {
        const item = createCustomApiListItemElement(
            api, idx,
            () => editCustomApi(idx),
            () => removeCustomApi(idx)
        );
        container.appendChild(item);
    });
}

// ==== 自定义API增/删/编辑 ====
function showAddCustomApiForm() {
    document.getElementById('addCustomApiForm').classList.remove('hidden');
    document.getElementById('showAddCustomApiFormBtn').disabled = true;
    document.getElementById('customApiName').focus();
}
function cancelAddCustomApi() {
    document.getElementById('addCustomApiForm').classList.add('hidden');
    document.getElementById('showAddCustomApiFormBtn').disabled = false;
    document.getElementById('customApiName').value = '';
    document.getElementById('customApiUrl').value = '';
    document.getElementById('customApiIsAdult').checked = false;
}

// ...（自定义API添加、编辑、删除实现，由于字数限制，下一条继续）...



// ==== 自定义 API 管理 ====

function addCustomApi() {
    const name = document.getElementById('customApiName').value.trim();
    const url = document.getElementById('customApiUrl').value.trim();
    const isAdult = document.getElementById('customApiIsAdult').checked;
    if (!name || !url) {
        showToast('API名称和URL不能为空', 'warning');
        return;
    }
    const customAPIs = getState().customAPIs.slice();
    if (customAPIs.some(api => api.name === name || api.url === url)) {
        showToast('API名称或URL已存在', 'info');
        return;
    }
    customAPIs.push({ name, url, isAdult });
    updateCustomAPIs(customAPIs);
    cancelAddCustomApi();
    renderCustomAPIsList();
    showToast('自定义API已添加', 'success');
}
function editCustomApi(idx) {
    const customAPIs = getState().customAPIs;
    const info = customAPIs[idx];
    if (!info) return;
    document.getElementById('addCustomApiForm').classList.remove('hidden');
    document.getElementById('showAddCustomApiFormBtn').disabled = true;
    document.getElementById('customApiName').value = info.name;
    document.getElementById('customApiUrl').value = info.url;
    document.getElementById('customApiIsAdult').checked = !!info.isAdult;
    document.getElementById('addCustomApiFormSubmit').onclick = function(e) {
        e.preventDefault();
        const name = document.getElementById('customApiName').value.trim();
        const url = document.getElementById('customApiUrl').value.trim();
        const isAdult = document.getElementById('customApiIsAdult').checked;
        if (!name || !url) {
            showToast('API名称和URL不能为空', 'warning');
            return;
        }
        const updated = getState().customAPIs.slice();
        updated[idx] = { name, url, isAdult };
        updateCustomAPIs(updated);
        cancelAddCustomApi();
        renderCustomAPIsList();
        showToast('已更新自定义API', 'success');
        document.getElementById('addCustomApiFormSubmit').onclick = null;
        return false;
    };
}
function removeCustomApi(idx) {
    if (!confirm('确定删除此API？')) return;
    const updated = getState().customAPIs.slice();
    updated.splice(idx, 1);
    updateCustomAPIs(updated);
    renderCustomAPIsList();
    showToast('已删除自定义API', 'success');
}


// =========== 搜索流程 ===========
export function search() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return showToast('请输入搜索内容', 'info');

    const selectedAPIs = getState().selectedAPIs;
    if (!selectedAPIs || !selectedAPIs.length) {
        showToast('请在设置中至少选择一个API源', 'warning');
        hideLoading();
        return;
    }

    showLoading();
    addSearchHistoryItem(query);

    // 调试日志，生产可移除
    console.log('[search] 发起，query:', query, 'selectedAPIs:', selectedAPIs);

    searchVideos(query, selectedAPIs).then(res => {
        let allResults = Array.isArray(res.list) ? res.list : [];
        showSearchResults(allResults);
    }).catch(e => {
        showToast('搜索请求失败，请稍后重试', 'error');
    }).finally(() => hideLoading());
}

// ========== 搜索结果UI渲染 ==========
function showSearchResults(allResults) {
    renderSearchHistory();
    const resultsDiv = document.getElementById('results');
    allResults = filterResultsByYellow(allResults);
    resultsDiv.innerHTML = '';
    if (allResults.length) {
        allResults.forEach(item => {
            const card = createSearchResultCardElement(item);
            resultsDiv.appendChild(card);
        });
        document.getElementById('resultsArea').classList.remove('hidden');
    } else {
        resultsDiv.innerHTML = renderNoResultsHtml();
        document.getElementById('resultsArea').classList.remove('hidden');
    }
}

function showSearchUI() {
    document.getElementById('resultsArea').classList.remove('hidden');
}
function renderNoResultsHtml() {
    return `<div class="col-span-full text-center text-gray-400 py-12 text-lg">没有找到相关视频</div>`;
}

// ========== 黄色过滤逻辑 ==========
function filterResultsByYellow(results) {
    const yellowFilter = getState().settings.yellowFilterEnabled;
    if (!yellowFilter) return results;
    return results.filter(item =>
        !/伦理片|伦理|无码|人妻|骚|激情|调教|制服|爆乳|换妻|老熟妇|巨乳|A片|自慰|萝莉|淫乱|AV|成人|一级毛片|视频门/.test(
            item.vod_name + item.type_name
        )
    );
}


// ========== 详情展示 ==========
async function showDetails(id, vod_name, sourceCode) {
    if (isPasswordProtected() && !isPasswordVerified()) {
        showPasswordModal();
        return;
    }
    if (!id) return showToast('视频ID无效', 'error');
    showLoading();
    try {
        let customApiConfig = null;
        if (sourceCode.startsWith('custom_')) {
            const customIndex = sourceCode.replace('custom_', '');
            customApiConfig = getState().customAPIs[customIndex];
            if (!customApiConfig) {
                showToast('自定义API配置无效', 'error');
                hideLoading();
                return;
            }
        }
        const res = await getVideoDetails(
            id, sourceCode, customApiConfig
        );
        const data = res || {};
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        const sourceName = data.videoInfo && data.videoInfo.source_name
            ? ` <span class="text-sm font-normal text-gray-400">(${data.videoInfo.source_name})</span>` : '';
        modalTitle.innerHTML = `<span class="break-words">${vod_name || '未知视频'}</span>${sourceName}`;
        currentVideoTitle = vod_name || '未知视频';
        currentEpisodes = data.episodes && data.episodes.length ? data.episodes.filter(u => /^https?:\/\//.test(u)) : [];
        episodesReversed = false;
        if (currentEpisodes.length) {
            modalContent.innerHTML = `
                <div class="flex justify-end mb-2">
                    <button id="toggleEpisodeOrderBtn" type="button" class="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
                        </svg>
                        <span>倒序排列</span>
                    </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodes(currentVideoTitle)}
                </div>`;
            document.getElementById('toggleEpisodeOrderBtn')?.addEventListener('click', toggleEpisodeOrder);
            document.getElementById('episodesGrid')?.addEventListener('click', function(ev) {
                const btn = ev.target.closest('button[data-episode-idx]');
                if (btn) playEpisodeFromModal(parseInt(btn.dataset.episodeIdx, 10));
            });
        } else {
            modalContent.innerHTML = '<p class="text-center text-gray-400 py-8">没有找到可播放的视频</p>';
        }
        modal.classList.remove('hidden');
    } catch (e) {
        showToast('获取详情失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

function renderEpisodes(title) {
    if (!currentEpisodes.length) return '';
    const list = episodesReversed ? currentEpisodes.slice().reverse() : currentEpisodes;
    return list.map((ep, i) => {
        const number = episodesReversed ? currentEpisodes.length - i : i + 1;
        return `<button type="button" data-episode-idx="${number - 1}" class="bg-[#222] hover:bg-[#444] text-white text-xs px-3 py-2 rounded shadow mr-1 mb-2 transition duration-200">${number}</button>`
    }).join('');
}
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    const grid = document.getElementById('episodesGrid');
    if (grid) grid.innerHTML = renderEpisodes(currentVideoTitle);
}
function playEpisodeFromModal(idx) {
    const url = currentEpisodes[idx];
    window.playFromHistory(url, currentVideoTitle, idx, 0);
}

// ========== 响应全局状态变化 ==========

document.addEventListener('stateChange', e => {
    const keys = e.detail.changedKeys || [];
    if (keys.includes('selectedAPIs')) updateSelectedApiCount();
    if (keys.includes('customAPIs')) renderCustomAPIsList();
    if (keys.includes('searchHistory')) renderSearchHistory();
    if (keys.includes('viewingHistory')) window.loadViewingHistory();
    // 其它 keys 可根据需要补充
});
