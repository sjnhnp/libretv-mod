// /js/app.js (Refactored)

import { API_SITES, API_CONFIG, PLAYER_CONFIG, CUSTOM_API_CONFIG, HIDE_BUILTIN_ADULT_APIS } from './config.js';
import { showToast, showLoading, hideLoading, renderSearchHistory as uiRenderSearchHistory, saveSearchHistory as uiSaveSearchHistory, getSearchHistory as uiGetSearchHistory, clearSearchHistory as uiClearSearchHistory } from './ui.js';
// Assuming password functions are globally available via password.js (window.isPasswordProtected, etc.)

// --- State Management ---
// Group related state variables
const appState = {
    selectedAPIs: [],
    customAPIs: [],
    currentDetail: { // Store details relevant after clicking 'Details'
        id: null,
        source: null,
        isCustom: false,
        title: '',
        episodes: [],
        episodesReversed: false,
        videoInfo: null
    },
    // Settings state (loaded from localStorage)
    yellowFilterEnabled: false,
    adFilteringEnabled: false,
    hasInitializedDefaults: false,
    hasSeenDisclaimer: false
};

// --- DOM Element Cache ---
// Cache frequently accessed DOM elements
const domCache = {};
function getElement(selector) {
    if (!domCache[selector]) {
        domCache[selector] = document.querySelector(selector);
        // Basic check if element exists
        if (!domCache[selector]) {
            console.warn(`[DOM Cache] Element not found for selector: ${selector}`);
        }
    }
    return domCache[selector];
}

// Cache elements on script load or DOMContentLoaded
function cacheDOMElements() {
    const selectors = [
        '#searchInput', '#results', '#settingsPanel', '#apiCheckboxes', '#customApisList',
        '#modal', '#modalTitle', '#modalContent', '#modalCloseButton',
        '#yellowFilterToggle', '#adFilterToggle', '#resetSearchButton', '#searchButton',
        '#historyPanel', '#recentSearches', '#clearHistoryButton', '#historyToggle',
        '#addCustomApiForm', '#customApiName', '#customApiUrl', '#customApiKey',
        '#saveCustomApiButton', '#cancelAddCustomApiButton', '#customApiHeaders',
        '#editCustomApiForm', '#editCustomApiName', '#editCustomApiUrl', '#editCustomApiKey',
        '#editCustomApiIndex', '#updateCustomApiButton', '#cancelEditCustomApiButton', '#editCustomApiHeaders',
        '#loadingOverlay' // Assuming #loading is handled by ui.js loading functions
    ];
    selectors.forEach(selector => getElement(selector)); // Populate cache
}

// --- Initialization ---

/**
 * Initializes the application state, loads settings, sets up UI components.
 */
function initializeApp() {
    console.log("Initializing app...");
    cacheDOMElements();
    loadSettings();
    initAPICheckboxes();
    renderCustomAPIsList();
    setupEventListeners(); // Setup core event listeners
    checkPasswordProtection(); // Check password immediately
    checkDisclaimer(); // Check disclaimer

    // Initial render of search history from ui.js
    renderSearchHistory();

    console.log("App initialized.");
}

/**
 * Checks password protection status and shows modal if required.
 */
function checkPasswordProtection() {
    if (window.isPasswordProtected && !window.isPasswordVerified()) {
        console.log("Password protection enabled and not verified. Showing modal.");
        window.showPasswordModal(); // Call function from password.js
    } else {
        console.log("Password protection not required or already verified.");
    }
}

/**
 * Checks if the disclaimer needs to be shown.
 */
 function checkDisclaimer() {
    const disclaimerSeen = localStorage.getItem('hasSeenDisclaimer') === 'true';
    if (!disclaimerSeen) {
        showModal('使用须知 (Disclaimer)', `
            <p>本网站仅为 демонстрация 项目，通过公开 API 搜索网络视频资源。</p>
            <p>请勿用于非法用途。所有视频内容均来自第三方网站，本站不存储任何视频文件。</p>
            <p>使用本网站即表示您同意遵守相关法律法规并自行承担风险。</p>
            <p>This site is for demonstration purposes only, searching resources via public APIs.</p>
            <p>Do not use for illegal purposes. All content is from third-party sites; no files are stored here.</p>
            <p>By using this site, you agree to comply with laws and assume all risks.</p>
            <button onclick="markDisclaimerSeen()" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mt-4">我已知晓 (Acknowledge)</button>
        `, false); // false means modal cannot be closed by clicking outside
         // Remove the default close button if needed
         const modalCloseButton = getElement('#modalCloseButton');
         if (modalCloseButton) modalCloseButton.style.display = 'none';
    }
    appState.hasSeenDisclaimer = disclaimerSeen;
}

// Make this function global so the button in the modal can call it
window.markDisclaimerSeen = function() {
    localStorage.setItem('hasSeenDisclaimer', 'true');
    appState.hasSeenDisclaimer = true;
    closeModal();
    const modalCloseButton = getElement('#modalCloseButton');
    if (modalCloseButton) modalCloseButton.style.display = ''; // Restore close button visibility
}


// --- Settings & LocalStorage ---

/**
 * Loads settings from localStorage into appState.
 */
function loadSettings() {
    try {
        appState.selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '[]');
        appState.customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');
        appState.yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
        appState.adFilteringEnabled = localStorage.getItem('adFilteringEnabled') === 'true';
        appState.hasInitializedDefaults = localStorage.getItem('hasInitializedDefaults') === 'true';

        // Apply initial toggle states
        const yellowToggle = getElement('#yellowFilterToggle');
        const adToggle = getElement('#adFilterToggle');
        if (yellowToggle) yellowToggle.checked = appState.yellowFilterEnabled;
        if (adToggle) adToggle.checked = appState.adFilteringEnabled;
        applyFiltersToBody(); // Apply visual filters immediately

        // Set default selected APIs on first load if none are selected
        if (!appState.hasInitializedDefaults && appState.selectedAPIs.length === 0) {
            setDefaultSelectedAPIs();
            appState.hasInitializedDefaults = true;
            localStorage.setItem('hasInitializedDefaults', 'true');
        }

    } catch (error) {
        console.error("Error loading settings from localStorage:", error);
        showToast("加载设置失败，部分功能可能异常。", "error");
        // Reset to defaults in case of parsing errors?
        appState.selectedAPIs = [];
        appState.customAPIs = [];
        setDefaultSelectedAPIs(); // Attempt to set defaults
    }
}

/**
 * Saves the current selected APIs to localStorage.
 */
function saveSelectedAPIs() {
    localStorage.setItem('selectedAPIs', JSON.stringify(appState.selectedAPIs));
}

/**
 * Saves the current custom APIs list to localStorage.
 */
function saveCustomAPIs() {
    localStorage.setItem('customAPIs', JSON.stringify(appState.customAPIs));
    renderCustomAPIsList(); // Re-render the list in settings
    initAPICheckboxes(); // Re-render API checkboxes as custom APIs might affect selection state
}

/**
 * Sets default selected APIs (non-adult, searchable).
 */
function setDefaultSelectedAPIs() {
    appState.selectedAPIs = API_SITES
        .filter(site => site.searchable && !site.isAdult)
        .map(site => site.key);
    saveSelectedAPIs();
    console.log("Default APIs selected:", appState.selectedAPIs);
}

// --- UI Rendering & Updates ---

/**
 * Initializes the API checkboxes in the settings panel based on API_SITES and current selection.
 */
function initAPICheckboxes() {
    const container = getElement('#apiCheckboxes');
    if (!container) return;

    const fragment = document.createDocumentFragment();
    const currentSelectedSet = new Set(appState.selectedAPIs);

    // Add Aggregated Search Option
    const aggregatedDiv = document.createElement('div');
    aggregatedDiv.className = 'flex items-center mb-2 api-checkbox-item';
    aggregatedDiv.innerHTML = `
        <input type="checkbox" id="api-aggregated" value="aggregated" class="mr-2 form-checkbox h-5 w-5 text-blue-600" ${currentSelectedSet.has('aggregated') ? 'checked' : ''}>
        <label for="api-aggregated" class="text-gray-700 dark:text-gray-300">聚合搜索 (所有标准源)</label>
    `;
    fragment.appendChild(aggregatedDiv);

    // Add Standard API Sources
    API_SITES.forEach(site => {
        // Optionally hide adult APIs based on config
        if (HIDE_BUILTIN_ADULT_APIS && site.isAdult) {
            return;
        }
        const div = document.createElement('div');
        div.className = 'flex items-center mb-2 api-checkbox-item';
        // Add adult tag visually if not hidden
        const adultTag = site.isAdult ? '<span class="ml-2 text-xs bg-red-200 text-red-800 px-1 rounded">Adult</span>' : '';
        div.innerHTML = `
            <input type="checkbox" id="api-${site.key}" value="${site.key}" class="mr-2 form-checkbox h-5 w-5 text-blue-600" ${currentSelectedSet.has(site.key) ? 'checked' : ''} ${currentSelectedSet.has('aggregated') ? 'disabled' : ''}>
            <label for="api-${site.key}" class="text-gray-700 dark:text-gray-300">${site.name}</label>
            ${adultTag}
        `;
        fragment.appendChild(div);
    });

     // Add Custom API Sources (if any)
    if (appState.customAPIs.length > 0) {
        const customHeader = document.createElement('h4');
        customHeader.className = 'text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4';
        customHeader.textContent = '自定义源';
        fragment.appendChild(customHeader);

        appState.customAPIs.forEach(api => {
            const div = document.createElement('div');
            div.className = 'flex items-center mb-2 api-checkbox-item';
            div.innerHTML = `
                <input type="checkbox" id="api-${api.key}" value="${api.key}" data-custom="true" class="mr-2 form-checkbox h-5 w-5 text-blue-600" ${currentSelectedSet.has(api.key) ? 'checked' : ''} ${currentSelectedSet.has('aggregated') ? 'disabled' : ''}>
                <label for="api-${api.key}" class="text-gray-700 dark:text-gray-300">${api.name} (${api.key})</label>
            `;
            fragment.appendChild(div);
        });
    }

    container.innerHTML = ''; // Clear previous content
    container.appendChild(fragment);

    // Add event listeners after rendering
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleApiSelectionChange);
    });
}


/**
 * Renders the list of custom APIs in the settings panel.
 */
function renderCustomAPIsList() {
    const listContainer = getElement('#customApisList');
    if (!listContainer) return;

    const fragment = document.createDocumentFragment();
    if (appState.customAPIs.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400">暂无自定义源。</p>';
        return;
    }

    appState.customAPIs.forEach((api, index) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700';

        // Sanitize API name and URL before displaying to prevent potential XSS if data source is untrusted
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${api.name} (${api.key})`; // Display key for uniqueness
        nameSpan.className = 'flex-1 mr-2 text-gray-800 dark:text-gray-200';

        const urlSpan = document.createElement('span');
        urlSpan.textContent = api.url;
        urlSpan.className = 'text-sm text-gray-500 dark:text-gray-400 mr-2 truncate flex-1'; // Truncate long URLs

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'flex-shrink-0';

        const editButton = document.createElement('button');
        editButton.textContent = '编辑';
        editButton.className = 'text-sm bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-2 rounded mr-1';
        editButton.onclick = () => editCustomApi(index);

        const removeButton = document.createElement('button');
        removeButton.textContent = '删除';
        removeButton.className = 'text-sm bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded';
        removeButton.onclick = () => removeCustomApi(index);

        buttonGroup.appendChild(editButton);
        buttonGroup.appendChild(removeButton);

        div.appendChild(nameSpan);
        div.appendChild(urlSpan);
        div.appendChild(buttonGroup);
        fragment.appendChild(div);
    });

    listContainer.innerHTML = ''; // Clear previous list
    listContainer.appendChild(fragment);
}


/**
 * Renders search results in the results container.
 * @param {Array} items - Array of search result items.
 */
function renderSearchResults(items) {
    const resultsContainer = getElement('#results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = ''; // Clear previous results
    if (!items || items.length === 0) {
        resultsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">未找到相关结果。</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        // **Security Improvement:** Use textContent for text data and carefully construct HTML.
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden card-hover transform transition duration-300 ease-in-out cursor-pointer'; // Added cursor-pointer

        // Get API name for display
        const apiInfo = getApiInfo(item.source, item.isCustom); // Use helper

        // Image container
        const imgContainer = document.createElement('div');
        imgContainer.className = 'relative h-48 w-full'; // Fixed height container
        const img = document.createElement('img');
        img.className = 'absolute h-full w-full object-cover'; // Use object-fit
        img.src = item.vod_pic || './placeholder.png'; // Use placeholder if image missing
        img.alt = ''; // Alt text set on title below
        img.onerror = (e) => { e.target.src = './placeholder.png'; }; // Fallback on error
        imgContainer.appendChild(img);

        // Source badge
        if (apiInfo) {
            const sourceBadge = document.createElement('span');
            sourceBadge.className = 'absolute top-2 left-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded';
            sourceBadge.textContent = apiInfo.name;
            imgContainer.appendChild(sourceBadge);
        }

        // Content container
        const contentDiv = document.createElement('div');
        contentDiv.className = 'p-3';

        const title = document.createElement('h3');
        title.className = 'text-md font-semibold text-gray-900 dark:text-white mb-1 truncate';
        title.textContent = item.vod_name || '未知标题'; // Use textContent
        title.title = item.vod_name || ''; // Tooltip for full title

        const remarks = document.createElement('p');
        remarks.className = 'text-sm text-gray-600 dark:text-gray-400';
        remarks.textContent = item.vod_remarks || ''; // Use textContent

        contentDiv.appendChild(title);
        contentDiv.appendChild(remarks);

        card.appendChild(imgContainer);
        card.appendChild(contentDiv);

        // Add click listener to the card itself
        card.onclick = (event) => {
             // Prevent triggering if click was on interactive element inside card (if any added later)
             if (event.target.closest('button, a')) return;
             showDetails(item.vod_id, item.source, item.isCustom);
        };

        fragment.appendChild(card);
    });

    resultsContainer.appendChild(fragment);
}

/**
 * Shows the modal dialog.
 * @param {string} title - Modal title.
 * @param {string} contentHTML - HTML content for the modal body.
 * @param {boolean} [allowClose=true] - Whether clicking outside/ESC closes the modal.
 */
function showModal(title, contentHTML, allowClose = true) {
    const modal = getElement('#modal');
    const modalTitle = getElement('#modalTitle');
    const modalContent = getElement('#modalContent');
    const modalCloseButton = getElement('#modalCloseButton'); // Get the specific close button

    if (!modal || !modalTitle || !modalContent || !modalCloseButton) return;

    modalTitle.textContent = title;
    modalContent.innerHTML = contentHTML; // Content is expected to be HTML here, ensure it's safe if from untrusted source

    // Handle close button visibility based on allowClose
    modalCloseButton.style.display = allowClose ? '' : 'none';

    // Add/Remove listeners for closing
    if (allowClose) {
         modal.onclick = (event) => { // Close on backdrop click
             if (event.target === modal) {
                 closeModal();
             }
         };
         document.addEventListener('keydown', handleEscKey);
    } else {
        modal.onclick = null; // Remove backdrop click listener
        document.removeEventListener('keydown', handleEscKey);
    }


    modal.classList.remove('hidden');
    modal.classList.add('flex'); // Use flex to center content
}


/**
 * Closes the main modal dialog.
 */
function closeModal() {
    const modal = getElement('#modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        // Clean up content and listeners
        const modalContent = getElement('#modalContent');
        if (modalContent) modalContent.innerHTML = '';
        modal.onclick = null;
        document.removeEventListener('keydown', handleEscKey);

        // Restore close button visibility if it was hidden
        const modalCloseButton = getElement('#modalCloseButton');
        if (modalCloseButton) modalCloseButton.style.display = '';
    }
}

/**
 * Handles the Escape key press to close the modal.
 * @param {KeyboardEvent} event
 */
function handleEscKey(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
}

/**
 * Applies visual filters (e.g., yellow filter) to the body.
 */
function applyFiltersToBody() {
    document.body.classList.toggle('yellow-filter-active', appState.yellowFilterEnabled);
    // Add other filter class toggles here if needed
}

// --- Search & Detail Logic ---

/**
 * Performs a search based on the input query and selected APIs.
 */
async function search() {
    const query = getElement('#searchInput').value.trim();
    if (!query) {
        showToast("请输入搜索关键词。", "warning");
        return;
    }

    // Check if password is required and verified
    if (window.isPasswordProtected && !window.isPasswordVerified()) {
        showToast("请先验证密码。", "warning");
        window.showPasswordModal();
        return;
    }

    // Check for adult APIs if filter is off
    if (!appState.yellowFilterEnabled && checkAdultAPIsSelected()) {
         if (!confirm("您选择的源包含成人内容，且过滤器已关闭。确定要继续搜索吗？")) {
             return;
         }
    }

    console.log(`Searching for: "${query}" using APIs:`, appState.selectedAPIs);
    showLoading();
    uiSaveSearchHistory(query); // Save search term using ui.js function
    renderSearchHistory(); // Update history display

    const resultsContainer = getElement('#results');
    resultsContainer.innerHTML = ''; // Clear previous results immediately

    let apiUrl = '/api/search?wd=' + encodeURIComponent(query);
    const selectedStandard = appState.selectedAPIs.filter(key => !isCustomApiKey(key) && key !== 'aggregated');
    const selectedCustom = appState.selectedAPIs.filter(key => isCustomApiKey(key));

    try {
        let response;
        if (appState.selectedAPIs.includes('aggregated')) {
            apiUrl += '&source=aggregated';
            response = await fetch(apiUrl);
        } else if (selectedStandard.length > 0 && selectedCustom.length > 0) {
            // Fetch standard and custom separately and combine
            const standardUrl = apiUrl + '&source=' + selectedStandard.join(','); // Assuming API can handle multiple sources? Check api.js impl. (If not, needs Promise.all)
             const customUrl = apiUrl + '&customApi=' + selectedCustom.join(',');

             // *** Assuming api.js CANNOT handle multiple standard sources in one 'source' param ***
             // Fetch standard APIs individually using Promise.all
             const standardPromises = selectedStandard.map(sourceKey =>
                 fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${sourceKey}`)
                     .then(res => res.ok ? res.json() : { list: [], error: true, source: sourceKey }) // Handle failed fetches gracefully
                     .catch(err => ({ list: [], error: true, source: sourceKey, message: err.message }))
             );
             const customPromise = fetch(customUrl)
                 .then(res => res.ok ? res.json() : { list: [], error: true, source: 'custom' })
                 .catch(err => ({ list: [], error: true, source: 'custom', message: err.message }));

             const [customResults, ...standardResultsArray] = await Promise.all([customPromise, ...standardPromises]);

             const combinedList = [];
             standardResultsArray.forEach(result => {
                 if (!result.error && result.list) {
                    result.list.forEach(item => item.source = result.source || item.source); // Ensure source is tagged
                    combinedList.push(...result.list);
                 } else {
                     console.warn(`Failed to fetch from standard source ${result.source}: ${result.message || 'Unknown error'}`);
                 }
             });
              if (!customResults.error && customResults.list) {
                 customResults.list.forEach(item => {
                    item.isCustom = true; // Mark custom results
                    item.source = item.source || getCustomApiInfo(item.source)?.key; // Ensure source key if possible
                 });
                 combinedList.push(...customResults.list);
             } else {
                  console.warn(`Failed to fetch from custom sources: ${customResults.message || 'Unknown error'}`);
             }

             renderSearchResults(combinedList);
             hideLoading();
             return; // Exit after manual aggregation

        } else if (selectedStandard.length > 0) {
             // Original logic assumed multiple standard sources could be comma-separated
             // If api.js handles this, keep it. If not, use Promise.all like above.
             // Let's assume for now api.js *cannot* handle multiple standard sources via comma
             // Need Promise.all
             const standardPromises = selectedStandard.map(sourceKey =>
                 fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${sourceKey}`)
                     .then(res => res.ok ? res.json() : { list: [], error: true, source: sourceKey })
                     .catch(err => ({ list: [], error: true, source: sourceKey, message: err.message }))
             );
              const standardResultsArray = await Promise.all(standardPromises);
              const combinedList = [];
               standardResultsArray.forEach(result => {
                 if (!result.error && result.list) {
                    result.list.forEach(item => item.source = result.source || item.source);
                    combinedList.push(...result.list);
                 } else {
                     console.warn(`Failed to fetch from standard source ${result.source}: ${result.message || 'Unknown error'}`);
                 }
             });
             renderSearchResults(combinedList);
             hideLoading();
             return;

        } else if (selectedCustom.length > 0) {
            apiUrl += '&customApi=' + selectedCustom.join(',');
            response = await fetch(apiUrl);
        } else {
            showToast("请在设置中至少选择一个搜索源。", "warning");
            hideLoading();
            return;
        }

        // This part handles the cases NOT manually aggregated above (aggregated, single custom, multiple custom if API handles comma)
        if (!response.ok) {
            let errorMsg = "搜索请求失败";
            try {
                const errData = await response.json();
                errorMsg = errData.msg || errorMsg;
            } catch (e) { /* Ignore if response not JSON */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.code !== 200 && data.code !== 0) { // Allow code 0 for success as well
            throw new Error(data.msg || "搜索接口返回错误");
        }

        // Mark custom results if fetched via customApi param
        if (selectedCustom.length > 0 && data.list) {
             data.list.forEach(item => {
                if (selectedCustom.includes(item.source)) { // Check if item source is one of the requested custom APIs
                    item.isCustom = true;
                }
            });
        }

        renderSearchResults(data.list);

    } catch (error) {
        console.error("Search failed:", error);
        showToast(`搜索失败: ${error.message}`, "error");
        resultsContainer.innerHTML = `<p class="text-red-500 text-center">搜索时发生错误: ${error.message}</p>`;
    } finally {
        hideLoading();
    }
}


/**
 * Fetches and displays video details in a modal.
 * @param {string|number} id - The video ID.
 * @param {string} source - The API source key.
 * @param {boolean} [isCustom=false] - Whether the source is a custom API.
 */
async function showDetails(id, source, isCustom = false) {
    console.log(`Fetching details for ID: ${id}, Source: ${source}, Custom: ${isCustom}`);
    showLoading();

    // Store details for potential playback
    appState.currentDetail = { id, source, isCustom, title: '', episodes: [], episodesReversed: false, videoInfo: null };

    let detailUrl = `/api/detail?id=${encodeURIComponent(id)}`;
    if (isCustom) {
        detailUrl += `&customApi=${encodeURIComponent(source)}`;
    } else {
        detailUrl += `&source=${encodeURIComponent(source)}`;
    }

    try {
        const response = await fetch(detailUrl);
        if (!response.ok) {
             let errorMsg = "获取详情失败";
            try {
                const errData = await response.json();
                errorMsg = errData.msg || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();
         if (data.code !== 200 && data.code !== 0) {
             throw new Error(data.msg || "详情接口返回错误");
         }

        if (!data.videoInfo || !data.episodes) {
             console.error("Invalid detail data structure:", data);
             throw new Error("详情数据格式不正确");
        }

        appState.currentDetail.title = data.videoInfo.vod_name || '未知标题';
        appState.currentDetail.episodes = data.episodes;
        appState.currentDetail.videoInfo = data.videoInfo;
        appState.currentDetail.episodesReversed = false; // Reset order

        // Render details in modal
        renderDetailModalContent(appState.currentDetail);

    } catch (error) {
        console.error("Failed to show details:", error);
        showToast(`获取详情失败: ${error.message}`, "error");
        closeModal(); // Close modal on error
    } finally {
        hideLoading();
    }
}

/**
 * Renders the content of the detail modal.
 * @param {object} detailData - The data object containing title, episodes, videoInfo.
 */
function renderDetailModalContent(detailData) {
    const { title, episodes, episodesReversed, videoInfo } = detailData;

    let episodesHTML = '<p class="text-gray-500">暂无播放链接。</p>';
    if (episodes && episodes.length > 0) {
        // Apply reverse order if needed
        const displayEpisodes = episodesReversed ? [...episodes].reverse() : episodes;

        episodesHTML = `
            <div class="flex justify-between items-center mb-2">
                <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200">剧集列表 (${episodes.length})</h4>
                <button onclick="toggleEpisodeOrder()" class="text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 py-1 px-2 rounded">
                    ${episodesReversed ? '切换正序' : '切换倒序'}
                </button>
            </div>
            <div class="max-h-60 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                ${displayEpisodes.map((ep, index) => {
                    // Calculate the original index if reversed
                    const originalIndex = episodesReversed ? episodes.length - 1 - index : index;
                    // **Security**: Ensure ep.name and ep.url are handled safely if they influence HTML attributes/content beyond textContent
                    const safeName = escapeHtml(ep.name || `第 ${originalIndex + 1} 集`);
                    // Use data attributes for parameters to avoid complex escaping in onclick
                    return `<button
                                data-index="${originalIndex}"
                                data-url="${escapeHtml(ep.url)}"
                                data-name="${escapeHtml(ep.name)}"
                                class="ep-button bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-800 dark:text-blue-200 text-sm py-2 px-1 rounded text-center truncate"
                                title="${safeName}"
                                onclick="handlePlayEpisodeClick(this)">
                                ${safeName}
                            </button>`;
                }).join('')}
            </div>`;
    }

    // Basic video info display (using textContent for safety)
    const infoHTML = videoInfo ? `
        <div class="mt-4 border-t pt-4 border-gray-200 dark:border-gray-700">
             <p class="text-sm text-gray-600 dark:text-gray-400"><strong>导演:</strong> ${escapeHtml(videoInfo.vod_director || 'N/A')}</p>
             <p class="text-sm text-gray-600 dark:text-gray-400"><strong>主演:</strong> ${escapeHtml(videoInfo.vod_actor || 'N/A')}</p>
             <p class="text-sm text-gray-600 dark:text-gray-400"><strong>类型:</strong> ${escapeHtml(videoInfo.vod_class || 'N/A')}</p>
             <p class="text-sm text-gray-600 dark:text-gray-400"><strong>地区:</strong> ${escapeHtml(videoInfo.vod_area || 'N/A')}</p>
             <p class="text-sm text-gray-600 dark:text-gray-400"><strong>年份:</strong> ${escapeHtml(videoInfo.vod_year || 'N/A')}</p>
             <p class="text-sm text-gray-600 dark:text-gray-400 mt-2"><strong>简介:</strong> ${escapeHtml(videoInfo.vod_content || 'N/A')}</p>
        </div>
    ` : '';

    const modalContentHTML = episodesHTML + infoHTML;
    showModal(title, modalContentHTML);
}

/**
 * Handles the click event on an episode button within the detail modal.
 * Extracts data attributes and calls playVideo.
 * @param {HTMLElement} buttonElement - The button element that was clicked.
 */
window.handlePlayEpisodeClick = function(buttonElement) {
    const index = parseInt(buttonElement.getAttribute('data-index'), 10);
    const url = buttonElement.getAttribute('data-url');
    // const name = buttonElement.getAttribute('data-name'); // Name is available if needed

    if (isNaN(index) || !url) {
        console.error("Invalid episode data on button:", buttonElement);
        showToast("无法播放该剧集，数据错误。", "error");
        return;
    }
    playVideo(index); // Pass the original index
}


/**
 * Opens the player page for the selected episode.
 * @param {number} episodeIndex - The index of the episode in the appState.currentDetail.episodes array.
 */
function playVideo(episodeIndex) {
    const { id, source, isCustom, title, episodes } = appState.currentDetail;

    if (!episodes || episodeIndex < 0 || episodeIndex >= episodes.length) {
        console.error("Invalid episode index or episodes data for playback:", episodeIndex, episodes);
        showToast("无法播放：剧集信息无效。", "error");
        return;
    }

    const episode = episodes[episodeIndex];
    const playerUrl = new URL(PLAYER_CONFIG.PLAYER_URL, window.location.origin); // Use configured player URL

    // Encode episode list for URL param
    let encodedEpisodes = '';
    try {
        // Simple encoding: name1$url1#name2$url2
        encodedEpisodes = episodes.map(ep => `${ep.name || ''}$${ep.url || ''}`).join('#');
    } catch (e) {
        console.error("Failed to encode episodes for URL:", e);
        showToast("无法准备播放列表。", "error");
        return; // Don't proceed if episodes can't be encoded
    }


    // Add parameters for the player page
    playerUrl.searchParams.set('url', episode.url);
    playerUrl.searchParams.set('title', title || '视频播放');
    playerUrl.searchParams.set('index', episodeIndex.toString());
    playerUrl.searchParams.set('source', source); // Pass source key
    // playerUrl.searchParams.set('id', id); // Pass video ID if needed by player
    // Pass the full episode list (consider length limits for GET requests)
    // Using a simpler encoding or potentially fetching details again in the player might be better if the list is huge.
    if (encodedEpisodes.length < 2000) { // Basic check for URL length limits
         playerUrl.searchParams.set('episodes', encodedEpisodes);
    } else {
        console.warn("Episode list is too long, not passing via URL parameter.");
        // Player page might need to re-fetch details using id and source if episodes param is missing.
         playerUrl.searchParams.set('id', id); // Ensure ID is passed if episodes are omitted
         playerUrl.searchParams.set('isCustom', isCustom.toString()); // Pass custom flag if needed
    }


    console.log(`Opening player: ${playerUrl.href}`);
    window.open(playerUrl.href, '_blank'); // Open in new tab
    closeModal();
}


/**
 * Toggles the display order of episodes in the detail modal.
 */
window.toggleEpisodeOrder = function() { // Make global for onclick
    if (appState.currentDetail && appState.currentDetail.episodes) {
        appState.currentDetail.episodesReversed = !appState.currentDetail.episodesReversed;
        // Re-render the modal content with the new order
        renderDetailModalContent(appState.currentDetail);
    }
}

// --- Settings Panel Logic ---

/**
 * Toggles the visibility of the settings panel.
 */
window.toggleSettings = function() { // Make global for onclick
    const panel = getElement('#settingsPanel');
    if (panel) {
        panel.classList.toggle('hidden');
         // Ensure API checkboxes are up-to-date when opening
        if (!panel.classList.contains('hidden')) {
             initAPICheckboxes();
             renderCustomAPIsList();
        }
    }
};

/**
 * Handles changes in API selection checkboxes.
 * @param {Event} event - The change event object.
 */
function handleApiSelectionChange(event) {
    const checkbox = event.target;
    const selectedKey = checkbox.value;
    const isChecked = checkbox.checked;
    const isAggregated = selectedKey === 'aggregated';
    const apiCheckboxesContainer = getElement('#apiCheckboxes');

    let currentSelection = Array.from(apiCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    if (isAggregated && isChecked) {
        // If aggregated is checked, uncheck all others and disable them
        currentSelection = ['aggregated'];
        apiCheckboxesContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.value !== 'aggregated') {
                cb.checked = false;
                cb.disabled = true;
            }
        });
    } else if (isAggregated && !isChecked) {
        // If aggregated is unchecked, enable all others
        currentSelection = currentSelection.filter(key => key !== 'aggregated'); // Remove aggregated
        apiCheckboxesContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
             if (cb.value !== 'aggregated') {
                 cb.disabled = false;
             }
        });
        // Maybe select default non-adults if nothing else is selected?
        if (currentSelection.length === 0) {
             setDefaultSelectedAPIs(); // Reselect defaults
             initAPICheckboxes(); // Rerender checkboxes to reflect default selection
             currentSelection = [...appState.selectedAPIs]; // Update local currentSelection
        }

    } else if (!isAggregated) {
        // If a normal API is checked/unchecked, ensure aggregated is unchecked and remove it from selection
        const aggregatedCheckbox = getElement('#api-aggregated');
        if (aggregatedCheckbox && aggregatedCheckbox.checked) {
            aggregatedCheckbox.checked = false;
             // Re-enable other checkboxes
             apiCheckboxesContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                 if (cb.value !== 'aggregated') {
                     cb.disabled = false;
                 }
             });
        }
         // Update selection based on current checkbox states
        currentSelection = Array.from(apiCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        // Ensure aggregated isn't accidentally included if unchecked but still in DOM somehow
        currentSelection = currentSelection.filter(key => key !== 'aggregated');
    }


    // Check for adult APIs if filter is off
    if (!appState.yellowFilterEnabled) {
        const adultSelected = currentSelection.some(key => {
            const site = API_SITES.find(s => s.key === key);
            return site && site.isAdult;
        });
        if (adultSelected) {
            showToast("警告：已选择成人内容源，请确保过滤器已开启或谨慎使用。", "warning", 5000);
        }
    }


    appState.selectedAPIs = currentSelection;
    saveSelectedAPIs();
    console.log("Updated selected APIs:", appState.selectedAPIs);
}

/**
 * Checks if any selected standard API is marked as adult.
 * @returns {boolean} True if an adult API is selected.
 */
function checkAdultAPIsSelected() {
    return appState.selectedAPIs.some(key => {
        const site = API_SITES.find(s => s.key === key);
        return site && site.isAdult;
    });
}

/**
 * Handles toggling the yellow filter.
 * @param {Event} event - The change event object.
 */
function handleYellowFilterToggle(event) {
    appState.yellowFilterEnabled = event.target.checked;
    localStorage.setItem('yellowFilterEnabled', appState.yellowFilterEnabled);
    applyFiltersToBody();
    showToast(`内容过滤器已 ${appState.yellowFilterEnabled ? '开启' : '关闭'}`);

    // Warn if filter is turned off and adult APIs are selected
     if (!appState.yellowFilterEnabled && checkAdultAPIsSelected()) {
         showToast("警告：内容过滤器已关闭，且选择了成人内容源。", "warning", 5000);
     }
}

/**
 * Handles toggling the ad filtering (affects player).
 * @param {Event} event - The change event object.
 */
 function handleAdFilterToggle(event) {
    appState.adFilteringEnabled = event.target.checked;
    localStorage.setItem('adFilteringEnabled', appState.adFilteringEnabled);
    showToast(`播放器广告过滤已 ${appState.adFilteringEnabled ? '开启' : '关闭'} (需刷新播放器生效)`);
}

/**
 * Selects all standard, non-adult, searchable APIs.
 */
window.selectAllAPIs = function() { // Make global for onclick
    const apiCheckboxesContainer = getElement('#apiCheckboxes');
    const aggregatedCheckbox = getElement('#api-aggregated');
    if (aggregatedCheckbox) aggregatedCheckbox.checked = false; // Uncheck aggregated

    appState.selectedAPIs = API_SITES
        .filter(site => site.searchable && !site.isAdult)
        .map(site => site.key);

    // Add selected custom APIs back
    appState.selectedAPIs.push(...appState.customAPIs.map(api => api.key));
    // Remove duplicates just in case
    appState.selectedAPIs = [...new Set(appState.selectedAPIs)];

    saveSelectedAPIs();
    initAPICheckboxes(); // Re-render checkboxes to reflect selection
    showToast("已选择所有推荐的API源。");
};

// --- Custom API Management ---

/**
 * Shows the form for adding a new custom API.
 */
window.showAddCustomApiForm = function() { // Make global
    getElement('#addCustomApiForm').classList.remove('hidden');
    getElement('#customApiName').value = '';
    getElement('#customApiUrl').value = '';
    getElement('#customApiKey').value = '';
    getElement('#customApiHeaders').value = ''; // Clear headers field
};

/**
 * Cancels adding a new custom API.
 */
window.cancelAddCustomApi = function() { // Make global
    getElement('#addCustomApiForm').classList.add('hidden');
};

/**
 * Adds a new custom API source.
 */
window.addCustomApi = function() { // Make global
    const name = getElement('#customApiName').value.trim();
    const url = getElement('#customApiUrl').value.trim();
    let key = getElement('#customApiKey').value.trim();
    const headersString = getElement('#customApiHeaders').value.trim();

    if (!name || !url) {
        showToast("名称和URL不能为空。", "error");
        return;
    }

    // Auto-generate key if empty
    if (!key) {
        key = name.toLowerCase().replace(/[^a-z0-9]/g, '') + Date.now().toString(36);
         showToast(`已自动生成Key: ${key}`, "info");
         getElement('#customApiKey').value = key; // Show generated key
    }

    // Basic URL validation
    try {
        new URL(url); // Check if URL is valid format
    } catch (_) {
         // Allow URLs without scheme if they are likely placeholders for API endpoints
         if (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('/')) {
            // Heuristic: if it doesn't look like a path and has no scheme, assume it's a base URL needing http://
            showToast("URL格式不推荐，建议包含 http:// 或 https://", "warning");
            // url = 'http://' + url; // Optionally auto-prefix
         } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
             // Allow relative paths or paths without scheme? Risky. Better to enforce full URL.
             // For now, just warn if no scheme.
             showToast("URL 建议包含 http:// 或 https://", "warning");
         }
    }


    // Validate Key: ensure uniqueness and basic format
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        showToast("Key 只能包含字母、数字、下划线和连字符。", "error");
        return;
    }
    if (API_SITES.some(site => site.key === key) || appState.customAPIs.some(api => api.key === key)) {
        showToast("此 Key 已被内置源或其它自定义源使用。", "error");
        return;
    }

    // Parse headers
    let headers = {};
    if (headersString) {
        try {
            headers = JSON.parse(headersString);
            if (typeof headers !== 'object' || Array.isArray(headers)) {
                throw new Error("Headers必须是JSON对象格式");
            }
        } catch (e) {
            showToast(`Headers 格式错误: ${e.message}。请输入有效的 JSON 对象，例如 {"User-Agent": "MyApp"}`, "error", 7000);
            return;
        }
    }


    const newApi = { name, url, key, headers };
    appState.customAPIs.push(newApi);
    saveCustomAPIs(); // Saves and re-renders lists
    cancelAddCustomApi(); // Hide form
    showToast("自定义源添加成功！");
};


/**
 * Shows the form for editing an existing custom API.
 * @param {number} index - The index of the custom API in the appState.customAPIs array.
 */
window.editCustomApi = function(index) { // Make global
    if (index < 0 || index >= appState.customAPIs.length) return;
    const api = appState.customAPIs[index];

    getElement('#editCustomApiName').value = api.name;
    getElement('#editCustomApiUrl').value = api.url;
    getElement('#editCustomApiKey').value = api.key;
    getElement('#editCustomApiKey').readOnly = true; // Key should not be editable
    getElement('#editCustomApiIndex').value = index.toString(); // Store index
    getElement('#editCustomApiHeaders').value = JSON.stringify(api.headers || {}, null, 2); // Pretty print JSON

    getElement('#editCustomApiForm').classList.remove('hidden');
};

/**
 * Cancels editing a custom API.
 */
window.cancelEditCustomApi = function() { // Make global
    getElement('#editCustomApiForm').classList.add('hidden');
    getElement('#editCustomApiKey').readOnly = false; // Reset readOnly state
};

/**
 * Updates an existing custom API source.
 */
window.updateCustomApi = function() { // Make global
    const index = parseInt(getElement('#editCustomApiIndex').value, 10);
    if (isNaN(index) || index < 0 || index >= appState.customAPIs.length) {
         showToast("无法更新：无效的索引。", "error");
         return;
    }

    const name = getElement('#editCustomApiName').value.trim();
    const url = getElement('#editCustomApiUrl').value.trim();
    // const key = getElement('#editCustomApiKey').value.trim(); // Key is read-only, use existing
    const key = appState.customAPIs[index].key;
    const headersString = getElement('#editCustomApiHeaders').value.trim();


    if (!name || !url) {
        showToast("名称和URL不能为空。", "error");
        return;
    }
     try {
        new URL(url);
    } catch (_) {
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
             showToast("URL 建议包含 http:// 或 https://", "warning");
         }
    }

     // Parse headers
    let headers = {};
    if (headersString) {
        try {
            headers = JSON.parse(headersString);
             if (typeof headers !== 'object' || Array.isArray(headers)) {
                throw new Error("Headers必须是JSON对象格式");
            }
        } catch (e) {
            showToast(`Headers 格式错误: ${e.message}。请输入有效的 JSON 对象。`, "error", 7000);
            return;
        }
    }


    // Update the API object
    appState.customAPIs[index] = { name, url, key, headers };
    saveCustomAPIs(); // Saves and re-renders lists
    cancelEditCustomApi(); // Hide form
    showToast("自定义源更新成功！");
};


/**
 * Removes a custom API source.
 * @param {number} index - The index of the custom API in the appState.customAPIs array.
 */
window.removeCustomApi = function(index) { // Make global
    if (index < 0 || index >= appState.customAPIs.length) return;

    const apiToRemove = appState.customAPIs[index];
    if (confirm(`确定要删除自定义源 "${apiToRemove.name}" 吗？`)) {
        // Remove from selected APIs if present
        appState.selectedAPIs = appState.selectedAPIs.filter(key => key !== apiToRemove.key);
        saveSelectedAPIs();

        // Remove from custom APIs list
        appState.customAPIs.splice(index, 1);
        saveCustomAPIs(); // Saves and re-renders lists

        showToast("自定义源已删除。");
    }
};

// --- Search History Logic (using ui.js) ---

/**
 * Renders the search history list.
 */
function renderSearchHistory() {
    const historyContainer = getElement('#recentSearches');
    if (!historyContainer) return;

    // Call the rendering function from ui.js
    uiRenderSearchHistory(historyContainer, (query) => {
        // Click handler: set input value and trigger search
        const searchInput = getElement('#searchInput');
        if (searchInput) {
            searchInput.value = query;
            search(); // Trigger search
            toggleHistory(false); // Close history panel
        }
    });
}


/**
 * Clears the search history.
 */
window.clearSearchHistory = function() { // Make global
    if (confirm('确定要清空所有搜索历史记录吗？')) {
        uiClearSearchHistory(); // Call ui.js function
        renderSearchHistory(); // Re-render empty list
        showToast("搜索历史已清空。");
    }
}


/**
 * Toggles the visibility of the history panel.
 * @param {boolean} [forceShow] - Optional: force show (true) or hide (false).
 */
window.toggleHistory = function(forceShow) { // Make global
    const panel = getElement('#historyPanel');
    if (!panel) return;

     if (typeof forceShow === 'boolean') {
         panel.classList.toggle('hidden', !forceShow);
     } else {
         panel.classList.toggle('hidden');
     }

    // Re-render history when showing
    if (!panel.classList.contains('hidden')) {
        renderSearchHistory();
    }
}

// --- Utilities ---

/**
 * Gets API site information (name) based on key.
 * @param {string} key - The API key.
 * @param {boolean} [isCustom=false] - Whether it's a custom API key.
 * @returns {object|null} - API info { key, name } or null if not found.
 */
function getApiInfo(key, isCustom = false) {
    if (isCustom) {
        return appState.customAPIs.find(api => api.key === key) || { key, name: key }; // Fallback to key if name not found
    } else if (key === 'aggregated') {
        return { key: 'aggregated', name: '聚合' };
    } else {
        return API_SITES.find(site => site.key === key) || { key, name: key }; // Fallback to key
    }
}
// Make this globally accessible ONLY if ui.js absolutely needs it, prefer passing info.
// window.getCustomApiInfo = getApiInfo; // Evaluate if ui.js *really* needs this globally

/**
 * Checks if a key belongs to a custom API.
 * @param {string} key - The API key.
 * @returns {boolean}
 */
function isCustomApiKey(key) {
    return appState.customAPIs.some(api => api.key === key);
}

/**
 * Basic HTML escaping function.
 * @param {string} str - String to escape.
 * @returns {string} - Escaped string.
 */
function escapeHtml(str) {
    if (str === null || typeof str === 'undefined') return '';
    const strConv = String(str); // Convert to string just in case
    const div = document.createElement('div');
    div.textContent = strConv;
    return div.innerHTML;
}

// --- Event Listeners Setup ---

/**
 * Sets up main event listeners for the application.
 */
function setupEventListeners() {
    const searchInput = getElement('#searchInput');
    const searchButton = getElement('#searchButton');
    const resetSearchButton = getElement('#resetSearchButton');
    const settingsButton = document.querySelector('[onclick="toggleSettings()"]'); // Find by onclick
    const historyToggle = getElement('#historyToggle');
    const modalCloseButton = getElement('#modalCloseButton');
    const yellowFilterToggle = getElement('#yellowFilterToggle');
    const adFilterToggle = getElement('#adFilterToggle');
    const selectAllButton = document.querySelector('[onclick="selectAllAPIs()"]');
    const addApiButton = document.querySelector('[onclick="showAddCustomApiForm()"]'); // Find by onclick
    const saveCustomApiButton = getElement('#saveCustomApiButton');
    const cancelAddCustomApiButton = getElement('#cancelAddCustomApiButton');
    const updateCustomApiButton = getElement('#updateCustomApiButton');
    const cancelEditCustomApiButton = getElement('#cancelEditCustomApiButton');
    const clearHistoryButton = getElement('#clearHistoryButton');

    // Search
    if (searchInput) {
        searchInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                search();
            }
        });
    }
    if (searchButton) searchButton.addEventListener('click', search);
    if (resetSearchButton) {
        resetSearchButton.addEventListener('click', () => {
            if(searchInput) searchInput.value = '';
            getElement('#results').innerHTML = ''; // Clear results
            if(searchInput) searchInput.focus();
        });
    }

    // Settings Panel
    // Note: toggleSettings is already global via onclick, direct listener might be redundant unless removing onclick
    if (yellowFilterToggle) yellowFilterToggle.addEventListener('change', handleYellowFilterToggle);
     if (adFilterToggle) adFilterToggle.addEventListener('change', handleAdFilterToggle);
    // Note: selectAllAPIs is global via onclick
     // Note: Custom API form buttons have global onclick handlers assigned

    // History Panel
    if (historyToggle) historyToggle.addEventListener('click', () => toggleHistory());
    // Note: clearSearchHistory is global via onclick

    // Modal
    if (modalCloseButton) modalCloseButton.addEventListener('click', closeModal);

    // Custom API Forms (listeners assigned via global onclick, but could be done here)
     // Example: if (saveCustomApiButton) saveCustomApiButton.addEventListener('click', addCustomApi);
     // Keep onclick for now to adhere strictly to constraints.

    // Add listener for API checkbox changes (handled within initAPICheckboxes dynamically)
}

// --- Global Function Exports (for HTML onclick) ---
// Assign functions to window object if they are called via onclick and NOT defined with `window.` prefix already
window.search = search;
window.showDetails = showDetails;
window.playVideo = playVideo; // Still seems misplaced here, primarily used in modal -> player transition
// toggleSettings is already assigned to window
// selectAllAPIs is already assigned to window
// showAddCustomApiForm is already assigned to window
// addCustomApi is already assigned to window
// removeCustomApi is already assigned to window
// editCustomApi is already assigned to window
// updateCustomApi is already assigned to window
// cancelEditCustomApi is already assigned to window
// cancelAddCustomApi is already assigned to window
// clearSearchHistory is already assigned to window
// toggleHistory is already assigned to window
// toggleEpisodeOrder is assigned above

// --- App Entry Point ---
// Initialize the app after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

console.log("app.js loaded.");
