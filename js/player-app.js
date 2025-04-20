// js/player-app.js
(() => {
  "use strict";

  // ---- 状态集中管理 ----
  const state = {
    currentVideoTitle: '',
    currentEpisodeIndex: 0,
    currentEpisodes: [],
    episodesReversed: false,
    dp: null,
    currentHls: null,
    autoplayEnabled: true,
    adFilteringEnabled: true,
    isUserSeeking: false,
    videoHasEnded: false,
    userClickedPosition: null,
    shortcutHintTimeout: null,
    progressSaveInterval: null,
    controlsLocked: false,
  };

  // ---- 工具函数 ----
  function qs(id) { return document.getElementById(id); }
  function parseEpisodes(episodesList) {
    try { return JSON.parse(decodeURIComponent(episodesList)); } catch { return []; }
  }
  function safeParseJSON(str, fallback = []) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  function getVideoId() {
    return `${encodeURIComponent(state.currentVideoTitle)}_${state.currentEpisodeIndex}`;
  }

  // ---- DOM INIT ON LOAD ----
  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    let index = parseInt(urlParams.get('index') || '0');
    const episodesList = urlParams.get('episodes');

    // 恢复状态
    state.currentVideoTitle =
      title || localStorage.getItem('currentVideoTitle') || '未知视频';
    state.currentEpisodeIndex = index;
    state.autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';
    state.adFilteringEnabled = localStorage.getItem(PLAYER_CONFIG?.adFilteringStorage) !== 'false';

    // 自动连播开关
    qs('autoplayToggle').checked = state.autoplayEnabled;
    qs('autoplayToggle').addEventListener('change', e => {
      state.autoplayEnabled = e.target.checked;
      localStorage.setItem('autoplayEnabled', state.autoplayEnabled);
    });

    // 剧集获取
    try {
      if (episodesList) {
        state.currentEpisodes = parseEpisodes(episodesList);
      } else {
        state.currentEpisodes = safeParseJSON(localStorage.getItem('currentEpisodes'), []);
      }
      if (index < 0 || (state.currentEpisodes.length > 0 && index >= state.currentEpisodes.length)) {
        index = Math.max(0, Math.min(state.currentEpisodes.length - 1, index));
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('index', index);
        window.history.replaceState({}, '', newUrl);
      }
      state.currentEpisodeIndex = index;
      state.episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch {
      state.currentEpisodes = [];
      state.currentEpisodeIndex = 0;
      state.episodesReversed = false;
    }

    // 标题
    document.title = state.currentVideoTitle + ' - 播放器';
    qs('videoTitle').textContent = state.currentVideoTitle;

    // 初始化播放器
    if (videoUrl) {
      initPlayer(videoUrl);
      // 恢复播放位置
      const pos = urlParams.get('position');
      if (pos) {
        setTimeout(() => {
          if (state.dp && state.dp.video) {
            const p = parseInt(pos);
            if (!isNaN(p) && p > 0) {
              state.dp.seek(p);
              showPositionRestoreHint(p);
            }
          }
        }, 1500);
      }
    } else {
      showError('无效的视频链接');
    }

    updateEpisodeInfo();
    renderEpisodes();
    updateButtonStates();
    updateOrderButton();

    setTimeout(setupProgressBarPreciseClicks, 1000);
    document.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', saveCurrentProgress);
    document.addEventListener('visibilitychange', onVisibilityChange);
    subscribeVideoEvents();

    // 预加载逻辑在 player-preload.js
  });

  // ---- 播放器和事件处理 ----
  function initPlayer(videoUrl) {
    if (!videoUrl) return;
    removeProgressSaveTimer();

    const hlsConfig = {
      debug: false,
      loader: state.adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90, maxBufferLength: 30, maxMaxBufferLength: 60,
      maxBufferSize: 30 * 1000 * 1000, maxBufferHole: 0.5,
      fragLoadingMaxRetry: 6, fragLoadingMaxRetryTimeout: 64000, fragLoadingRetryDelay: 1000,
      manifestLoadingMaxRetry: 3, manifestLoadingRetryDelay: 1000,
      levelLoadingMaxRetry: 4, levelLoadingRetryDelay: 1000,
      startLevel: -1,
      abrEwmaDefaultEstimate: 500000,
      abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: true,
      stretchShortVideoTrack: true,
      appendErrorMaxRetry: 5,
      liveSyncDurationCount: 3, liveDurationInfinity: false,
    };

    const dp = new DPlayer({
      container: qs('player'),
      autoplay: true,
      theme: '#00ccff',
      preload: 'auto',
      loop: false,
      lang: 'zh-cn',
      hotkey: true, mutex: true,
      volume: 0.7,
      playbackSpeed: [0.5, 0.75, 1, 1.25, 1.5, 2],
      screenshot: true,
      preventClickToggle: true,
      airplay: true, chromecast: true,
      video: {
        url: videoUrl,
        type: 'hls',
        pic: 'https://img.picgo.net/2025/04/12/image362e7d38b4af4a74.png',
        customType: {
          hls: function(video, player) {
            if (state.currentHls && state.currentHls.destroy) {
              try { state.currentHls.destroy(); } catch(ex) {}
            }
            const hls = new Hls(hlsConfig);
            state.currentHls = hls;
            video.addEventListener('playing', () => { 
              qs('loading').style.display = 'none'; 
              qs('error').style.display = 'none';
            });
            video.addEventListener('timeupdate', () => {
              if (video.currentTime > 1) qs('error').style.display = 'none';
            });
            hls.loadSource(video.src); hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(()=>{}); });
            hls.on(Hls.Events.ERROR, (event, data) => { handleHlsError(event, data, hls, video, player); });
            hls.on(Hls.Events.FRAG_LOADED, () => { qs('loading').style.display = 'none'; });
            hls.on(Hls.Events.LEVEL_LOADED, () => { qs('loading').style.display = 'none'; });
          }
        }
      }
    });
    state.dp = dp;

    // 全屏锁定逻辑
    const fsContainer = qs('playerContainer');
    dp.on('fullscreen', () => {
      if (window.screen.orientation && window.screen.orientation.lock) {
        window.screen.orientation.lock('landscape').catch(()=>{});
      }
      fsContainer.requestFullscreen?.().catch(()=>{});
    });
    dp.on('fullscreen_cancel', () => {
      document.exitFullscreen?.();
      window.screen.orientation?.unlock?.();
    });

    dp.on('loadedmetadata', () => {
      qs('loading').style.display = 'none';
      state.videoHasEnded = false;
      setupProgressBarPreciseClicks();
      setTimeout(saveToHistory, 3000);
      startProgressSaveTimer();
    });
    dp.on('error', () => {
      if (dp.video && dp.video.currentTime > 1) return;
      showError('视频播放失败，请检查视频源或网络连接');
    });
    dp.on('ended', () => {
      state.videoHasEnded = true;
      clearVideoProgress();
      if (state.autoplayEnabled && state.currentEpisodeIndex < state.currentEpisodes.length - 1) {
        setTimeout(() => {
          if (state.videoHasEnded && !state.isUserSeeking) playNextEpisode();
          state.videoHasEnded = false;
        }, 1000);
      }
    });
    dp.on('seeking', () => { state.isUserSeeking = true; });
    dp.on('seeked', () => { setTimeout(() => { state.isUserSeeking = false; }, 200); });

    // 10s超时加载友好提示
    setTimeout(() => {
      if (dp && dp.video && dp.video.currentTime > 0) return;
      if (qs('loading').style.display !== 'none') {
        qs('loading').innerHTML = '<div class="loading-spinner"></div><div>视频加载时间较长，请耐心等待...</div><div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源</div>';
      }
    }, 10000);
  }

  // ---- HLS 错误恢复 ----
  function handleHlsError(event, data, hls, video, player) {
    // 简化版错误处理
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
        case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
        default:
          showError('视频加载失败，可能是格式不兼容或源不可用');
          break;
      }
    }
  }

  class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
      super(config);
      const origLoad = this.load.bind(this);
      this.load = function(context, config, callbacks) {
        if (context.type === 'manifest' || context.type === 'level') {
          const origSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function(response, stats, context) {
            if (response.data && typeof response.data === 'string') {
              response.data = filterAdsFromM3U8(response.data);
            }
            return origSuccess(response, stats, context);
          }
        }
        origLoad(context, config, callbacks);
      }
    }
  }

  function filterAdsFromM3U8(m3u8Content) {
    if (!m3u8Content) return '';
    return m3u8Content.split('\n').filter(line => !line.includes('#EXT-X-DISCONTINUITY')).join('\n');
  }

  // ---- 集数、按钮、切换 ----
  window.playEpisode = function(index) {
    if (index < 0 || index >= state.currentEpisodes.length) return;
    saveCurrentProgress();
    removeProgressSaveTimer();
    qs('error').style.display = 'none';
    qs('loading').style.display = 'flex';
    qs('loading').innerHTML = '<div class="loading-spinner"></div><div>正在加载视频...</div>';
    state.currentEpisodeIndex = index;
    window.history.pushState({}, '', updateQueryUrl({ index, url: state.currentEpisodes[index] }));
    if (state.dp) {
      try {
        state.dp.switchVideo({ url: state.currentEpisodes[index], type: 'hls' });
        state.dp.play().catch(() => { initPlayer(state.currentEpisodes[index]); });
      } catch {
        initPlayer(state.currentEpisodes[index]);
      }
    } else {
      initPlayer(state.currentEpisodes[index]);
    }
    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes();
    state.userClickedPosition = null;
    setTimeout(saveToHistory, 3000);
  };
  window.playPreviousEpisode = () => playEpisode(state.currentEpisodeIndex - 1);
  window.playNextEpisode = () => playEpisode(state.currentEpisodeIndex + 1);
  window.toggleEpisodeOrder = function() {
    state.episodesReversed = !state.episodesReversed;
    localStorage.setItem('episodesReversed', state.episodesReversed);
    renderEpisodes();
    updateOrderButton();
  };
  window.toggleControlsLock = function() {
    const container = qs('playerContainer');
    state.controlsLocked = !state.controlsLocked;
    container.classList.toggle('controls-locked', state.controlsLocked);
    // 可进一步切换 SVG 图标...
  };

  function renderEpisodes() {
    const parent = qs('episodesList');
    if (!parent) return;
    if (!state.currentEpisodes || state.currentEpisodes.length === 0) {
      parent.innerHTML = `<div class="col-span-full text-center text-gray-400 py-8">没有可用的集数</div>`;
      return;
    }
    const episodes = state.episodesReversed ? [...state.currentEpisodes].reverse() : state.currentEpisodes;
    const frag = document.createDocumentFragment();
    episodes.forEach((ep, idx) => {
      const realIndex = state.episodesReversed ? state.currentEpisodes.length - 1 - idx : idx;
      const btn = document.createElement('button');
      btn.id = `episode-${realIndex}`;
      btn.onclick = () => window.playEpisode(realIndex);
      btn.className = `px-4 py-2 ${realIndex === state.currentEpisodeIndex ? 'episode-active border-blue-500' : 'bg-[#222] hover:bg-[#333] border-[#333]'} border rounded-lg transition-colors text-center episode-btn`;
      btn.textContent = `第${realIndex + 1}集`;
      if (realIndex === state.currentEpisodeIndex) btn.setAttribute('aria-current', 'true');
      frag.appendChild(btn);
    });
    parent.innerHTML = '';
    parent.appendChild(frag);
  }

  function updateEpisodeInfo() {
    qs('episodeInfo').textContent = state.currentEpisodes.length > 0
      ? `第 ${state.currentEpisodeIndex + 1}/${state.currentEpisodes.length} 集`
      : '无集数信息';
  }
  function updateButtonStates() {
    const prevButton = qs('prevButton'), nextButton = qs('nextButton');
    updateButton(prevButton, state.currentEpisodeIndex > 0);
    updateButton(nextButton, state.currentEpisodeIndex < state.currentEpisodes.length - 1);
  }
  function updateButton(btn, enabled) {
    if (enabled) {
      btn.classList.remove('bg-gray-700', 'cursor-not-allowed');
      btn.classList.add('bg-[#222]', 'hover:bg-[#333]');
      btn.removeAttribute('disabled');
    } else {
      btn.classList.add('bg-gray-700', 'cursor-not-allowed');
      btn.classList.remove('bg-[#222]', 'hover:bg-[#333]');
      btn.setAttribute('disabled', '');
    }
  }
  function updateOrderButton() {
    const orderText = qs('orderText'), orderIcon = qs('orderIcon');
    orderText.textContent = state.episodesReversed ? '正序排列' : '倒序排列';
    orderIcon.style.transform = state.episodesReversed ? 'rotate(180deg)' : '';
  }

  // ---- 键盘和辅助UI ----
  function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.altKey && e.key === 'ArrowLeft' && state.currentEpisodeIndex > 0) {
      window.playPreviousEpisode(); showShortcutHint('上一集', 'left'); e.preventDefault();
    }
    if (e.altKey && e.key === 'ArrowRight' && state.currentEpisodeIndex < state.currentEpisodes.length - 1) {
      window.playNextEpisode(); showShortcutHint('下一集', 'right'); e.preventDefault();
    }
  }
  function showShortcutHint(text, dir) {
    const hint = qs('shortcutHint'), textEl = qs('shortcutText'), iconEl = qs('shortcutIcon');
    clearTimeout(state.shortcutHintTimeout);
    textEl.textContent = text;
    iconEl.innerHTML = dir === 'left'
      ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>'
      : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
    hint.classList.add('show');
    state.shortcutHintTimeout = setTimeout(() => hint.classList.remove('show'), 2000);
  }

  // ---- 进度、历史、错误、其它 ----
  function saveToHistory() {
    if (!state.currentEpisodes?.length) return;
    const urlParams = new URLSearchParams(window.location.search);
    const sourceName = urlParams.get('source') || '';
    let currentPosition = 0, videoDuration = 0;
    if (state.dp && state.dp.video) {
      currentPosition = state.dp.video.currentTime;
      videoDuration = state.dp.video.duration;
    }
    const videoInfo = {
      title: state.currentVideoTitle,
      url: `player.html?title=${encodeURIComponent(state.currentVideoTitle)}&source=${encodeURIComponent(sourceName)}`,
      episodeIndex: state.currentEpisodeIndex,
      sourceName,
      timestamp: Date.now(),
      playbackPosition: currentPosition > 10 ? currentPosition : 0,
      duration: videoDuration,
      episodes: [...state.currentEpisodes],
    };
    // 如果有全局 addToViewingHistory，可直接用
    if (typeof window.addToViewingHistory === 'function') {
      window.addToViewingHistory(videoInfo);
    } else {
      try {
        const history = safeParseJSON(localStorage.getItem('viewingHistory'), []);
        const existingIndex = history.findIndex(item => item.title === videoInfo.title);
        if (existingIndex !== -1) {
          const item = history.splice(existingIndex, 1)[0];
          Object.assign(item, videoInfo);
          history.unshift(item);
        } else {
          videoInfo.url = window.location.href;
          history.unshift(videoInfo);
        }
        if (history.length > 50) history.splice(50);
        localStorage.setItem('viewingHistory', JSON.stringify(history));
      } catch (e) {/* 忽略历史保存异常 */}
    }
  }
  function showError(msg) {
    if (state.dp && state.dp.video && state.dp.video.currentTime > 1) return;
    qs('loading').style.display = 'none';
    qs('error').style.display = 'flex';
    qs('error-message').textContent = msg;
  }
  function saveCurrentProgress() {
    if (!state.dp || !state.dp.video) return;
    const currentTime = state.dp.video.currentTime, duration = state.dp.video.duration;
    if (!duration || currentTime < 1) return;
    const progressKey = `videoProgress_${getVideoId()}`;
    const progressData = { position: currentTime, duration, timestamp: Date.now() };
    try {
      localStorage.setItem(progressKey, JSON.stringify(progressData));
    } catch {}
  }
  function clearVideoProgress() {
    try { localStorage.removeItem(`videoProgress_${getVideoId()}`); } catch {}
  }
  function startProgressSaveTimer() {
    removeProgressSaveTimer();
    state.progressSaveInterval = setInterval(saveCurrentProgress, 30000);
  }
  function removeProgressSaveTimer() {
    if (state.progressSaveInterval) clearInterval(state.progressSaveInterval);
    state.progressSaveInterval = null;
  }
  function subscribeVideoEvents() {
    const check = setInterval(() => {
      if (state.dp && state.dp.video) {
        state.dp.video.addEventListener('pause', saveCurrentProgress);
        let lastSave = 0;
        state.dp.video.addEventListener('timeupdate', function () {
          const now = Date.now();
          if (now - lastSave > 5000) { saveCurrentProgress(); lastSave = now; }
        });
        clearInterval(check);
      }
    }, 200);
  }

  // ---- 进度条、定位恢复等 ----
  function setupProgressBarPreciseClicks() {
    const bar = document.querySelector('.dplayer-bar-wrap');
    if (!bar || !state.dp || !state.dp.video) return;
    bar.removeEventListener('mousedown', handleProgressBarClick);
    bar.addEventListener('mousedown', handleProgressBarClick);
    bar.removeEventListener('touchstart', handleProgressBarTouch);
    bar.addEventListener('touchstart', handleProgressBarTouch);
  }
  function handleProgressBarClick(e) {
    if (!state.dp || !state.dp.video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const duration = state.dp.video.duration;
    let clickTime = percentage * duration;
    if (duration - clickTime < 1) clickTime = Math.min(clickTime, duration - 1.5);
    state.userClickedPosition = clickTime;
    e.stopPropagation();
    state.dp.seek(clickTime);
  }
  function handleProgressBarTouch(e) {
    if (!state.dp || !state.dp.video || !e.touches[0]) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (touch.clientX - rect.left) / rect.width;
    const duration = state.dp.video.duration;
    let clickTime = percentage * duration;
    if (duration - clickTime < 1) clickTime = Math.min(clickTime, duration - 1.5);
    state.userClickedPosition = clickTime;
    e.stopPropagation();
    state.dp.seek(clickTime);
  }
  function showPositionRestoreHint(position) {
    if (!position || position < 10) return;
    const hint = document.createElement('div');
    hint.className = 'position-restore-hint';
    hint.innerHTML = `<div class="hint-content">已从 ${formatTime(position)} 继续播放</div>`;
    document.querySelector('.player-container').appendChild(hint);
    setTimeout(() => {
      hint.classList.add('show');
      setTimeout(() => {
        hint.classList.remove('show');
        setTimeout(() => hint.remove(), 300);
      }, 3000);
    }, 100);
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') saveCurrentProgress();
  }
  function updateQueryUrl(obj) {
    const url = new URL(window.location.href);
    Object.entries(obj).forEach(([k, v]) => url.searchParams.set(k, v));
    return url;
  }

  // ---- Toast 简易通知 ----
  window.showToast = function(msg, type = 'error') {
    let existingToast = document.getElementById('custom-toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.id = 'custom-toast';
    toast.style.position = 'fixed'; toast.style.top = '20px'; toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = type === 'error' ? '#f44336' : '#4caf50';
    toast.style.color = 'white'; toast.style.padding = '12px 20px';
    toast.style.borderRadius = '4px'; toast.style.zIndex = '10000'; toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s ease-in-out';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '1'; setTimeout(() => {
        toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300);
      }, 3000);
    }, 10);
  };

  // 向全局暴露外部需求函数
  window.playEpisode = window.playEpisode;
  window.playPreviousEpisode = window.playPreviousEpisode;
  window.playNextEpisode = window.playNextEpisode;
  window.toggleEpisodeOrder = window.toggleEpisodeOrder;
  window.toggleControlsLock = window.toggleControlsLock;

})();
