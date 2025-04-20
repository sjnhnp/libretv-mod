// /js/store.js
import { API_SITES, CUSTOM_API_CONFIG, PASSWORD_CONFIG } from './config.js';

// Internal state - not exported directly to prevent accidental modification
let state = {
    selectedAPIs: [], // Array of API keys (string)
    customAPIs: [], // Array of custom API objects
    searchHistory: [],
    viewingHistory: [],
    settings: {
        yellowFilterEnabled: false,
        adFilteringEnabled: true, // Default ad filtering to true
        episodesReversed: false,
        autoplayEnabled: true,
        hasSeenDisclaimer: false,
    },
    uiState: {
        isLoading: false,
        isSettingsPanelOpen: false,
        isHistoryPanelOpen: false,
        passwordVerified: false, // Initial state, assuming not verified
        passwordRequired: false, // Will be set based on env
    },
};

// --- Private Helper Functions ---

function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Error saving state for key "${key}":`, e);
    }
}

function load(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        if (item === null) {
            return defaultValue;
        }
        // Basic validation: Ensure it's parsable JSON
        JSON.parse(item); // Try parsing to catch invalid JSON
        return JSON.parse(item); // Return the parsed object/value
    } catch (e) {
        console.error(`Error loading state for key "${key}", using default:`, e);
        // If loading fails, remove the invalid item
        localStorage.removeItem(key);
        return defaultValue;
    }
}

function getDefaultSelectedAPIs() {
    // Select first 3 non-adult APIs by default, or fewer if not available
    const defaultKeys = Object.keys(API_SITES)
        .filter(key => !API_SITES[key].is_adult)
        .slice(0, 3);
    console.log('getDefaultSelectedAPIs:', defaultKeys);
    return defaultKeys;
}

// --- Public API ---

export function getState() {
    // Return a deep clone to prevent direct state mutation
    return JSON.parse(JSON.stringify(state));
}

export function initializeStore(envPasswordHash) {
    console.log('Initializing store...');
    // Load persistent state
    state.customAPIs = load(CUSTOM_API_CONFIG.localStorageKey, []);
    state.searchHistory = load('videoSearchHistory', []); // Assuming old key name
    state.viewingHistory = load('viewingHistory', []);

    // Load settings with defaults
    const loadedSettings = load('userSettings'); // Load settings object
    state.settings = {
        yellowFilterEnabled: loadedSettings?.yellowFilterEnabled ?? false,
        adFilteringEnabled: loadedSettings?.adFilteringEnabled ?? true,
        episodesReversed: loadedSettings?.episodesReversed ?? false,
        autoplayEnabled: loadedSettings?.autoplayEnabled ?? true,
        hasSeenDisclaimer: loadedSettings?.hasSeenDisclaimer ?? false,
    };

    // Load selected APIs - **CRITICAL FOR SEARCH**
    let loadedSelectedAPIs = load('selectedAPIs');
    // Ensure loadedSelectedAPIs is a valid array
    if (!Array.isArray(loadedSelectedAPIs)) {
         console.warn('Invalid selectedAPIs loaded from localStorage, resetting to default.');
         loadedSelectedAPIs = null; // Force reset below
    }
    // Use default if null, empty, or still invalid
    if (loadedSelectedAPIs === null || loadedSelectedAPIs.length === 0) {
        console.log('No valid selected APIs found in storage, using default.');
        state.selectedAPIs = getDefaultSelectedAPIs();
        // **Save the default back to localStorage immediately**
        save('selectedAPIs', state.selectedAPIs);
    } else {
         state.selectedAPIs = loadedSelectedAPIs;
    }

    // Initialize password state based on environment
    state.uiState.passwordRequired = !!envPasswordHash;
    if (state.uiState.passwordRequired) {
        const storedVerification = load(PASSWORD_CONFIG.localStorageKey);
        if (storedVerification && storedVerification.timestamp) {
             const now = Date.now();
             if (now < storedVerification.timestamp + PASSWORD_CONFIG.verificationTTL) {
                 state.uiState.passwordVerified = true;
                 console.log('Password verification loaded from valid storage.');
             } else {
                 console.log('Password verification expired.');
                 localStorage.removeItem(PASSWORD_CONFIG.localStorageKey); // Clean expired item
             }
        }
    } else {
        state.uiState.passwordVerified = true; // Not required, so considered verified
    }

    console.log('Store initialized:', getState());

    // Initial state sync dispatch (optional, might cause initial double renders)
    // document.dispatchEvent(new CustomEvent('stateChange', { detail: { changedKeys: Object.keys(state) } }));
}

function dispatchStateChange(changedKeys = []) {
    document.dispatchEvent(new CustomEvent('stateChange', { detail: { changedKeys } }));
}

// --- State Update Functions (Mutations/Actions) ---

export function updateSelectedAPIs(newApiKeys) {
    if (Array.isArray(newApiKeys)) {
        // Optional: Add validation to ensure keys exist in API_SITES or customAPIs?
        state.selectedAPIs = [...newApiKeys]; // Use spread to ensure new array
        save('selectedAPIs', state.selectedAPIs);
        dispatchStateChange(['selectedAPIs']);
        console.log('Store: selectedAPIs updated', state.selectedAPIs);
    } else {
        console.error('Store: updateSelectedAPIs received invalid value:', newApiKeys);
    }
}

export function updateCustomAPIs(newCustomApis) {
     if (Array.isArray(newCustomApis)) {
         state.customAPIs = newCustomApis.map(api => ({ ...api })); // Deep clone items
         save(CUSTOM_API_CONFIG.localStorageKey, state.customAPIs);
         dispatchStateChange(['customAPIs']);
         console.log('Store: customAPIs updated', state.customAPIs);
     } else {
          console.error('Store: updateCustomAPIs received invalid value:', newCustomApis);
     }
}

export function addSearchHistoryItem(item) {
    // Prevent duplicates and limit size
    state.searchHistory = state.searchHistory.filter(existing => existing.text !== item.text);
    state.searchHistory.unshift({ ...item, timestamp: Date.now() }); // Add timestamp
    if (state.searchHistory.length > (CUSTOM_API_CONFIG.maxHistoryItems || 20)) { // Use config or default
        state.searchHistory.pop();
    }
    save('videoSearchHistory', state.searchHistory);
    dispatchStateChange(['searchHistory']);
}

export function clearSearchHistory() {
    state.searchHistory = [];
    save('videoSearchHistory', state.searchHistory);
    dispatchStateChange(['searchHistory']);
}

export function addViewingHistoryItem(item) {
    // Find existing item by unique identifier (e.g., title and source)
    const key = `${item.title}_${item.source}`; // Simple key
    const existingIndex = state.viewingHistory.findIndex(h => `${h.title}_${h.source}` === key);

    const newItem = { ...item, lastViewed: Date.now() };

    if (existingIndex > -1) {
        // Update existing item, move to top
        state.viewingHistory.splice(existingIndex, 1);
    }
    state.viewingHistory.unshift(newItem);

    // Limit size
    if (state.viewingHistory.length > (CUSTOM_API_CONFIG.maxHistoryItems || 50)) { // Different limit?
        state.viewingHistory.pop();
    }

    save('viewingHistory', state.viewingHistory);
    dispatchStateChange(['viewingHistory']);
}

export function removeViewingHistoryItem(itemKey) { // Assuming itemKey is `${title}_${source}`
     state.viewingHistory = state.viewingHistory.filter(h => `${h.title}_${h.source}` !== itemKey);
     save('viewingHistory', state.viewingHistory);
     dispatchStateChange(['viewingHistory']);
}

export function clearViewingHistory() {
    state.viewingHistory = [];
    save('viewingHistory', state.viewingHistory);
    dispatchStateChange(['viewingHistory']);
}

export function updateSetting(key, value) {
    if (key in state.settings) {
        state.settings[key] = value;
        save('userSettings', state.settings); // Save the whole settings object
        dispatchStateChange(['settings']);
        console.log(`Store: Setting ${key} updated to ${value}`);
    } else {
        console.warn(`Store: Attempted to update unknown setting "${key}"`);
    }
}

export function setLoading(isLoading) {
    state.uiState.isLoading = !!isLoading;
    dispatchStateChange(['uiState']);
}

export function setSettingsPanelOpen(isOpen) {
    state.uiState.isSettingsPanelOpen = !!isOpen;
    dispatchStateChange(['uiState']);
}

export function setHistoryPanelOpen(isOpen) {
    state.uiState.isHistoryPanelOpen = !!isOpen;
    dispatchStateChange(['uiState']);
}

export function setPasswordVerified(isVerified) {
     state.uiState.passwordVerified = !!isVerified;
     if (isVerified && state.uiState.passwordRequired) {
          // Save verification timestamp
          save(PASSWORD_CONFIG.localStorageKey, { timestamp: Date.now() });
     } else if (!isVerified) {
          // Clear verification on explicit logout/fail
          localStorage.removeItem(PASSWORD_CONFIG.localStorageKey);
     }
     dispatchStateChange(['uiState']);
     console.log('Store: Password verification status set to', state.uiState.passwordVerified);
}

// Add other state update functions as needed...

// --- Comment explaining state export decision ---
// The 'state' variable itself is not exported directly to encourage
// modification only through the exported update functions, ensuring
// consistency and allowing side effects like localStorage persistence
// and event dispatching. Use getState() for read access.
