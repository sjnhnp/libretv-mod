// js/app.js - Main application logic for the index page.

// Strict mode helps catch common coding errors
"use strict";

// Global state variables
let selectedAPIs = []; // Initialized in DOMContentLoaded
let customAPIs = [];   // Initialized in DOMContentLoaded
let currentEpisodeIndex = 0; // Track episode index for playback context
let currentEpisodes = [];   // Store episodes for the currently viewed detail modal
let currentVideoTitle = ''; // Store title for the currently viewed detail modal
let episodesReversed = false; // Track episode order in the modal

// Debounce function to limit rapid calls (e.g., for window resize or input)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Initializes the application state and sets up event listeners.
 */
function initializeApp() {
    // Load state from localStorage
    selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '["heimuer"]'); // Default: heimuer
    customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]');

    // Initialize UI components
    initAPICheckboxes();
    renderCustomAPIsList();
    updateSelectedApiCount();
    renderSearchHistory(); // Assumes ui.js is loaded and provides this function

    // Set default settings on first visit
    if (!localStorage.getItem('hasInitializedDefaults')) {
        console.log("First visit detected, setting default configurations.");
        selectedAPIs = ["heimuer"];
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
        localStorage.setItem('yellowFilterEnabled', 'true');
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, 'true'); // Default ad filter on
        localStorage.setItem('hasInitializedDefaults', 'true');
        // Re-initialize UI with defaults
        initAPICheckboxes();
        updateSelectedApiCount();
    }

    // Set initial state for filter toggles
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') === 'true';
    }

    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle) {
        // Default to true if the storage item doesn't exist or is not 'false'
        adFilterToggle.checked = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false';
    }

    // Setup event listeners
    setupEventListeners();

    // Initial check for adult API selection and filter state
    // Use setTimeout to ensure DOM is fully ready and other scripts might have run
    setTimeout(checkAdultAPIsAndUpdateFilters, 100);

    console.log("Application Initialized.");
}

/**
 * Initializes the API selection checkboxes based on API_SITES and selectedAPIs.
 */
function initAPICheckboxes() {
    const container = document.getElementById('apiCheckboxes');
    if (!container) {
        console.error("API Checkbox container not found.");
        return;
    }
    container.innerHTML = ''; // Clear existing checkboxes

    const fragment = document.createDocumentFragment();

    // --- Normal APIs ---
    const normalApis = Object.entries(API_SITES).filter(([key, api]) => !api.adult);
    if (normalApis.length > 0) {
        const normalTitle = document.createElement('div');
        normalTitle.className = 'api-group-title';
        normalTitle.textContent = '普通资源';
        fragment.appendChild(normalTitle);

        normalApis.forEach(([apiKey, api]) => {
            fragment.appendChild(createApiCheckbox(apiKey, api));
        });
    }

    // --- Adult APIs (Conditional) ---
    const adultApis = Object.entries(API_SITES).filter(([key, api]) => api.adult);
    if (!HIDE_BUILTIN_ADULT_APIS && adultApis.length > 0) { // Check global config variable
        const adultTitle = document.createElement('div');
        adultTitle.className = 'api-group-title adult';
        adultTitle.innerHTML = `黄色资源采集站 <span class="adult-warning">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" class="w-3 h-3 mr-1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </span>`;
        fragment.appendChild(adultTitle);

        adultApis.forEach(([apiKey, api]) => {
            fragment.appendChild(createApiCheckbox(apiKey, api));
        });
    }

    container.appendChild(fragment);
}

/**
 * Creates a single API checkbox element.
 * @param {string} apiKey - The key of the API (e.g., 'heimuer').
 * @param {object} api - The API configuration object { name, adult? }.
 * @returns {HTMLDivElement} The checkbox container element.
 */
function createApiCheckbox(apiKey, api) {
    const isChecked = selectedAPIs.includes(apiKey);
    const isAdult = api.adult || false;

    const checkboxDiv = document.createElement('div');
    checkboxDiv.className = 'flex items-center space-x-1'; // Added space-x-1 for spacing

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `api_${apiKey}`;
    input.className = `form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333] ${isAdult ? 'api-adult' : ''}`;
    input.checked = isChecked;
    input.dataset.api = apiKey; // Store API key in data attribute

    const label = document.createElement('label');
    label.htmlFor = `api_${apiKey}`;
    label.className = `text-xs truncate cursor-pointer ${isAdult ? 'text-pink-400' : 'text-gray-400'}`;
    label.textContent = api.name;
    label.title = api.name; // Add title for full name on hover

    checkboxDiv.appendChild(input);
    checkboxDiv.appendChild(label);

    // Add event listener directly
    input.addEventListener('change', handleApiSelectionChange);

    return checkboxDiv;
}

/**
 * Handles changes in API checkbox selections.
 */
function handleApiSelectionChange() {
    updateSelectedAPIs();
    checkAdultAPIsAndUpdateFilters();
}

/**
 * Checks if any adult APIs are selected and updates the yellow filter state accordingly.
 */
function checkAdultAPIsAndUpdateFilters() {
    // Check built-in adult APIs
    const hasBuiltInAdultSelected = Array.from(document.querySelectorAll('#apiCheckboxes .api-adult:checked')).length > 0;

    // Check custom adult APIs
    const hasCustomAdultSelected = customAPIs.some((api, index) =>
        api.isAdult && selectedAPIs.includes(`custom_${index}`)
    );

    const hasAdultSelected = hasBuiltInAdultSelected || hasCustomAdultSelected;

    // Update yellow filter UI state
    updateYellowFilterState(hasAdultSelected);
}

/**
 * Updates the UI and state of the yellow content filter based on adult API selection.
 * @param {boolean} disableFilter - Whether to disable the filter due to adult API selection.
 */
function updateYellowFilterState(disableFilter) {
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    const yellowFilterContainer = document.getElementById('yellowFilterContainer'); // Assume container has this ID
    const filterDescription = document.getElementById('yellowFilterDescription'); // Assume description p has this ID

    if (!yellowFilterToggle || !yellowFilterContainer || !filterDescription) {
        console.warn("Yellow filter UI elements not found.");
        return;
    }

    if (disableFilter) {
        yellowFilterToggle.checked = false;
        yellowFilterToggle.disabled = true;
        localStorage.setItem('yellowFilterEnabled', 'false'); // Ensure storage reflects disabled state
        yellowFilterContainer.classList.add('filter-disabled');
        filterDescription.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
    } else {
        yellowFilterToggle.disabled = false;
        yellowFilterContainer.classList.remove('filter-disabled');
        // Restore description, but keep the current checked state from localStorage
        yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') === 'true';
        filterDescription.textContent = '过滤"伦理片"等黄色内容';
    }
}


/**
 * Renders the list of custom APIs in the settings panel.
 */
function renderCustomAPIsList() {
    const container = document.getElementById('customApisList');
    if (!container) return;

    if (customAPIs.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
        return;
    }

    container.innerHTML = ''; // Clear previous list
    const fragment = document.createDocumentFragment();

    customAPIs.forEach((api, index) => {
        const apiItem = document.createElement('div');
        apiItem.className = 'api-item flex items-center justify-between p-1 mb-1 bg-[#222] rounded'; // Re-added class for styling

        const isChecked = selectedAPIs.includes(`custom_${index}`);
        const textColorClass = api.isAdult ? 'text-pink-400' : 'text-white';
        const adultTag = api.isAdult ? '<span class="adult-tag text-xs mr-1">(18+)</span>' : '';

        apiItem.innerHTML = `
            <div class="flex items-center flex-1 min-w-0 mr-2"> <!-- Added mr-2 -->
                <input type="checkbox" id="custom_api_${index}"
                       class="form-checkbox h-3 w-3 text-blue-600 mr-1 flex-shrink-0 ${api.isAdult ? 'api-adult' : ''}"
                       ${isChecked ? 'checked' : ''}
                       data-custom-index="${index}">
                <div class="flex-1 min-w-0 overflow-hidden"> <!-- Added overflow-hidden -->
                    <div class="text-xs font-medium ${textColorClass} truncate" title="${api.name}">
                        ${adultTag}${sanitizeString(api.name)}
                    </div>
                    <div class="text-xs text-gray-500 truncate" title="${api.url}">${sanitizeString(api.url)}</div>
                </div>
            </div>
            <div class="flex items-center flex-shrink-0"> <!-- Added flex-shrink-0 -->
                <button class="custom-api-edit text-blue-500 hover:text-blue-700 text-xs px-1" data-index="${index}" title="编辑">✎</button>
                <button class="text-red-500 hover:text-red-700 text-xs px-1" data-index="${index}" title="删除">✕</button>
            </div>
        `;
        fragment.appendChild(apiItem);
    });

    container.appendChild(fragment);

    // Add event listeners using delegation for edit/delete buttons
    container.addEventListener('click', handleCustomApiListClick);
    // Add change listener using delegation for checkboxes
    container.addEventListener('change', handleCustomApiCheckboxChange);
}

/**
 * Event handler for clicks within the custom API list (Edit/Delete).
 * Uses event delegation.
 */
function handleCustomApiListClick(event) {
    const target = event.target;
    const index = target.dataset.index;

    if (index === undefined) return; // Click was not on a button with data-index

    if (target.classList.contains('custom-api-edit')) {
        editCustomApi(parseInt(index, 10));
    } else if (target.matches("button[title='删除']")) { // More specific selector for delete
         if (confirm(`确定要删除自定义API "${customAPIs[index]?.name}" 吗？`)) {
             removeCustomApi(parseInt(index, 10));
         }
    }
}
/**
 * Event handler for changes to custom API checkboxes.
 * Uses event delegation.
 */
function handleCustomApiCheckboxChange(event) {
     if (event.target.matches("input[type='checkbox']")) {
         handleApiSelectionChange(); // Reuse the common handler
     }
 }


/**
 * Populates the custom API form for editing.
 * @param {number} index - The index of the API to edit.
 */
function editCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;

    const api = customAPIs[index];
    const form = document.getElementById('addCustomApiForm');
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');
    const buttonContainer = form?.querySelector('#customApiButtons'); // Assume button container has ID

    if (!form || !nameInput || !urlInput || !isAdultInput || !buttonContainer) {
        console.error("Custom API form elements not found for editing.");
        return;
    }

    nameInput.value = api.name;
    urlInput.value = api.url;
    isAdultInput.checked = api.isAdult || false;

    form.classList.remove('hidden'); // Show form

    // Change buttons to Update/Cancel
    buttonContainer.innerHTML = `
        <button type="button" onclick="updateCustomApi(${index})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">更新</button>
        <button type="button" onclick="cancelEditCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
    `;
    nameInput.focus(); // Focus the name input
}

/**
 * Updates an existing custom API entry.
 * @param {number} index - The index of the API to update.
 */
function updateCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;

    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');

    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const isAdult = isAdultInput ? isAdultInput.checked : false;

    if (!name || !url) {
        showToast('API 名称和链接不能为空', 'warning');
        return;
    }

    if (!isValidHttpUrl(url)) {
        showToast('API链接格式不正确 (需以 http:// 或 https:// 开头)', 'warning');
        return;
    }

    // Remove trailing slash for consistency
    url = url.replace(/\/$/, "");

    // Update the array and save
    customAPIs[index] = { name, url, isAdult };
    saveCustomAPIs();

    // Refresh UI
    renderCustomAPIsList();
    checkAdultAPIsAndUpdateFilters(); // Re-check filter status
    resetCustomApiForm(); // Hide form and reset buttons

    showToast(`已更新自定义API: ${name}`, 'success'); // Assumes ui.js provides showToast
}

/**
 * Cancels the editing process and resets the form.
 */
function cancelEditCustomApi() {
    resetCustomApiForm();
}

/**
 * Resets the custom API form to its initial state (hidden, empty fields, Add/Cancel buttons).
 */
function resetCustomApiForm() {
    const form = document.getElementById('addCustomApiForm');
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');
    const buttonContainer = form?.querySelector('#customApiButtons');

     if (!form || !nameInput || !urlInput || !isAdultInput || !buttonContainer) return;

    nameInput.value = '';
    urlInput.value = '';
    isAdultInput.checked = false;
    form.classList.add('hidden');

    // Restore Add/Cancel buttons
    buttonContainer.innerHTML = `
        <button type="button" onclick="addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
        <button type="button" onclick="cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
    `;
}

/**
 * Updates the global `selectedAPIs` array based on current checkbox states and saves to localStorage.
 */
function updateSelectedAPIs() {
    const builtInChecked = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]:checked');
    const customChecked = document.querySelectorAll('#customApisList input[type="checkbox"]:checked');

    const builtInSelection = Array.from(builtInChecked).map(input => input.dataset.api);
    const customSelection = Array.from(customChecked).map(input => `custom_${input.dataset.customIndex}`);

    selectedAPIs = [...builtInSelection, ...customSelection];
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    updateSelectedApiCount();
    console.log("Selected APIs updated:", selectedAPIs);
}

/**
 * Updates the display showing the number of selected APIs.
 */
function updateSelectedApiCount() {
    const countEl = document.getElementById('selectedApiCount');
    if (countEl) {
        countEl.textContent = selectedAPIs.length;
    }
}

/**
 * Selects or deselects all API checkboxes.
 * @param {boolean} selectAll - True to select all, false to deselect all.
 * @param {boolean} excludeAdult - True to exclude adult APIs from selection/deselection.
 */
function selectAllAPIs(selectAll = true, excludeAdult = false) {
    const builtInCheckboxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');
    const customCheckboxes = document.querySelectorAll('#customApisList input[type="checkbox"]');

    builtInCheckboxes.forEach(checkbox => {
        if (excludeAdult && checkbox.classList.contains('api-adult')) {
             // If excluding adults, ensure they are unchecked when selecting all non-adults
             if (selectAll) checkbox.checked = false;
             // If deselecting all, adult exclusion doesn't matter, uncheck anyway
             else checkbox.checked = false;
        } else {
            checkbox.checked = selectAll;
        }
    });

    customCheckboxes.forEach(checkbox => {
        if (excludeAdult) {
            // Find the corresponding custom API config to check its 'isAdult' property
            const index = parseInt(checkbox.dataset.customIndex, 10);
            if (!isNaN(index) && customAPIs[index]?.isAdult) {
                 if (selectAll) checkbox.checked = false;
                 else checkbox.checked = false;
            } else {
                 checkbox.checked = selectAll;
            }
        }
        else {
            checkbox.checked = selectAll;
        }
    });


    updateSelectedAPIs();
    checkAdultAPIsAndUpdateFilters();
}

/**
 * Shows the form for adding a new custom API.
 */
function showAddCustomApiForm() {
    resetCustomApiForm(); // Ensure form is reset before showing
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.classList.remove('hidden');
        document.getElementById('customApiName')?.focus();
    }
}

/**
 * Hides the custom API form without adding.
 */
function cancelAddCustomApi() {
    resetCustomApiForm();
}

/**
 * Adds a new custom API entry.
 */
function addCustomApi() {
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const isAdultInput = document.getElementById('customApiIsAdult');

    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const isAdult = isAdultInput ? isAdultInput.checked : false;

    if (!name || !url) {
        showToast('API 名称和链接不能为空', 'warning');
        return;
    }

    if (!isValidHttpUrl(url)) {
        showToast('API链接格式不正确 (需以 http:// 或 https:// 开头)', 'warning');
        return;
    }

     // Check for duplicates
     if (customAPIs.some(api => api.url === url || api.name === name)) {
        showToast('已存在相同名称或链接的自定义API', 'warning');
        return;
    }

    url = url.replace(/\/$/, ""); // Remove trailing slash

    // Add to array
    customAPIs.push({ name, url, isAdult });
    saveCustomAPIs();

    // Automatically select the newly added API
    const newApiIndex = customAPIs.length - 1;
    selectedAPIs.push(`custom_${newApiIndex}`);
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    // Refresh UI
    renderCustomAPIsList();
    updateSelectedApiCount();
    checkAdultAPIsAndUpdateFilters();
    resetCustomApiForm(); // Hide form and reset

    showToast(`已添加自定义API: ${name}`, 'success');
}

/**
 * Removes a custom API entry.
 * @param {number} index - The index of the API to remove.
 */
function removeCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;

    const removedApi = customAPIs[index];

    // Remove from array
    customAPIs.splice(index, 1);
    saveCustomAPIs();

    // Update selected APIs, adjusting indices
    const removedId = `custom_${index}`;
    selectedAPIs = selectedAPIs
        .filter(id => id !== removedId)
        .map(id => {
            if (id.startsWith('custom_')) {
                const currentIndex = parseInt(id.replace('custom_', ''), 10);
                if (currentIndex > index) {
                    return `custom_${currentIndex - 1}`; // Adjust index
                }
            }
            return id;
        });
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    // Refresh UI
    renderCustomAPIsList();
    updateSelectedApiCount();
    checkAdultAPIsAndUpdateFilters();

    showToast(`已移除自定义API: ${removedApi.name}`, 'info');
}

/**
 * Saves the current customAPIs array to localStorage.
 */
function saveCustomAPIs() {
    try {
        localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    } catch (e) {
        console.error("Failed to save custom APIs to localStorage:", e);
        showToast("保存自定义API失败，可能存储已满", "error");
    }
}

/**
 * Sets up primary event listeners for the page.
 */
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.querySelector('button[onclick="search()"]');
    const settingsButton = document.querySelector('button[onclick="toggleSettings(event)"]');
    const historyButton = document.querySelector('button[onclick="toggleHistory(event)"]');
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    const adFilterToggle = document.getElementById('adFilterToggle');

    // Search on Enter key press
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            search();
        }
    });

    // Search on button click
    searchButton?.addEventListener('click', search);

    // Toggle Settings Panel
    // Note: toggleSettings function is defined in ui.js, ensure it's loaded

    // Toggle History Panel
    // Note: toggleHistory function is defined in ui.js, ensure it's loaded

    // Click outside to close panels
    document.addEventListener('click', (e) => {
        const settingsPanel = document.getElementById('settingsPanel');
        const historyPanel = document.getElementById('historyPanel');

        // Close Settings Panel
        if (settingsPanel?.classList.contains('show') &&
            !settingsPanel.contains(e.target) &&
            settingsButton && !settingsButton.contains(e.target)) {
             toggleSettings(e); // Use the toggle function to handle state
        }
        // Close History Panel
        if (historyPanel?.classList.contains('show') &&
            !historyPanel.contains(e.target) &&
            historyButton && !historyButton.contains(e.target)) {
            toggleHistory(e); // Use the toggle function
        }
    });

    // Yellow filter toggle change
    yellowFilterToggle?.addEventListener('change', (e) => {
        localStorage.setItem('yellowFilterEnabled', e.target.checked);
        // No need to call checkAdultAPIsAndUpdateFilters here as it's driven by API selection
    });

    // Ad filter toggle change
    adFilterToggle?.addEventListener('change', (e) => {
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, e.target.checked);
    });
}

/**
 * Performs the search operation based on selected APIs and query.
 */
async function search() {
    // Password protection check
    if (typeof window.isPasswordProtected === 'function' && window.isPasswordProtected() &&
        typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
        if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
        return;
    }

    const searchInput = document.getElementById('searchInput');
    const query = searchInput?.value.trim();

    if (!query) {
        showToast('请输入搜索内容', 'info');
        searchInput?.focus();
        return;
    }

    if (selectedAPIs.length === 0) {
        showToast('请至少选择一个API源', 'warning');
        return;
    }

    // Show loading indicator (assuming ui.js provides showLoading/hideLoading)
    if (typeof showLoading === 'function') showLoading('正在搜索...');

    try {
        // Save search term to history (assuming ui.js provides saveSearchHistory)
        if (typeof saveSearchHistory === 'function') saveSearchHistory(query);

        // Create fetch promises for all selected APIs
        const searchPromises = selectedAPIs.map(apiId => fetchSearchResults(apiId, query));

        // Wait for all searches to complete (or timeout individually)
        const resultsArrays = await Promise.allSettled(searchPromises);

        // Combine results from successful searches
        let allResults = [];
        resultsArrays.forEach((result, index) => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                allResults = allResults.concat(result.value);
            } else if (result.status === 'rejected') {
                 // Log errors from individual API searches
                 console.warn(`Search failed for API ID ${selectedAPIs[index]}:`, result.reason);
                 // Optionally show a toast for failed sources? Maybe too noisy.
            }
        });

        // Display results
        renderSearchResults(allResults, query);

    } catch (error) {
        // Catch unexpected errors during the search process orchestration
        console.error('Error during search orchestration:', error);
        showToast('搜索过程中发生错误', 'error');
        // Ensure results area is cleared or shows an error message
        renderSearchResults([], query, true); // Pass error flag
    } finally {
        // Hide loading indicator
        if (typeof hideLoading === 'function') hideLoading();
    }
}

/**
 * Fetches search results from a single API source.
 * @param {string} apiId - The ID of the API (e.g., 'heimuer' or 'custom_0').
 * @param {string} query - The search query.
 * @returns {Promise<Array>} A promise resolving to an array of result items.
 */
async function fetchSearchResults(apiId, query) {
    let apiUrl, apiName, customApiInfo = null;

    if (apiId.startsWith('custom_')) {
        const customIndex = parseInt(apiId.replace('custom_', ''), 10);
        customApiInfo = getCustomApiInfo(customIndex); // Assumes ui.js provides this
        if (!customApiInfo || !isValidHttpUrl(customApiInfo.url)) {
             throw new Error(`Invalid configuration for custom API index ${customIndex}`);
        }
        apiUrl = `${customApiInfo.url}${API_CONFIG.search.path}${encodeURIComponent(query)}`;
        apiName = customApiInfo.name;
    } else {
        if (!API_SITES[apiId] || !isValidHttpUrl(API_SITES[apiId].api)) {
            throw new Error(`Invalid configuration for built-in API ${apiId}`);
        }
        apiUrl = `${API_SITES[apiId].api}${API_CONFIG.search.path}${encodeURIComponent(query)}`;
        apiName = API_SITES[apiId].name;
    }

    // Use the intercepted fetch which includes proxy and timeout logic from api.js
    const response = await fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${apiId.startsWith('custom_') ? 'custom' : apiId}${customApiInfo ? `&customApi=${encodeURIComponent(customApiInfo.url)}` : ''}`);

    if (!response.ok) {
         // api.js's fetch interceptor should handle non-ok status, but double-check
         throw new Error(`Search request failed for ${apiName} with status ${response.status}`);
    }

    const data = await response.json();

    // api.js should return {code, list}, check response structure
    if (data.code !== 200 || !Array.isArray(data.list)) {
         // Throw error if the structure is wrong, even if code is 200
         if (data.code === 200 && !Array.isArray(data.list)) {
             throw new Error(`Invalid response format from ${apiName}: 'list' array missing.`);
         }
         // Throw error based on the message from api.js if code is not 200
         throw new Error(`API ${apiName} returned error: ${data.msg || 'Unknown error'}`);
    }

    // Return the list of results (api.js already adds source info)
    return data.list || [];
}

/**
 * Renders the search results on the page.
 * @param {Array} results - Array of result items.
 * @param {string} query - The original search query.
 * @param {boolean} [isError=false] - Flag indicating if an error occurred during search.
 */
function renderSearchResults(results, query, isError = false) {
    const resultsDiv = document.getElementById('results');
    const searchArea = document.getElementById('searchArea');
    const resultsArea = document.getElementById('resultsArea');

    if (!resultsDiv || !searchArea || !resultsArea) {
        console.error("Required elements for displaying results not found.");
        return;
    }

    // Adjust layout: move search bar up, show results area
    searchArea.classList.remove('flex-1', 'justify-center');
    searchArea.classList.add('mb-8'); // Add margin below search bar
    resultsArea.classList.remove('hidden');

    resultsDiv.innerHTML = ''; // Clear previous results

    // Filter results based on yellow filter setting
    const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
    const filteredResults = yellowFilterEnabled ? filterYellowContent(results) : results;

    if (isError) {
        resultsDiv.innerHTML = createMessageCard('搜索出错', '无法加载搜索结果，请稍后重试或检查API设置。');
        return;
    }

    if (filteredResults.length === 0) {
         if (results.length > 0 && yellowFilterEnabled) {
            // Results were found but filtered out
             resultsDiv.innerHTML = createMessageCard('无匹配结果', `根据您的过滤设置，没有找到与 "${sanitizeString(query)}" 相关的结果。`, 'filter');
         } else {
             // No results found at all
             resultsDiv.innerHTML = createMessageCard('无匹配结果', `没有找到与 "${sanitizeString(query)}" 相关的结果，请尝试其他关键词。`, 'search');
         }
        return;
    }

    // Create result cards using a document fragment for performance
    const fragment = document.createDocumentFragment();
    filteredResults.forEach(item => {
        fragment.appendChild(createResultCard(item));
    });
    resultsDiv.appendChild(fragment);
}

/**
 * Creates a message card (e.g., for no results or errors).
 * @param {string} title - The title of the message.
 * @param {string} message - The detailed message.
 * @param {'search' | 'filter' | 'error'} type - The type of message for icon selection.
 * @returns {string} HTML string for the message card.
 */
function createMessageCard(title, message, type = 'search') {
     const icons = {
         search: `<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />`,
         filter: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.572a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />`,
         error: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />`
     };
     const iconSvg = icons[type] || icons.search;

    return `
        <div class="col-span-full text-center py-16">
            <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                ${iconSvg}
            </svg>
            <h3 class="mt-2 text-lg font-medium text-gray-400">${sanitizeString(title)}</h3>
            <p class="mt-1 text-sm text-gray-500">${sanitizeString(message)}</p>
        </div>
    `;
}

/**
 * Creates an HTML element for a single search result card.
 * @param {object} item - The result item data from the API.
 * @returns {HTMLDivElement} The result card element.
 */
function createResultCard(item) {
    const card = document.createElement('div');
    card.className = 'card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full'; // Ensure h-full

    // --- MODIFICATION START ---
    // Get raw ID first, handle potential non-string types explicitly for the dataset
    const rawId = item?.vod_id;
    const idString = (rawId !== null && rawId !== undefined) ? String(rawId) : ''; // Convert ID to string, handle null/undefined

    // Use helper function for properties that need sanitization and might be missing
    const name = getSafeProperty(item, 'vod_name', '未知标题');
    const remarks = getSafeProperty(item, 'vod_remarks', '暂无介绍');
    const typeName = getSafeProperty(item, 'type_name');
    const year = getSafeProperty(item, 'vod_year');
    const sourceName = getSafeProperty(item, 'source_name');
    const sourceCode = getSafeProperty(item, 'source_code');

    // Sanitize URLs separately
    const pic = item?.vod_pic ? sanitizeUrl(String(item.vod_pic)) : ''; // Ensure URL is string before sanitizing
    const apiUrl = item?.api_url ? sanitizeUrl(String(item.api_url)) : ''; // Ensure URL is string before sanitizing
    // --- MODIFICATION END ---

    const hasCover = pic.startsWith('http'); // Check if pic is a valid URL

    // Add data attributes for click handler
    // Use the processed idString for data-id
    card.dataset.id = idString;
    card.dataset.name = name; // Already sanitized
    card.dataset.source = sourceCode; // Already sanitized
    if (apiUrl) {
        card.dataset.apiUrl = apiUrl; // Already sanitized
    }
     // Add specific identifier for event delegation
     card.dataset.action = 'showDetails';

    card.innerHTML = `
        <div class="md:flex h-full"> <!-- Ensure flex container takes full height -->
            ${hasCover ? `
            <div class="md:w-1/4 relative overflow-hidden flex-shrink-0"> <!-- Prevent image container from shrinking -->
                <div class="w-full h-40 md:h-full bg-[#222]"> <!-- Add background color for loading/error state -->
                    <img src="${pic}" alt="${name}"
                         class="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                         onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 150 225%22 width=%22150%22 height=%22225%22 fill=%22%23333%22%3E%3Crect width=%22150%22 height=%22225%22 fill=%22%231a1a1a%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214px%22 fill=%22%23555%22%3E无封面%3C/text%3E%3C/svg%3E'; this.classList.add('object-contain');"
                         loading="lazy">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent opacity-70 md:opacity-40 pointer-events-none"></div> <!-- Adjusted gradient -->
                </div>
            </div>` : ''}

            <div class="p-3 flex flex-col flex-grow ${hasCover ? 'md:w-3/4' : 'w-full'}">
                <div class="flex-grow">
                    <h3 class="text-lg font-semibold mb-2 break-words" title="${name}">${name}</h3>
                    <div class="flex flex-wrap gap-1 mb-2 text-xs">
                        ${typeName ? `<span class="py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">${typeName}</span>` : ''}
                        ${year ? `<span class="py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">${year}</span>` : ''}
                    </div>
                    <p class="text-gray-400 text-xs h-9 overflow-hidden" title="${remarks}">
                        ${remarks}
                    </p>
                </div>
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-700"> <!-- Darker border -->
                    ${sourceName ? `<span class="text-xs py-0.5 px-1.5 rounded bg-[#2a2a2a] text-gray-400">${sourceName}</span>` : '<div></div>'}
                    <span class="text-xs text-gray-500 flex items-center">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /> <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                         </svg>
                         点击播放
                    </span>
                </div>
            </div>
        </div>
    `;

    return card;
}
/ Also, ensure the sanitizeUrl function exists and handles potential non-string inputs safely.
// If you don't have it, here's a basic version:
/**
 * Basic URL sanitization (replace if you have a more robust one).
 * Ensures the output is a string and potentially escapes characters.
 * WARNING: This is NOT a replacement for proper URL validation/sanitization libraries
 * if security against complex attacks is paramount.
 * @param {any} urlInput - The URL to sanitize.
 * @returns {string} The sanitized URL string.
 */
function sanitizeUrl(urlInput) {
    if (urlInput === null || urlInput === undefined) {
        return '';
    }
    const urlString = String(urlInput);
    // Basic check for potentially harmful characters or protocols (customize as needed)
    // This example is very basic and focuses on preventing simple script injection.
    if (/^javascript:/i.test(urlString)) {
        console.warn("Blocked potentially unsafe URL protocol:", urlString);
        return ''; // Block javascript: URLs
    }
    // Simple escaping of characters that might break HTML attributes
    return urlString.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Add event listener to the results container for delegated clicks
document.addEventListener('DOMContentLoaded', () => {
    const resultsContainer = document.getElementById('results');
    resultsContainer?.addEventListener('click', (event) => {
        // Find the closest ancestor card element with the action dataset
        const card = event.target.closest('.card-hover[data-action="showDetails"]');
        if (card) {
            const { id, name, source, apiUrl } = card.dataset;
             // Ensure required data is present before calling showDetails
             if (id && name && source) {
                showDetails(id, name, source, apiUrl);
             } else {
                console.warn("Card data attributes missing for showDetails", card.dataset);
                showToast("无法加载详情，卡片数据不完整", "error");
             }
        }
    });
});


/**
 * Safely gets a property from an object, returning a default value if not found or invalid.
 * @param {object} obj - The object to get the property from.
 * @param {string} propName - The name of the property.
 * @param {*} [defaultValue=''] - The default value to return.
 * @returns {*} The property value or the default value.
 */
function getSafeProperty(obj, propName, defaultValue = '') {
    return obj && obj[propName] ? sanitizeString(obj[propName]) : defaultValue;
}


/**
 * Filters out results based on keywords in the type_name.
 * @param {Array} results - The array of result items.
 * @returns {Array} The filtered array of results.
 */
function filterYellowContent(results) {
    // Keywords indicating potentially unwanted content (customize as needed)
     const bannedKeywords = ['伦理片', '倫理片', '门事件', '萝莉', '少女', '制服', '国产传媒', 'cosplay', '黑丝', '无码', '無碼', '有码', '有碼', '日本有码', '日本無碼', 'SWAG', '网红主播', '色情片', '同性', '福利视频', '福利片', 'AV', 'av', '成人', '18禁', '情色']; // Added more keywords

    if (!Array.isArray(results)) return [];

    return results.filter(item => {
        const typeName = (item.type_name || '').toLowerCase(); // Normalize to lowercase
        const vodName = (item.vod_name || '').toLowerCase(); // Also check title
        const remarks = (item.vod_remarks || '').toLowerCase(); // Check remarks

        // Check if any banned keyword is present in type, name, or remarks
        return !bannedKeywords.some(keyword =>
            typeName.includes(keyword.toLowerCase()) ||
            vodName.includes(keyword.toLowerCase()) ||
            remarks.includes(keyword.toLowerCase())
        );
    });
}

/**
 * Fetches and displays video details in a modal.
 * @param {string} id - The video ID.
 * @param {string} name - The video name.
 * @param {string} sourceCode - The source code ('heimuer', 'custom_0', etc.).
 * @param {string} [customApiUrl=''] - The custom API URL if applicable.
 */
async function showDetails(id, name, sourceCode, customApiUrl = '') {
    // Password check
    if (typeof window.isPasswordProtected === 'function' && window.isPasswordProtected() &&
        typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
        if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
        return;
    }

    if (!id) {
        showToast('视频ID无效', 'error');
        return;
    }

    if (typeof showLoading === 'function') showLoading('加载详情...');

    try {
        // Construct the fetch URL for the /api/detail endpoint
        let detailFetchUrl = `/api/detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(sourceCode)}`;
        if (sourceCode.startsWith('custom_')) {
            // Custom API needs the URL passed
            const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
            const customApiInfo = getCustomApiInfo(customIndex); // Assumes ui.js provides this
             if (!customApiInfo || !isValidHttpUrl(customApiInfo.url)) {
                 throw new Error("无效的自定义API配置，无法获取详情。");
             }
             detailFetchUrl += `&customApi=${encodeURIComponent(customApiInfo.url)}`;
             // Check if scraping is needed for this custom source (based on original search result?)
             // This part is tricky without knowing if scraping is needed *before* fetching.
             // Let's assume api.js handles the 'useDetail' logic based on config or other means.
        } else {
            // For built-in APIs, check if special handling is needed
            if (API_SITES[sourceCode]?.detail) {
                 detailFetchUrl += `&useDetail=true`; // Signal api.js to use scraping logic
            }
        }

        const response = await fetch(detailFetchUrl);
        const data = await response.json();

        if (!response.ok || data.code !== 200) {
            // Handle specific "Not Found" case gracefully
            if (data.code === 404) {
                 showToast(`未找到 "${sanitizeString(name)}" 的详细信息`, 'info');
            } else {
                 throw new Error(data.msg || `获取详情失败 (状态: ${response.status})`);
            }
            if (typeof hideLoading === 'function') hideLoading(); // Hide loading on known failure
             return; // Stop execution if details not found or error occurred
        }

        // Details fetched successfully
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');

        if (!modal || !modalTitle || !modalContent) {
            console.error("Modal elements not found.");
             throw new Error("UI 错误：无法显示详情模态框。");
        }

        // Update modal title safely
        const sourceName = data.videoInfo?.source_name ? ` <span class="text-sm font-normal text-gray-400">(${sanitizeString(data.videoInfo.source_name)})</span>` : '';
        modalTitle.innerHTML = `<span class="break-words">${sanitizeString(name)}</span>${sourceName}`;

        // Store current video context for player navigation
        currentVideoTitle = name; // Use the name passed initially for consistency
        currentEpisodes = data.episodes || [];
        episodesReversed = false; // Reset sort order

        // Render episodes
        if (currentEpisodes.length > 0) {
            modalContent.innerHTML = `
                <div class="flex justify-end mb-2">
                     <button onclick="toggleEpisodeOrder()" id="episodeOrderToggle" class="px-3 py-1 bg-[#222] hover:bg-[#333] border border-[#333] text-white text-xs rounded flex items-center space-x-1" title="切换排序">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform duration-300" id="episodeOrderIcon" viewBox="0 0 20 20" fill="currentColor">
                             <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z" clip-rule="evenodd" />
                             <path fill-rule="evenodd" d="M5.293 9.293a1 1 0 011.414 0L10 12.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                         </svg>
                         <span id="episodeOrderText">倒序排列</span>
                     </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodesHtml(name)}
                </div>
            `;
             updateEpisodeOrderButtonUI(); // Update button state
        } else {
            modalContent.innerHTML = '<p class="text-center text-gray-400 py-8">没有找到可播放的视频集数</p>';
        }

        // Show modal using UI function
        if (typeof showModal === 'function') { // Assumes ui.js provides showModal
            showModal();
        } else {
             modal.classList.remove('hidden');
             modal.classList.add('show'); // Use class for transition/animation
        }

    } catch (error) {
        console.error('获取详情错误:', error);
        showToast(`获取详情失败: ${error.message}`, 'error');
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

/**
 * Generates the HTML string for episode buttons.
 * @param {string} vodName - The name of the video (for the playVideo call).
 * @returns {string} HTML string of button elements.
 */
function renderEpisodesHtml(vodName) {
    const episodesToRender = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;

    // Use encodeURIComponent for attributes to prevent XSS from URLs/names
    const safeVodName = encodeURIComponent(vodName);

    return episodesToRender.map((episodeUrl, index) => {
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        const safeEpisodeUrl = encodeURIComponent(episodeUrl); // Encode URL for attribute

        // Basic check if URL is valid before creating button
        if (!isValidHttpUrl(episodeUrl)) {
             console.warn(`Invalid episode URL skipped: ${episodeUrl}`);
             return ''; // Skip rendering button for invalid URL
        }

        return `
            <button onclick="playVideo('${safeEpisodeUrl}', '${safeVodName}', ${realIndex})"
                    id="episode-${realIndex}"
                    class="px-2 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center text-xs truncate episode-btn"
                    title="第 ${realIndex + 1} 集">
                第 ${realIndex + 1} 集
            </button>
        `;
    }).join('');
}

/**
 * Toggles the sort order of episodes in the modal and re-renders them.
 */
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    // Re-render episodes grid
    const episodesGrid = document.getElementById('episodesGrid');
    if (episodesGrid && currentVideoTitle) { // Ensure title is available
        episodesGrid.innerHTML = renderEpisodesHtml(currentVideoTitle);
    }
     updateEpisodeOrderButtonUI();
}

/** Updates the UI of the episode order toggle button */
function updateEpisodeOrderButtonUI() {
     const toggleBtn = document.getElementById('episodeOrderToggle');
     const orderText = document.getElementById('episodeOrderText');
     const orderIcon = document.getElementById('episodeOrderIcon');

     if (toggleBtn && orderText && orderIcon) {
         orderText.textContent = episodesReversed ? '正序排列' : '倒序排列';
         orderIcon.style.transform = episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
         toggleBtn.title = episodesReversed ? '切换为正序' : '切换为倒序';
     }
 }


/**
 * Opens the player page in a new tab to play the selected video.
 * Saves necessary context to localStorage for the player page.
 * @param {string} encodedUrl - The encoded URL of the video episode.
 * @param {string} encodedVodName - The encoded name of the video.
 * @param {number} episodeIndex - The index of the episode being played.
 */
function playVideo(encodedUrl, encodedVodName, episodeIndex) {
     // Password check
     if (typeof window.isPasswordProtected === 'function' && window.isPasswordProtected() &&
         typeof window.isPasswordVerified === 'function' && !window.isPasswordVerified()) {
         if (typeof window.showPasswordModal === 'function') window.showPasswordModal();
         return;
     }

     let url, vodName;
     try {
        url = decodeURIComponent(encodedUrl);
        vodName = decodeURIComponent(encodedVodName);
     } catch (e) {
        console.error("Failed to decode URL or VOD name:", e);
        showToast("无法播放：视频链接或名称无效", "error");
        return;
     }


    if (!isValidHttpUrl(url)) {
        showToast('无效的视频链接', 'error');
        return;
    }

    // Extract source name from modal title (if possible)
    let sourceName = '';
    const modalTitleSpan = document.querySelector('#modalTitle span.text-gray-400');
    if (modalTitleSpan) {
        const match = modalTitleSpan.textContent.match(/\(([^)]+)\)/);
        if (match && match[1]) {
            sourceName = match[1].trim();
        }
    }

    // Save context for player.html
    try {
        localStorage.setItem('currentVideoTitle', vodName);
        localStorage.setItem('currentEpisodeIndex', episodeIndex);
        // Store potentially large episodes array carefully
        localStorage.setItem('currentEpisodes', JSON.stringify(currentEpisodes || []));
        localStorage.setItem('episodesReversed', episodesReversed);
    } catch (e) {
        console.error("Failed to save player context to localStorage:", e);
        // Continue anyway, player might degrade gracefully
    }

    // Create video info for viewing history
    const videoInfo = {
        title: vodName,
        url: url, // Store the actual playable URL in history item
        episodeIndex: episodeIndex,
        sourceName: sourceName,
        timestamp: Date.now(),
        // Include full episodes list in history item for reliable context restoration
        episodes: currentEpisodes && currentEpisodes.length > 0 ? [...currentEpisodes] : []
    };

    // Add to viewing history (assuming ui.js provides addToViewingHistory)
    if (typeof addToViewingHistory === 'function') {
        addToViewingHistory(videoInfo);
    }

    // Construct player URL with necessary parameters
    const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(vodName)}&index=${episodeIndex}&source=${encodeURIComponent(sourceName)}`;

    // Open in new tab
    window.open(playerUrl, '_blank', 'noopener,noreferrer'); // Added security attributes

    // Optionally close the modal after opening the player
    // if (typeof closeModal === 'function') closeModal();
}

// Helper function to check for valid http/https URLs
function isValidHttpUrl(string) {
  if (!string) return false;
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// Helper function for basic string sanitization (prevent basic XSS)
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// --- Initialization ---
// Ensure the DOM is fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp(); // DOMContentLoaded has already fired
}
