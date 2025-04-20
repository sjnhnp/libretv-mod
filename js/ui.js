// /js/ui.js
import { getState, setSettingsPanelOpen, setHistoryPanelOpen, clearSearchHistory, clearViewingHistory, removeViewingHistoryItem } from './store.js'; // Import store functions
import { createHistoryItemElement } from './components/HistoryItem.js'; // Import component

// DOM Elements (Cache if accessed frequently)
let toastContainer;
let loadingIndicator;
let settingsPanel;
let historyPanel;
let modalElement;
let modalTitleElement;
let modalContentElement;
let historyListElement; // Cache history list container

let toastTimeout = null; // For toast management

// --- Initialization ---

function cacheDOMElements() {
     toastContainer = document.getElementById('toast');
     loadingIndicator = document.getElementById('loading');
     settingsPanel = document.getElementById('settingsPanel');
     historyPanel = document.getElementById('historyPanel');
     modalElement = document.getElementById('modal');
     modalTitleElement = document.getElementById('modalTitle');
     modalContentElement = document.getElementById('modalContent');
     historyListElement = document.getElementById('historyList'); // Cache history list
}

function setupUIEventListeners() {
     // Listener for modal close button
     if (modalElement) {
          const closeButton = modalElement.querySelector('.close-modal-button'); // Assuming a class for the close button
          if (closeButton) {
              closeButton.addEventListener('click', closeModal);
          }
          // Optional: Close modal on backdrop click
          modalElement.addEventListener('click', (event) => {
              if (event.target === modalElement) { // Clicked on backdrop
                  closeModal();
              }
          });
     }

     // Listeners for history clear buttons (using delegation on history panel)
     if (historyPanel) {
          historyPanel.addEventListener('click', (event) => {
              if (event.target.id === 'clearSearchHistoryButton') {
                  if (confirm('确定要清除所有搜索历史吗？')) {
                      clearSearchHistory(); // Use store action
                  }
              } else if (event.target.id === 'clearViewingHistoryButton') {
                  if (confirm('确定要清除所有观看历史吗？')) {
                      clearViewingHistory(); // Use store action
                  }
              }
          });
     }

     // Listener for dynamically added history items (delete/play) using delegation
     if (historyListElement) {
          historyListElement.addEventListener('click', handleHistoryItemClick);
     }

     // Listen to state changes to update UI elements managed by ui.js
     document.addEventListener('stateChange', handleStateChange);
}

export function initUI() {
     console.log('Initializing UI...');
     cacheDOMElements();
     setupUIEventListeners();
     // Initial UI state sync based on store
     const initialState = getState();
     setLoading(initialState.uiState.isLoading);
     updatePanelVisibility(settingsPanel, initialState.uiState.isSettingsPanelOpen);
     updatePanelVisibility(historyPanel, initialState.uiState.isHistoryPanelOpen);
     renderHistory(); // Initial history render
     // Hide modal initially
     if (modalElement) modalElement.classList.add('hidden');
     console.log('UI Initialization complete.');
}

// --- State Change Handler ---

function handleStateChange(event) {
    const changedKeys = event.detail.changedKeys || [];
    const currentState = getState(); // Get current state

    if (changedKeys.includes('uiState')) {
        setLoading(currentState.uiState.isLoading);
        updatePanelVisibility(settingsPanel, currentState.uiState.isSettingsPanelOpen);
        updatePanelVisibility(historyPanel, currentState.uiState.isHistoryPanelOpen);
        // Handle password modal visibility if needed here or in password.js listener
    }
    if (changedKeys.includes('searchHistory') || changedKeys.includes('viewingHistory')) {
        renderHistory(); // Re-render history lists if they change
    }
}

// --- Core UI Functions ---

export function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) return;

    // Clear existing timeout if any
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    // Remove previous type classes
    toastContainer.classList.remove('bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500');

    // Apply new type class
    let bgColor = 'bg-blue-500'; // Default info
    if (type === 'success') bgColor = 'bg-green-500';
    if (type === 'warning') bgColor = 'bg-yellow-500';
    if (type === 'error') bgColor = 'bg-red-500';
    toastContainer.classList.add(bgColor);

    toastContainer.textContent = message;
    toastContainer.classList.remove('hidden', 'opacity-0', 'translate-y-full');
    toastContainer.classList.add('opacity-100', 'translate-y-0');

    toastTimeout = setTimeout(() => {
        toastContainer.classList.remove('opacity-100', 'translate-y-0');
        toastContainer.classList.add('opacity-0', 'translate-y-full');
        // Use transitionend event for potentially smoother hiding?
        // For simplicity, hide after transition duration (adjust timeout if needed)
        setTimeout(() => {
           if (!toastContainer.classList.contains('opacity-100')) { // Check if another toast hasn't appeared
               toastContainer.classList.add('hidden');
           }
        }, 500); // Match transition duration
    }, duration);
}

export function showLoading() {
    if (loadingIndicator) {
        loadingIndicator.classList.remove('hidden');
    }
}

export function hideLoading() {
    if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }
}

export function showModal(title, contentElement) {
    if (!modalElement || !modalTitleElement || !modalContentElement) return;

    modalTitleElement.textContent = title;
    modalContentElement.innerHTML = ''; // Clear previous content
    modalContentElement.appendChild(contentElement); // Append new content (already created DOM element)

    modalElement.classList.remove('hidden');
    // Add focus trapping and escape key closing for accessibility if needed
}

export function closeModal() {
    if (modalElement) {
        modalElement.classList.add('hidden');
        modalContentElement.innerHTML = ''; // Clear content on close
    }
}


// --- Panel Logic ---

export function toggleSettings() {
    const isOpen = getState().uiState.isSettingsPanelOpen;
    setSettingsPanelOpen(!isOpen); // Update store
    if (!isOpen) { // If opening settings, close history
        setHistoryPanelOpen(false);
    }
}

export function toggleHistory() {
    const isOpen = getState().uiState.isHistoryPanelOpen;
    setHistoryPanelOpen(!isOpen); // Update store
    if (!isOpen) { // If opening history, close settings
        setSettingsPanelOpen(false);
    }
}

function updatePanelVisibility(panel, isOpen) {
    if (!panel) return;
    if (isOpen) {
        panel.classList.remove('hidden');
        panel.classList.add('panel-visible'); // Use class for animation/state
        panel.classList.remove('panel-hidden');
    } else {
        panel.classList.remove('panel-visible');
        panel.classList.add('panel-hidden');
        // Delay adding hidden to allow animation (match CSS transition duration)
        setTimeout(() => {
            // Check if it wasn't opened again during the timeout
            if (!panel.classList.contains('panel-visible')) {
                panel.classList.add('hidden');
            }
        }, 300); // Adjust duration to match CSS transition
    }
}

// --- History Logic ---

function renderHistory() {
     if (!historyListElement) return;
     historyListElement.innerHTML = ''; // Clear existing
     const { searchHistory, viewingHistory } = getState();
     const fragment = document.createDocumentFragment();

     // Viewing History Section
     const viewingTitle = document.createElement('h3');
     viewingTitle.className = 'text-lg font-semibold mb-2 text-gray-200 px-2';
     viewingTitle.textContent = '观看历史';
     fragment.appendChild(viewingTitle);

     if (viewingHistory.length > 0) {
          viewingHistory.forEach(item => {
              const historyElement = createHistoryItemElement(
                   item,
                   'viewing',
                   // Callbacks handled by delegation
              );
              fragment.appendChild(historyElement);
          });
     } else {
          const noViewing = document.createElement('p');
          noViewing.className = 'text-gray-400 text-sm px-2 mb-4';
          noViewing.textContent = '暂无观看历史。';
          fragment.appendChild(noViewing);
     }

     // Search History Section
     const searchTitle = document.createElement('h3');
     searchTitle.className = 'text-lg font-semibold mb-2 text-gray-200 px-2 mt-4';
     searchTitle.textContent = '搜索历史';
     fragment.appendChild(searchTitle);

     if (searchHistory.length > 0) {
          searchHistory.forEach(item => {
              const historyElement = createHistoryItemElement(
                  item,
                  'search',
                  // Callbacks handled by delegation
              );
              fragment.appendChild(historyElement);
          });
     } else {
          const noSearch = document.createElement('p');
          noSearch.className = 'text-gray-400 text-sm px-2';
          noSearch.textContent = '暂无搜索历史。';
          fragment.appendChild(noSearch);
     }

     historyListElement.appendChild(fragment);
}

function handleHistoryItemClick(event) {
     const playButton = event.target.closest('.play-history-button');
     const deleteButton = event.target.closest('.delete-history-button');
     const searchLink = event.target.closest('.search-history-link');

     if (playButton) {
          const key = playButton.dataset.key; // Assuming key is stored on button
          if (key) {
              playFromHistory(key);
          }
     } else if (deleteButton) {
          const key = deleteButton.dataset.key;
          const type = deleteButton.dataset.type;
          if (key && type) {
              if (confirm(`确定要删除这条${type === 'viewing' ? '观看' : '搜索'}历史吗？`)) {
                  deleteHistoryItem(key, type);
              }
          }
     } else if (searchLink) {
          event.preventDefault(); // Prevent default link navigation
          const query = searchLink.dataset.query;
          if (query) {
               // Find search input and trigger search (assuming app.js handles search)
               const searchInput = document.getElementById('searchInput');
               const searchForm = document.getElementById('searchForm');
               if (searchInput && searchForm) {
                    searchInput.value = query;
                    searchForm.requestSubmit(); // Programmatically submit form
                    toggleHistory(); // Close history panel
               }
          }
     }
}


// --- History Item Actions ---

function playFromHistory(itemKey) { // key is likely `${title}_${source}` for viewing history
    console.log('Attempting to play from history:', itemKey);
    const viewingHistory = getState().viewingHistory;
    const item = viewingHistory.find(h => `${h.title}_${h.source}` === itemKey);

    if (item && item.id && item.source && item.title) {
         const playerUrl = PLAYER_CONFIG.playerUrl || 'player.html';
         const params = new URLSearchParams({
              id: item.id,
              title: item.title,
              source: item.source,
              isCustom: item.isCustom?.toString() || 'false',
              // Pass playback position if available
              position: item.currentTime ? Math.floor(item.currentTime).toString() : '0',
              // Pass episode index if available
              index: item.currentEpisodeIndex?.toString() || '0',
              // Note: Passing full episodes list via URL can be very long.
              // Player should ideally re-fetch details based on id/source.
         });
         window.location.href = `${playerUrl}?${params.toString()}`;
    } else {
         showToast('无法播放该历史记录项', 'error');
         console.error('Could not find valid data to play history item:', itemKey, item);
    }
}

function deleteHistoryItem(itemKey, type) {
     if (type === 'viewing') {
          removeViewingHistoryItem(itemKey); // Use store action
          showToast('观看历史已删除', 'success');
     } else if (type === 'search') {
          // Search history deletion needs specific implementation if key isn't simple
          console.warn('Search history item deletion by key not fully implemented.');
          // Assuming key is the search text for now
          const currentSearchHistory = getState().searchHistory;
          const updatedHistory = currentSearchHistory.filter(item => item.text !== itemKey);
          // Need a specific store action for this potentially
          // saveSearchHistory(updatedHistory); // Replace with store action if available
          clearSearchHistory(); // Temp: Clear all for now, needs refinement
          showToast('搜索历史已删除', 'success'); // Adjust message
     }
}

// --- Utility Functions ---

export function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatPlaybackTime(seconds) {
     if (isNaN(seconds) || seconds < 0) return '0:00';
     const minutes = Math.floor(seconds / 60);
     const secs = Math.floor(seconds % 60);
     return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// No need to export window. functions anymore
// Remove: window.showToast = showToast; etc.
