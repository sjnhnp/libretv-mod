// --- File: js/api_source_manager.js ---
// Module-level variables (private)
const APISourceManager = {
    /**
     * Initialize API source management
     */
    init: function () {
        this.initAPICheckboxes();
        this.renderCustomAPIsList();
        this.updateSelectedApiCount();
        this.checkAdultAPIsSelected();
    },

    /**
     * Initialize API checkboxes in the UI
     */
    initAPICheckboxes: function () {
        const container = DOMCache.get('apiCheckboxes') || document.getElementById('apiCheckboxes');
        if (!container) {
            console.warn("[APISourceManager] API checkboxes container not found.");
            return;
        }

        container.innerHTML = '';

        // 普通API组标题
        let titleNormal = document.createElement('div');
        titleNormal.className = 'api-group-title';
        titleNormal.textContent = '普通资源';
        container.appendChild(titleNormal);

        // 普通API
        Object.keys(API_SITES).forEach(apiKey => {
            const api = API_SITES[apiKey];
            if (api.adult) return; // Skip adult APIs for this section
            let box = document.createElement('div');
            box.className = 'flex items-center';
            // Ensure AppState.get('selectedAPIs') is available and an array
            const selectedAPIs = AppState.get('selectedAPIs') || [];
            box.innerHTML = `<input type="checkbox" id="api_${apiKey}" 
                class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]" 
                ${selectedAPIs.includes(apiKey) ? 'checked' : ''} data-api="${apiKey}">
                <label for="api_${apiKey}" class="ml-1 text-xs text-gray-400 truncate">${api.name}</label>`;
            container.appendChild(box);
            box.querySelector('input').addEventListener('change', () => {
                this.updateSelectedAPIs();
                this.checkAdultAPIsSelected();
            });
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
            Object.keys(API_SITES).filter(key => API_SITES[key].adult).forEach(apiKey => {
                const api = API_SITES[apiKey];
                let box = document.createElement('div');
                box.className = 'flex items-center';
                const selectedAPIs = AppState.get('selectedAPIs') || [];
                box.innerHTML = `<input type="checkbox" id="api_${apiKey}" 
                    class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333] api-adult"
                    ${selectedAPIs.includes(apiKey) ? 'checked' : ''} data-api="${apiKey}">
                    <label for="api_${apiKey}" class="ml-1 text-xs text-pink-400 truncate">${api.name}</label>`;
                container.appendChild(box);
                box.querySelector('input').addEventListener('change', () => {
                    this.updateSelectedAPIs();
                    this.checkAdultAPIsSelected();
                });
            });
        }
    },

    /**
     * Check if adult APIs are selected and manage yellow filter accordingly
     */
    checkAdultAPIsSelected: function () {
        const adultBuiltin = document.querySelectorAll('#apiCheckboxes .api-adult:checked');
        const customAdult = document.querySelectorAll('#customApisList .api-adult:checked');
        const hasAdult = adultBuiltin.length > 0 || customAdult.length > 0;
        const yellowToggle = DOMCache.get('yellowFilterToggle') || document.getElementById('yellowFilterToggle');
        if (!yellowToggle) return;

        const row = yellowToggle.closest('div.flex.items-center.justify-between'); // More specific selector for the row
        const desc = row ? row.querySelector('p.filter-description') : null; // Find description within that row

        if (hasAdult) {
            yellowToggle.checked = false;
            yellowToggle.disabled = true;
            localStorage.setItem('yellowFilterEnabled', 'false');
            if (row) row.classList.add('filter-disabled');
            if (desc) desc.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
            const tooltip = row ? row.querySelector('.filter-tooltip') : null;
            if (tooltip) tooltip.remove();
        } else {
            yellowToggle.disabled = false;
            if (row) row.classList.remove('filter-disabled');
            if (desc) desc.textContent = '过滤"伦理片"等黄色内容';
            // If tooltip was removed, it stays removed unless you re-add it.
        }
    },

    /**
     * Render the list of custom APIs
     */
    renderCustomAPIsList: function () {
        const container = DOMCache.get('customApisList') || document.getElementById('customApisList');
        if (!container) {
            console.warn("[APISourceManager] Custom APIs list container not found.");
            return;
        }

        const customAPIs = AppState.get('customAPIs') || [];
        container.innerHTML = customAPIs.length ?
            '' : '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';

        customAPIs.forEach((api, idx) => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
            const textColorClass = api.isAdult ? 'text-pink-400' : 'text-white';
            const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';
            const selectedAPIs = AppState.get('selectedAPIs') || [];
            item.innerHTML = `
                <div class="flex items-center flex-1 min-w-0">
                    <input type="checkbox" id="custom_api_${idx}" 
                        class="form-checkbox h-3 w-3 text-blue-600 mr-1 ${api.isAdult ? 'api-adult' : ''}"
                        ${selectedAPIs.includes('custom_' + idx) ? 'checked' : ''} data-custom-index="${idx}">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium ${textColorClass} truncate" title="${api.name}">${adultTag}${api.name}</div>
                        <div class="text-xs text-gray-500 truncate" title="${api.url}">${api.url}</div>
                    </div>
                </div>
                <div class="flex items-center">
                    <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="APISourceManager.editCustomApi(${idx})" aria-label="编辑自定义API ${api.name}">✎</button>
                    <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="APISourceManager.removeCustomApi(${idx})" aria-label="删除自定义API ${api.name}">✕</button>
                </div>`;
            container.appendChild(item);
            item.querySelector('input').addEventListener('change', () => {
                this.updateSelectedAPIs();
                this.checkAdultAPIsSelected();
            });
        });
    },

    /**
     * Edit a custom API
     * @param {number} index - Index of the API to edit
     */
    editCustomApi: function (index) {
        const customAPIs = AppState.get('customAPIs') || [];
        if (index < 0 || index >= customAPIs.length) return;

        const api = customAPIs[index];
        const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
        const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
        const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');

        if (!nameInput || !urlInput || !isAdultInput) {
            console.error("Custom API form elements not found for editing.");
            return;
        }

        nameInput.value = api.name;
        urlInput.value = api.url;
        isAdultInput.checked = !!api.isAdult;

        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) {
            form.classList.remove('hidden');
            const buttonContainer = form.querySelector('div:last-child'); // Assuming buttons are in the last div
            if (buttonContainer) {
                buttonContainer.innerHTML = `
                    <button onclick="APISourceManager.updateCustomApi(${index})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">更新</button>
                    <button onclick="APISourceManager.cancelEditCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
                `;
            }
        }
    },

    /**
     * Update a custom API
     * @param {number} index - Index of the API to update
     */
    updateCustomApi: function (index) {
        const customAPIs = AppState.get('customAPIs') || [];
        if (index < 0 || index >= customAPIs.length) return;

        const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
        const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
        const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');

        if (!nameInput || !urlInput || !isAdultInput) {
            console.error("Custom API form elements not found for updating.");
            return;
        }

        const name = nameInput.value.trim();
        let url = urlInput.value.trim();
        const isAdult = isAdultInput.checked;

        if (!name || !url) {
            if (typeof showToast === 'function') showToast('请输入API名称和链接', 'warning');
            return;
        }
        if (!/^https?:\/\/.+/.test(url)) {
            if (typeof showToast === 'function') showToast('API链接格式不正确，需以http://或https://开头', 'warning');
            return;
        }
        if (url.endsWith('/')) url = url.slice(0, -1);

        const updatedCustomAPIs = [...customAPIs];
        updatedCustomAPIs[index] = { name, url, isAdult }; // Ensure 'detail' is also handled if it's part of your custom API object
        AppState.set('customAPIs', updatedCustomAPIs);
        localStorage.setItem('customAPIs', JSON.stringify(updatedCustomAPIs));

        this.renderCustomAPIsList();
        this.checkAdultAPIsSelected();
        this.restoreAddCustomApiButtons();

        nameInput.value = '';
        urlInput.value = '';
        isAdultInput.checked = false;

        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) form.classList.add('hidden');
        if (typeof showToast === 'function') showToast('已更新自定义API: ' + name, 'success');
    },

    /**
     * Select all APIs
     * @param {boolean} selectAll - Whether to select all APIs
     * @param {boolean} excludeAdult - Whether to exclude adult APIs
     */
    selectAllAPIs: function (selectAll = true, excludeAdult = false) {
        const checkboxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');
        checkboxes.forEach(box => {
            if (excludeAdult && box.classList.contains('api-adult')) {
                box.checked = false;
            } else {
                box.checked = selectAll;
            }
        });
        // Also handle custom API checkboxes if you want selectAll to affect them
        const customCheckboxes = document.querySelectorAll('#customApisList input[type="checkbox"]');
         customCheckboxes.forEach(box => {
            if (excludeAdult && box.classList.contains('api-adult')) { // Assuming custom adult APIs also have 'api-adult'
                box.checked = false;
            } else {
                box.checked = selectAll;
            }
        });
        this.updateSelectedAPIs();
        this.checkAdultAPIsSelected();
    },

    /**
     * Update selected APIs in AppState and localStorage
     */
    updateSelectedAPIs: function () {
        const builtIn = Array.from(document.querySelectorAll('#apiCheckboxes input:checked')).map(input => input.dataset.api);
        const custom = Array.from(document.querySelectorAll('#customApisList input:checked')).map(input => 'custom_' + input.dataset.customIndex);
        const selectedAPIs = [...builtIn, ...custom];

        AppState.set('selectedAPIs', selectedAPIs);
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
        this.updateSelectedApiCount();
    },

    /**
     * Update selected API count display
     */
    updateSelectedApiCount: function () {
        const countElement = DOMCache.get('selectedApiCount') || document.getElementById('selectedApiCount');
        if (countElement) {
            const selectedAPIs = AppState.get('selectedAPIs') || [];
            countElement.textContent = selectedAPIs.length;
        }
    },

    /**
     * Add a custom API
     */
    addCustomApi: function () {
        const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
        const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
        const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');
        
        if (!nameInput || !urlInput || !isAdultInput) {
            console.error("Custom API form elements not found for adding.");
            return;
        }

        const name = nameInput.value.trim();
        let url = urlInput.value.trim();
        const isAdult = isAdultInput.checked;

        if (!name || !url) {
            if (typeof showToast === 'function') showToast('请输入API名称和链接', 'warning');
            return;
        }
        if (!/^https?:\/\/.+/.test(url)) {
            if (typeof showToast === 'function') showToast('API链接格式不正确，需以http://或https://开头', 'warning');
            return;
        }
        if (url.endsWith('/')) url = url.slice(0, -1);

        const customAPIs = AppState.get('customAPIs') || [];
        // Consider adding a 'detail' field if your custom APIs might have separate HTML scraping URLs
        const newApiObject = { name, url, isAdult /*, detail: optionalDetailUrl */ };
        const updatedCustomAPIs = [...customAPIs, newApiObject];
        AppState.set('customAPIs', updatedCustomAPIs);
        localStorage.setItem('customAPIs', JSON.stringify(updatedCustomAPIs));

        const newApiIndex = updatedCustomAPIs.length - 1;
        const selectedAPIs = AppState.get('selectedAPIs') || [];
        const updatedSelectedAPIs = [...selectedAPIs, 'custom_' + newApiIndex];
        AppState.set('selectedAPIs', updatedSelectedAPIs);
        localStorage.setItem('selectedAPIs', JSON.stringify(updatedSelectedAPIs));

        this.renderCustomAPIsList();
        this.updateSelectedApiCount();
        this.checkAdultAPIsSelected();

        nameInput.value = '';
        urlInput.value = '';
        isAdultInput.checked = false;
        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) form.classList.add('hidden');
        if (typeof showToast === 'function') showToast('已添加自定义API: ' + name, 'success');
    },

    /**
     * Remove a custom API
     * @param {number} index - Index of the API to remove
     */
    removeCustomApi: function (index) {
        const customAPIs = AppState.get('customAPIs') || [];
        if (index < 0 || index >= customAPIs.length) return;

        const apiName = customAPIs[index].name;
        const updatedCustomAPIs = customAPIs.filter((_, i) => i !== index);
        AppState.set('customAPIs', updatedCustomAPIs);
        localStorage.setItem('customAPIs', JSON.stringify(updatedCustomAPIs));

        const selectedAPIs = AppState.get('selectedAPIs') || [];
        const customApiCodeToRemove = 'custom_' + index;
        let finalSelectedAPIs = selectedAPIs.filter(api => api !== customApiCodeToRemove);

        // Adjust indices for subsequent custom APIs in the selected list
        finalSelectedAPIs = finalSelectedAPIs.map(api => {
            if (api.startsWith('custom_')) {
                const apiIdx = parseInt(api.split('_')[1]);
                if (apiIdx > index) {
                    return 'custom_' + (apiIdx - 1);
                }
            }
            return api;
        });

        AppState.set('selectedAPIs', finalSelectedAPIs);
        localStorage.setItem('selectedAPIs', JSON.stringify(finalSelectedAPIs));

        this.renderCustomAPIsList();
        this.updateSelectedApiCount();
        this.checkAdultAPIsSelected();
        if (typeof showToast === 'function') showToast('已移除自定义API: ' + apiName, 'success');
    },

    /**
     * Cancel adding/editing custom API
     */
    cancelAddCustomApi: function () { // Also serves as cancelEditCustomApi
        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) {
            form.classList.add('hidden');
            const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
            const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
            const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');
            if (nameInput) nameInput.value = '';
            if (urlInput) urlInput.value = '';
            if (isAdultInput) isAdultInput.checked = false;
            this.restoreAddCustomApiButtons(); // Ensure buttons are reset to "Add" state
        }
    },
    
    cancelEditCustomApi: function() {
        this.cancelAddCustomApi(); // Re-use the same logic
    },

    /**
     * Restore add custom API buttons to their default state
     */
    restoreAddCustomApiButtons: function () {
        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (!form) return;
        const buttonContainer = form.querySelector('div:last-child');
        if (buttonContainer) {
            buttonContainer.innerHTML = `
                <button onclick="APISourceManager.addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
                <button onclick="APISourceManager.cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
            `;
        }
    },

    /**
     * Get custom API info by index.
     * @param {number} index - Custom API index.
     * @returns {object|null} - Custom API object { name, url, isAdult, detail? } or null.
     */
    getCustomApiInfo: function (index) {
        const customAPIs = AppState.get('customAPIs') || [];
        if (customAPIs && typeof index === 'number' && index >= 0 && index < customAPIs.length) {
            return customAPIs[index]; // Includes name, url, isAdult, and potentially 'detail' if you add it
        }
        console.warn(`getCustomApiInfo: Invalid index ${index} or customAPIs not found.`);
        return null;
    },

    /**
     * Get API info by source code.
     * @param {string} sourceCode - Source code (e.g., 'heimuer', 'custom_0').
     * @returns {object|null} - API info { name, url (base for JSON), isCustom, detailScrapeUrl? }.
     */
    getSelectedApi: function (sourceCode) {
        if (!sourceCode) return null;

        if (sourceCode.startsWith('custom_')) {
            const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
            const apiInfo = this.getCustomApiInfo(customIndex); // This now returns the object with 'url' and potentially 'detail'
            return apiInfo ? { 
                name: apiInfo.name, 
                url: apiInfo.url, // This is the base URL for JSON search/detail as per config.js
                isCustom: true,
                detailScrapeUrl: apiInfo.detail // This is the specific URL for HTML scraping, if defined for this custom API
            } : null;
        } else {
            if (typeof API_SITES !== 'undefined' && API_SITES[sourceCode]) {
                return { 
                    name: API_SITES[sourceCode].name, 
                    url: API_SITES[sourceCode].api, // Base URL for JSON search/detail from config.js
                    isCustom: false,
                    detailScrapeUrl: API_SITES[sourceCode].detail // URL for HTML scraping from config.js
                };
            } else {
                console.error("API_SITES 未定义或未找到 sourceCode:", sourceCode);
                return null;
            }
        }
    }
};

// Export module and make specific functions globally available if called directly from HTML onclick
window.APISourceManager = APISourceManager;

window.selectAllAPIs = function (selectAll, excludeAdult) {
    APISourceManager.selectAllAPIs(selectAll, excludeAdult);
};

window.showAddCustomApiForm = function () {
    const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
    if (form) {
        APISourceManager.restoreAddCustomApiButtons(); // Ensure buttons are in "Add" mode
        form.classList.remove('hidden');
    }
};

window.addCustomApi = function () { // Called by "Add" button in the form
    APISourceManager.addCustomApi();
};

window.cancelAddCustomApi = function () { // Called by "Cancel" button in the form
    APISourceManager.cancelAddCustomApi();
};
