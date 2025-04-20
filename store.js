// /js/store.js

import {
  API_SITES,
  CUSTOM_API_CONFIG,
  PASSWORD_CONFIG,
  SEARCH_HISTORY_KEY,
  MAX_HISTORY_ITEMS,
} from './config.js';

// ------- State Structure --------
let state = {
  selectedAPIs: [],
  customAPIs: [],
  searchHistory: [],
  viewingHistory: [],
  settings: {
    yellowFilterEnabled: true,
    adFilteringEnabled: true,
    autoplayEnabled: true
  },
  uiState: {
    settingsPanelVisible: false,
    historyPanelVisible: false,
    passwordVerified: false
  }
};

// ============== 初始化从 localStorage 加载 ==============
export function initializeStore() {
  state.customAPIs = load('customAPIs', []);
  state.selectedAPIs = load('selectedAPIs', Object.keys(API_SITES).filter(k => !API_SITES[k].adult));
  state.searchHistory = load(SEARCH_HISTORY_KEY, []);
  state.viewingHistory = load('viewingHistory', []);
  state.settings.yellowFilterEnabled = (localStorage.getItem('yellowFilterEnabled') !== 'false');
  state.settings.adFilteringEnabled = (localStorage.getItem(CUSTOM_API_CONFIG.adFilteringStorage || 'adFilteringEnabled') !== 'false');
  state.settings.autoplayEnabled = (localStorage.getItem('autoplayEnabled') !== 'false');
  // passwordVerified优先通过localStorage校验
  const raw = localStorage.getItem(PASSWORD_CONFIG.localStorageKey);
  let verified = false;
  try {
    if (raw) {
      const obj = JSON.parse(raw);
      verified = !!obj.verified && typeof obj.timestamp === 'number'
        && (Date.now() < obj.timestamp + PASSWORD_CONFIG.verificationTTL);
    }
  } catch {}
  state.uiState.passwordVerified = verified;
}
// =================== getter ====================
export function getState() {
  return { ...state };
}
// ======= 通用工具 =======
function load(key, def) {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : def;
  } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  // 都在 write API 调用了 emitChange
}
// ========== Mutator APIs (全部 emitChange) ==========
export function updateSelectedAPIs(newAPIs) {
  state.selectedAPIs = [...newAPIs];
  save('selectedAPIs', state.selectedAPIs);
  emitChange(['selectedAPIs']);
}
export function updateCustomAPIs(newCustomAPIs) {
  state.customAPIs = [...newCustomAPIs];
  save('customAPIs', state.customAPIs);
  emitChange(['customAPIs']);
}
export function addSearchHistoryItem(text) {
  if (!text || typeof text !== 'string') return;
  const q = text.trim().substring(0, 50).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  state.searchHistory = state.searchHistory.filter(item => item.text !== q);
  state.searchHistory.unshift({ text: q, timestamp: Date.now() });
  if (state.searchHistory.length > MAX_HISTORY_ITEMS) state.searchHistory = state.searchHistory.slice(0, MAX_HISTORY_ITEMS);
  save(SEARCH_HISTORY_KEY, state.searchHistory);
  emitChange(['searchHistory']);
}
export function clearSearchHistoryStore() {
  state.searchHistory = [];
  save(SEARCH_HISTORY_KEY, []);
  emitChange(['searchHistory']);
}
export function addViewingHistoryItem(item) {
  // item: 同历史viewingHistory结构
  if (!item || !item.title) return;
  const idx = state.viewingHistory.findIndex(i => i.title === item.title);
  if (idx !== -1) {
    const old = state.viewingHistory[idx];
    Object.assign(old, item); state.viewingHistory.splice(idx, 1);
    state.viewingHistory.unshift(old);
  } else {
    state.viewingHistory.unshift(item);
  }
  while (state.viewingHistory.length > 50) state.viewingHistory.pop();
  save('viewingHistory', state.viewingHistory);
  emitChange(['viewingHistory']);
}
export function clearViewingHistoryStore() {
  state.viewingHistory = [];
  save('viewingHistory', []);
  emitChange(['viewingHistory']);
}
export function deleteViewingHistoryItem(title) {
  state.viewingHistory = state.viewingHistory.filter(item => item.title !== title);
  save('viewingHistory', state.viewingHistory);
  emitChange(['viewingHistory']);
}
// ------ 设置相关 ------
export function setSetting(key, val) {
  state.settings[key] = val;
  if (key === 'yellowFilterEnabled') localStorage.setItem('yellowFilterEnabled', val ? 'true' : 'false');
  if (key === 'adFilteringEnabled') localStorage.setItem(CUSTOM_API_CONFIG.adFilteringStorage || 'adFilteringEnabled', val ? 'true' : 'false');
  if (key === 'autoplayEnabled') localStorage.setItem('autoplayEnabled', val ? 'true' : 'false');
  emitChange(['settings']);
}
// ----- UI State -----
export function setUIState(key, val) {
  state.uiState[key] = val;
  emitChange(['uiState']);
}
// ----- 密码相关 -----
export function setPasswordVerified(status) {
  state.uiState.passwordVerified = !!status;
  emitChange(['uiState']);
}

// ========== Event (全局) ==========
function emitChange(changedKeys) {
  document.dispatchEvent(new CustomEvent('stateChange', { detail: { changedKeys } }));
}
