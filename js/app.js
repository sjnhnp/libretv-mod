// /js/app.js
import { API_SITES, CUSTOM_API_CONFIG, HIDE_BUILTIN_ADULT_APIS, PLAYER_CONFIG } from './config.js';
import { searchVideos, getVideoDetails } from './apiService.js'; // Use apiService
import { getState, updateSelectedAPIs, addSearchHistoryItem, updateCustomAPIs, setLoading } from './store.js'; // Use store
import { showToast, showLoading, hideLoading, showModal, closeModal } from './ui.js'; // Use ui functions directly
import { isPasswordProtected, isPasswordVerified, showPasswordModal } from './password.js'; // Use password functions
import { createApiCheckboxElement } from './components/ApiCheckbox.js';
import { createCustomApiListItemElement } from './components/CustomApiListItem.js';
import { createSearchResultCardElement } from './components/SearchResultCard.js';

// DOM Element References (cached)
let searchInput;
let resultsContainer;
let apiCheckboxesContainer;
let customApisListContainer;
// Add other frequently accessed elements if needed

// --- Initialization ---

function setupEventListeners() {
    console.log('Setting up app event listeners...');
    const searchForm = document.getElementById('searchForm');
    const settingsToggle = document.getElementById('settingsToggle');
    const historyToggle = document.getElementById('historyToggle');
    const addCustomApiButton = document.getElementById('addCustomApiButton');
    const customApiForm = document.getElementById('customApiForm');
    const cancelAddCustomApiButton = document.getElementById('cancelAddCustomApi');
    const adultApiWarning = document.getElementById('adultApiWarning');
    const clearSearchButton = document.getElementById('clearSearchButton'); // Get clear button

    if (searchForm) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission
            search();
        });
    } else {
        console.error('Search form not found!');
    }

    if (clearSearchButton && searchInput) { // Check if both exist
        clearSearchButton.addEventListener('click', () => {
            searchInput.value = ''; // Clear the input field
            if (resultsContainer) {
                resultsContainer.innerHTML = ''; // Clear results
            }
            searchInput.focus(); // Set focus back to input
        });
    }

    if (settingsToggle) {
        settingsToggle.addEventListener('click', () => {
            // Assuming ui.js handles panel toggling via store now
            import('./ui.js').then(ui => ui.toggleSettings());
        });
    }
    if (historyToggle) {
        historyToggle.addEventListener('click', () => {
            // Assuming ui.js handles panel toggling via store now
            import('./ui.js').then(ui => ui.toggleHistory());
        });
    }
    if (addCustomApiButton) {
        addCustomApiButton.addEventListener('click', showAddCustomApiForm);
    }
    if (customApiForm) {
        customApiForm.addEventListener('submit', handleAddCustomApiSubmit);
    }
    if (cancelAddCustomApiButton) {
        cancelAddCustomApiButton.addEventListener('click', cancelAddCustomApi);
    }
    if (adultApiWarning) {
         adultApiWarning.style.display = 'none'; // Hide initially
    }

    // Listener for dynamically added elements (API checkboxes, custom API buttons)
    // using Event Delegation on their containers
    if (apiCheckboxesContainer) {
        apiCheckboxesContainer.addEventListener('change', handleApiCheckboxChange);
    }
    if (customApisListContainer) {
         customApisListContainer.addEventListener('click', handleCustomApiListClick);
    }
    if (resultsContainer) {
        resultsContainer.addEventListener('click', handleResultCardClick);
    }

    // Listen to state changes to update parts of the UI managed by app.js
    document.addEventListener('stateChange', handleStateChange);

    console.log('App event listeners setup complete.');
}

function cacheDOMElements() {
    searchInput = document.getElementById('searchInput');
    resultsContainer = document.getElementById('results');
    apiCheckboxesContainer = document.getElementById('apiCheckboxes');
    customApisListContainer = document.getElementById('customApisList');
    // Cache others if needed
}

function initApp() {
    console.log('Initializing app...');
    cacheDOMElements();
    setupEventListeners(); // Setup listeners first
    initAPICheckboxes(); // Then render initial UI based on store state
    renderCustomAPIsList();
    console.log('App initialization complete.');
}

// --- State Change Handler ---

function handleStateChange(event) {
    const changedKeys = event.detail.changedKeys || [];

    // Update UI sections based on changed state keys
    if (changedKeys.includes('selectedAPIs')) {
        // Re-render checkboxes to reflect selection changes if needed
        // This might be redundant if checkbox change handler updates UI directly
        // initAPICheckboxes(); // Re-check if needed
    }
    if (changedKeys.includes('customAPIs')) {
        renderCustomAPIsList(); // Re-render the custom API list
    }
    if (changedKeys.includes('uiState')) {
        // Handle potential UI state changes relevant to app.js if any
    }
    // Add other state change reactions as needed
}


// --- Search Logic ---

async function search() {
    if (!searchInput || !resultsContainer) {
        console.error("Search input or results container not found!");
        return;
    }
    const query = searchInput.value.trim();
    if (!query) {
        showToast('请输入搜索关键词', 'warning');
        return;
    }

    // Check password protection status
    if (isPasswordProtected() && !isPasswordVerified()) {
        showPasswordModal(); // Show password prompt
        return; // Stop search if password is required but not verified
    }

    console.log(`Searching for: ${query}`);
    showLoading(); // Use UI function directly
    resultsContainer.innerHTML = ''; // Clear previous results

    // **CRITICAL FIX: Check if APIs are selected *before* calling searchVideos**
    const currentSelectedAPIs = getState().selectedAPIs;
    if (!currentSelectedAPIs || currentSelectedAPIs.length === 0) {
        showToast('请在设置中至少选择一个API源', 'warning');
        hideLoading(); // Make sure loading indicator is hidden
        return; // Stop the search if no APIs are selected
    }

    // Save search to history (using store action)
    addSearchHistoryItem({ text: query });

    try {
        const results = await searchVideos(query, currentSelectedAPIs); // Use apiService

        console.log('Search results received:', results);
        if (results && results.length > 0) {
            results.forEach(item => {
                // Assume 'source' in the result item identifies the API key or custom API object/ID
                const apiConfig = API_SITES[item.source] || getState().customAPIs.find(api => api.id === item.source);
                const cardElement = createSearchResultCardElement(item, apiConfig || {}, item.source);
                resultsContainer.appendChild(cardElement);
            });
        } else {
            resultsContainer.innerHTML = '<p class="text-gray-400 text-center col-span-full">未找到相关结果。</p>';
        }
    } catch (error) {
        console.error('Search failed:', error);
        showToast(`搜索失败: ${error.message || '未知错误'}`, 'error');
        resultsContainer.innerHTML = `<p class="text-red-400 text-center col-span-full">搜索时发生错误: ${error.message || '请稍后再试'}</p>`;
    } finally {
        hideLoading(); // Use UI function directly
    }
}

// --- Event Handlers using Delegation ---

function handleResultCardClick(event) {
     const card = event.target.closest('.search-result-card'); // Use a class to identify the card
     if (card) {
          const videoId = card.dataset.videoId;
          const videoName = card.dataset.videoName;
          const sourceId = card.dataset.sourceId;
          const isCustom = card.dataset.isCustom === 'true'; // Get custom flag

          if (videoId && videoName && sourceId) {
              console.log(`Result clicked: ID=${videoId}, Name=${videoName}, Source=${sourceId}, IsCustom=${isCustom}`);
              showDetails(videoId, videoName, sourceId, isCustom);
          }
     }
}

function handleApiCheckboxChange(event) {
    if (event.target.type === 'checkbox' && event.target.name === 'apiSource') {
        console.log('API checkbox changed');
        updateSelectedAPIsFromCheckboxes();
        checkAdultAPIsSelected(); // Check warning status after update
    }
}

function handleCustomApiListClick(event) {
     const button = event.target.closest('button');
     if (!button) return;

     const listItem = event.target.closest('li');
     if (!listItem) return;

     const apiId = listItem.dataset.apiId;
     if (!apiId) return;

     if (button.classList.contains('edit-custom-api')) {
         console.log('Edit custom API clicked:', apiId);
         editCustomApi(apiId);
     } else if (button.classList.contains('remove-custom-api')) {
         console.log('Remove custom API clicked:', apiId);
         removeCustomApi(apiId);
     } else if (button.classList.contains('save-custom-api')) {
         console.log('Save custom API clicked:', apiId);
         updateCustomApi(apiId);
     } else if (button.classList.contains('cancel-edit-custom-api')) {
         console.log('Cancel edit custom API clicked:', apiId);
         cancelEditCustomApi(apiId);
     }
}


// --- Details & Player Logic ---

// This function now primarily prepares data and navigates
function showDetails(videoId, videoName, source, isCustom = false) {
    console.log(`Showing details for: ID=${videoId}, Name=${videoName}, Source=${source}, IsCustom=${isCustom}`);

    // In a full component/router approach, this would likely navigate to a
    // detail view first, or directly to the player if configured.
    // For now, we retain the direct jump to player.html.

    playVideo(videoId, videoName, source, isCustom);
}

// Function to navigate to player.html
function playVideo(videoId, videoName, source, isCustom) {
     console.log(`Navigating to player for: ID=${videoId}, Name=${videoName}, Source=${source}, IsCustom=${isCustom}`);
     const playerUrl = `${PLAYER_CONFIG.playerUrl || 'player.html'}`; // Use config for player path

     // Construct the URL for player.html
     // Pass video ID and source identifier. Player will fetch details itself.
     const urlParams = new URLSearchParams({
          id: videoId,
          title: videoName, // Pass title for initial display
          source: source,
          isCustom: isCustom.toString()
          // index, episodes, url will be fetched by the player page using getVideoDetails
     });

     const targetUrl = `${playerUrl}?${urlParams.toString()}`;
     console.log("Navigating to:", targetUrl);
     window.location.href = targetUrl; // Navigate
}


// --- Settings Panel Logic (API Checkboxes & Custom APIs) ---

function initAPICheckboxes() {
    if (!apiCheckboxesContainer) return;
    apiCheckboxesContainer.innerHTML = ''; // Clear existing
    const { selectedAPIs } = getState();
    const fragment = document.createDocumentFragment();

    // Filter built-in APIs based on adult content setting
    const apisToDisplay = Object.entries(API_SITES).filter(([key, config]) =>
         !(HIDE_BUILTIN_ADULT_APIS && config.is_adult)
    );

    apisToDisplay.forEach(([key, config]) => {
        const isChecked = selectedAPIs.includes(key);
        const isDisabled = false; // Determine if checkbox should be disabled based on some logic?
        const checkboxElement = createApiCheckboxElement(
             { ...config, key: key }, // Pass key along with config
             isChecked,
             isDisabled,
             // No onChange callback needed here as we use event delegation now
        );
        fragment.appendChild(checkboxElement);
    });
    apiCheckboxesContainer.appendChild(fragment);
    checkAdultAPIsSelected(); // Initial check for warning
}

function updateSelectedAPIsFromCheckboxes() {
    if (!apiCheckboxesContainer) return;
    const selected = [];
    const checkboxes = apiCheckboxesContainer.querySelectorAll('input[name="apiSource"]:checked');
    checkboxes.forEach(checkbox => {
        selected.push(checkbox.value);
    });
    console.log('Updating selected APIs from checkboxes:', selected);
    updateSelectedAPIs(selected); // Update store
}

function checkAdultAPIsSelected() {
    const adultApiWarning = document.getElementById('adultApiWarning');
    if (!adultApiWarning) return;

    const { selectedAPIs } = getState();
    const isAdultSelected = selectedAPIs.some(key => API_SITES[key]?.is_adult);

    adultApiWarning.style.display = isAdultSelected ? 'block' : 'none';
}

// --- Custom API Management ---

function renderCustomAPIsList() {
     if (!customApisListContainer) return;
     customApisListContainer.innerHTML = ''; // Clear existing
     const { customAPIs } = getState();
     const fragment = document.createDocumentFragment();

     if (customAPIs.length === 0) {
         customApisListContainer.innerHTML = '<p class="text-gray-400 text-sm">暂无自定义API。</p>';
         return;
     }

     customAPIs.forEach(api => {
          const listItemElement = createCustomApiListItemElement(
              api,
              // Pass callbacks directly if components don't handle delegation internally
              // editCustomApi, // Handled by delegation
              // removeCustomApi // Handled by delegation
          );
          fragment.appendChild(listItemElement);
     });
     customApisListContainer.appendChild(fragment);
}


function showAddCustomApiForm() {
     const form = document.getElementById('customApiForm');
     const button = document.getElementById('addCustomApiButton');
     if (form) form.style.display = 'block';
     if (button) button.style.display = 'none';
     // Clear form fields maybe?
     document.getElementById('customApiName').value = '';
     document.getElementById('customApiUrl').value = '';
     document.getElementById('customApiSearchPath').value = '/api.php/provide/vod/?ac=list';
     document.getElementById('customApiDetailPath').value = '/api.php/provide/vod/?ac=detail';
     document.getElementById('customApiHeaders').value = '{}';
}

function cancelAddCustomApi() {
     const form = document.getElementById('customApiForm');
     const button = document.getElementById('addCustomApiButton');
     if (form) form.style.display = 'none';
     if (button) button.style.display = 'inline-block';
}

function handleAddCustomApiSubmit(event) {
    event.preventDefault();
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const searchPathInput = document.getElementById('customApiSearchPath');
    const detailPathInput = document.getElementById('customApiDetailPath');
    const headersInput = document.getElementById('customApiHeaders');

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const searchPath = searchPathInput.value.trim();
    const detailPath = detailPathInput.value.trim();
    const headersString = headersInput.value.trim();

    if (!name || !url) {
        showToast('API名称和URL不能为空', 'warning');
        return;
    }

    let headers = {};
    try {
        if (headersString) {
             headers = JSON.parse(headersString);
             if (typeof headers !== 'object' || Array.isArray(headers)) {
                  throw new Error('Headers must be a JSON object.');
             }
        }
    } catch (e) {
        showToast(`Headers格式错误: ${e.message}`, 'error');
        return;
    }

    const newApi = {
        id: `custom_${Date.now()}`, // Simple unique ID
        name: name,
        url: url,
        search: { path: searchPath, headers: headers },
        detail: { path: detailPath, headers: headers }, // Assuming same headers for now
        is_custom: true
    };

    const currentCustomAPIs = getState().customAPIs;
    updateCustomAPIs([...currentCustomAPIs, newApi]); // Update store

    showToast(`自定义API "${name}" 添加成功`, 'success');
    cancelAddCustomApi(); // Hide form
}

function removeCustomApi(apiId) {
     if (!confirm('确定要删除这个自定义API吗？')) {
         return;
     }
     const currentCustomAPIs = getState().customAPIs;
     const updatedAPIs = currentCustomAPIs.filter(api => api.id !== apiId);
     updateCustomAPIs(updatedAPIs); // Update store

     // Also remove from selected APIs if it was selected
     const currentSelectedAPIs = getState().selectedAPIs;
     if (currentSelectedAPIs.includes(apiId)) {
         const updatedSelected = currentSelectedAPIs.filter(id => id !== apiId);
         updateSelectedAPIs(updatedSelected);
     }

     showToast('自定义API已删除', 'success');
}

function editCustomApi(apiId) {
     // This requires dynamically changing the list item to an edit form.
     // This logic should ideally be within the CustomApiListItem component itself.
     // For now, we'll just log it. The component needs enhancement for editing.
     console.log(`Edit functionality for API ${apiId} needs implementation within the component.`);
     showToast('编辑功能暂未完全实现', 'info');

     // Basic idea: replace display elements with input fields within the list item
     const listItem = customApisListContainer.querySelector(`li[data-api-id="${apiId}"]`);
     if (!listItem) return;

     const apiData = getState().customAPIs.find(api => api.id === apiId);
     if (!apiData) return;

     // Example: Hide spans, show inputs (needs proper implementation in component)
     listItem.querySelectorAll('.api-display').forEach(el => el.style.display = 'none');
     listItem.querySelectorAll('.api-edit-form').forEach(el => el.style.display = 'block'); // Assume edit form exists

     // Populate inputs (assuming inputs have specific classes/ids within the list item)
     listItem.querySelector('.edit-api-name').value = apiData.name;
     listItem.querySelector('.edit-api-url').value = apiData.url;
     // ... populate other fields ...
}

function cancelEditCustomApi(apiId) {
     console.log(`Cancel Edit functionality for API ${apiId} needs implementation within the component.`);
      // Basic idea: hide inputs, show spans
     const listItem = customApisListContainer.querySelector(`li[data-api-id="${apiId}"]`);
     if (!listItem) return;
     listItem.querySelectorAll('.api-display').forEach(el => el.style.display = 'block'); // Or 'inline' etc.
     listItem.querySelectorAll('.api-edit-form').forEach(el => el.style.display = 'none');
}

function updateCustomApi(apiId) {
     console.log(`Update functionality for API ${apiId} needs implementation.`);
     // Basic idea: get values from edit form inputs within the list item
     const listItem = customApisListContainer.querySelector(`li[data-api-id="${apiId}"]`);
     if (!listItem) return;

     const name = listItem.querySelector('.edit-api-name').value.trim();
     const url = listItem.querySelector('.edit-api-url').value.trim();
     // ... get other values ...

     if (!name || !url) {
         showToast('API名称和URL不能为空', 'warning');
         return;
     }
     // ... validate headers ...

     const currentCustomAPIs = getState().customAPIs;
     const updatedAPIs = currentCustomAPIs.map(api => {
          if (api.id === apiId) {
              return {
                   ...api, // Keep ID and other potentially non-editable fields
                   name: name,
                   url: url,
                   // ... update search/detail paths and headers ...
              };
          }
          return api;
     });
     updateCustomAPIs(updatedAPIs);
     showToast('自定义API已更新', 'success');
     cancelEditCustomApi(apiId); // Switch back to display mode
}

// --- Export necessary functions or run init ---
// No explicit exports needed if initialization is handled by main-index.js
export { initApp }; // Export init function if called from main-index.js
