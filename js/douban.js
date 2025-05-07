// douban.js

// 常量配置区域 
const CONFIG = {
  // API相关
  TIMEOUT: 10000,
  PAGE_SIZE: 16, 
  MAX_TAG_LENGTH: 20,
  MAX_PAGE_START: 144,

  // 存储键名
  STORAGE_KEYS: {
    ENABLED: 'doubanEnabled',
    MOVIE_TAGS: 'userMovieTags',
    TV_TAGS: 'userTvTags'
  },

  // 媒体类型
  MEDIA_TYPES: {
    MOVIE: 'movie',
    TV: 'tv'
  },

  // 默认标签
  DEFAULT_TAG: '热门',
  
  // UI相关
  CLASSES: {
    ACTIVE: 'bg-pink-600 text-white',
    INACTIVE: 'text-gray-300',
    CARD: 'bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg'
  },

  // 错误信息
  MESSAGES: {
    NETWORK_ERROR: '网络连接失败，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，请稍后重试', 
    API_ERROR: '获取豆瓣数据失败，请稍后重试',
    TAG_EXISTS: '标签已存在',
    TAG_RESERVED: '热门标签不能删除',
    TAG_INVALID: '标签只能包含中文、英文、数字和空格',
    TAG_TOO_LONG: '标签长度不能超过20个字符'
  }
};

// 默认标签配置
const defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
const defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

// 应用状态管理
let movieTags = [];
let tvTags = [];
let doubanMovieTvCurrentSwitch = CONFIG.MEDIA_TYPES.MOVIE;
let doubanCurrentTag = CONFIG.DEFAULT_TAG;
let doubanPageStart = 0;
const doubanPageSize = CONFIG.PAGE_SIZE;
// DOM 元素缓存
const cachedElements = new Map();
// 工具函数
const utils = {
  // 防抖函数
  debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // 安全文本处理 - 增强型XSS防护
  safeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]);
  },
  
  // 验证标签格式
  validateTag(tag) {
    if (!tag?.trim()) {
      showToast('标签不能为空', 'warning');
      return false;
    }

    if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s]+$/.test(tag)) {
      showToast(CONFIG.MESSAGES.TAG_INVALID, 'warning');
      return false;
    }

    if (tag.length > CONFIG.MAX_TAG_LENGTH) {
      showToast(CONFIG.MESSAGES.TAG_TOO_LONG, 'warning');
      return false;
    }

    return true;
  },

  // 获取缓存的DOM元素
  getElement(id) {
    if (!cachedElements.has(id)) {
      const element = document.getElementById(id);
      if (element) {
        cachedElements.set(id, element);
      }
    }
    return cachedElements.get(id);
  },

  // 创建loading遮罩
  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-10';
    overlay.innerHTML = `
      <div class="flex items-center justify-center">
        <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-pink-500 ml-4">加载中...</span>
      </div>
    `;
    return overlay;
  },

  // 存储操作包装
  storage: {
    get(key, defaultValue = null) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
      } catch (e) {
        console.error(`Error reading from localStorage: ${key}`, e);
        return defaultValue;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error(`Error writing to localStorage: ${key}`, e);
        return false;
      }
    }
  }
};
  
// 加载用户标签
function loadUserTags() {
  movieTags = utils.storage.get(CONFIG.STORAGE_KEYS.MOVIE_TAGS, [...defaultMovieTags]);
  tvTags = utils.storage.get(CONFIG.STORAGE_KEYS.TV_TAGS, [...defaultTvTags]);
}

// 保存用户标签
function saveUserTags() {
  const movieSaved = utils.storage.set(CONFIG.STORAGE_KEYS.MOVIE_TAGS, movieTags);
  const tvSaved = utils.storage.set(CONFIG.STORAGE_KEYS.TV_TAGS, tvTags);
  
  if (!movieSaved || !tvSaved) {
    showToast('保存标签失败', 'error');
  }
}


// 初始化豆瓣功能
function initDouban() {
  // 初始化关键DOM元素缓存
  ['doubanToggle', 'doubanArea', 'douban-movie-toggle', 'douban-tv-toggle', 
   'douban-tags', 'douban-refresh', 'douban-results', 'searchInput'].forEach(id => {
    utils.getElement(id);
  });

  const doubanToggle = utils.getElement('doubanToggle');
  if (doubanToggle) {
    const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, true) === true;
    doubanToggle.checked = isEnabled;

    const toggleBg = doubanToggle.nextElementSibling;
    const toggleDot = toggleBg.nextElementSibling;
    
    if (isEnabled) {
      toggleBg.classList.add('bg-pink-600');
      toggleDot.classList.add('translate-x-6');
    }

    doubanToggle.addEventListener('change', function(e) {
      const isChecked = e.target.checked;
      utils.storage.set(CONFIG.STORAGE_KEYS.ENABLED, isChecked);

      if (isChecked) {
        toggleBg.classList.add('bg-pink-600');
        toggleDot.classList.add('translate-x-6');
      } else {
        toggleBg.classList.remove('bg-pink-600');
        toggleDot.classList.remove('translate-x-6');
      }

      updateDoubanVisibility();
    });

    updateDoubanVisibility();
  }

  loadUserTags();
  renderDoubanMovieTvSwitch();
  renderDoubanTags();
  setupDoubanRefreshBtn();

  if (utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true) {
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }
}

// 更新豆瓣区域显示状态
function updateDoubanVisibility() {
  const doubanArea = utils.getElement('doubanArea');
  if (!doubanArea) return;

  const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true;
  const resultsArea = utils.getElement('resultsArea');
  const isSearching = resultsArea && !resultsArea.classList.contains('hidden');

  if (isEnabled && !isSearching) {
    doubanArea.classList.remove('hidden');
    const doubanResults = utils.getElement('douban-results');
    if (doubanResults && doubanResults.children.length === 0) {
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
  } else {
    doubanArea.classList.add('hidden');
  }
}

// 填充搜索框函数
function fillSearchInput(title) {
  if (!title) return;

  const safeTitle = utils.safeText(title);
  const input = utils.getElement('searchInput');
  
  if (input) {
    input.value = safeTitle;
    input.focus();
    showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
  }
}

// 填充并搜索
function fillAndSearch(title) {
  if (!title) return;

  const safeTitle = utils.safeText(title);
  const input = utils.getElement('searchInput');
  
  if (input) {
    input.value = safeTitle;
    if (typeof search === 'function') {
      search();
    } else {
      console.error('search函数不可用');
      showToast('搜索功能暂不可用', 'error');
    }
  }
}

// 使用豆瓣资源搜索
function fillAndSearchWithDouban(title) {
  if (!title) return;

  const safeTitle = utils.safeText(title);

  // 检查并选择豆瓣资源API
  if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
    const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
    if (doubanCheckbox) {
      doubanCheckbox.checked = true;

      if (typeof updateSelectedAPIs === 'function') {
        updateSelectedAPIs();
      } else {
        selectedAPIs.push('dbzy');
        utils.storage.set('selectedAPIs', selectedAPIs);

        const countEl = document.getElementById('selectedAPICount');
        if (countEl) {
          countEl.textContent = selectedAPIs.length;
        }
      }

      showToast('已自动选择豆瓣资源API', 'info');
    }
  }

  const input = utils.getElement('searchInput');
  if (input) {
    input.value = safeTitle;
    if (typeof search === 'function') {
      search();
    } else {
      console.error('search函数不可用');
      showToast('搜索功能暂不可用', 'error');
    }
  }
}


// 渲染电影/电视剧切换器
function renderDoubanMovieTvSwitch() {
  const movieToggle = utils.getElement('douban-movie-toggle');
  const tvToggle = utils.getElement('douban-tv-toggle');

  if (!movieToggle || !tvToggle) return;

  const updateToggleState = (isMovie) => {
    const newType = isMovie ? CONFIG.MEDIA_TYPES.MOVIE : CONFIG.MEDIA_TYPES.TV;
    if (doubanMovieTvCurrentSwitch === newType) return;

    const activeToggle = isMovie ? movieToggle : tvToggle;
    const inactiveToggle = isMovie ? tvToggle : movieToggle;

    activeToggle.classList.add(...CONFIG.CLASSES.ACTIVE.split(' '));
    activeToggle.classList.remove(CONFIG.CLASSES.INACTIVE);

    inactiveToggle.classList.remove(...CONFIG.CLASSES.ACTIVE.split(' '));
    inactiveToggle.classList.add(CONFIG.CLASSES.INACTIVE);

    doubanMovieTvCurrentSwitch = newType;
    doubanCurrentTag = CONFIG.DEFAULT_TAG;
    doubanPageStart = 0;

    renderDoubanTags();
    
    if (utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true) {
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
  };

  movieToggle.addEventListener('click', () => updateToggleState(true));
  tvToggle.addEventListener('click', () => updateToggleState(false));
}

// 渲染豆瓣标签
function renderDoubanTags() {
  const tagContainer = utils.getElement('douban-tags');
  if (!tagContainer) return;

  const currentTags = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE ? movieTags : tvTags;
  const fragment = document.createDocumentFragment();

  // 添加标签管理按钮
  const manageBtn = document.createElement('button');
  manageBtn.className = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white';
  manageBtn.innerHTML = `
    <span class="flex items-center">
      <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
      </svg>
      管理标签
    </span>
  `;
  manageBtn.onclick = showTagManageModal;
  fragment.appendChild(manageBtn);

  // 添加标签按钮
  currentTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = `py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 ${
      tag === doubanCurrentTag ? CONFIG.CLASSES.ACTIVE : 'bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white'
    }`;
    btn.textContent = tag;

    btn.onclick = utils.debounce(function() {
      if (doubanCurrentTag !== tag) {
        doubanCurrentTag = tag;
        doubanPageStart = 0;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        renderDoubanTags();
      }
    }, 300);

    fragment.appendChild(btn);
  });

  tagContainer.innerHTML = '';
  tagContainer.appendChild(fragment);
}

// 设置换一批按钮
function setupDoubanRefreshBtn() {
  const btn = utils.getElement('douban-refresh');
  if (!btn) return;

  btn.onclick = utils.debounce(function() {
    doubanPageStart += doubanPageSize;
    if (doubanPageStart > CONFIG.MAX_PAGE_START) {
      doubanPageStart = 0;
    }
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }, 500);
}

// 获取豆瓣数据
async function fetchDoubanData(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Referer': 'https://movie.douban.com/',
      'Accept': 'application/json, text/plain, */*',
    }
  };

  try {
    if (typeof PROXY_URL === 'undefined') {
      throw new Error('代理URL配置缺失');
    }

    const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("豆瓣 API 请求失败：", err);

    if (err.name === 'AbortError') {
      throw new Error(CONFIG.MESSAGES.TIMEOUT_ERROR);
    }

    // 尝试备用接口
    try {
      const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const fallbackResponse = await fetch(fallbackUrl);

      if (!fallbackResponse.ok) {
        throw new Error(`备用API请求失败! 状态: ${fallbackResponse.status}`);
      }

      const data = await fallbackResponse.json();
      if (data?.contents) {
        return JSON.parse(data.contents);
      }
      
      throw new Error("无法获取有效数据");
    } catch (fallbackErr) {
      console.error("豆瓣 API 备用请求也失败：", fallbackErr);
      throw new Error(CONFIG.MESSAGES.API_ERROR);
    }
  }
}

// 渲染推荐内容
async function renderRecommend(tag, pageLimit, pageStart) {
  const container = utils.getElement("douban-results");
  if (!container) return;

  const loadingOverlay = utils.createLoadingOverlay();
  container.classList.add("relative");
  container.appendChild(loadingOverlay);

  try {
    const target = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;
    const data = await fetchDoubanData(target);
    renderDoubanCards(data, container);
  } catch (error) {
    console.error("获取豆瓣数据失败：", error);
    container.innerHTML = `
      <div class="col-span-full text-center py-8">
        <div class="text-red-400">❌ ${CONFIG.MESSAGES.API_ERROR}</div>
        <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
      </div>
    `;
  } finally {
    if (container.contains(loadingOverlay)) {
      container.removeChild(loadingOverlay);
    }
    container.classList.remove("relative");
  }
}

// 渲染豆瓣卡片
function renderDoubanCards(data, container) {
  const fragment = document.createDocumentFragment();

  if (!data?.subjects?.length) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "col-span-full text-center py-8";
    emptyEl.innerHTML = '<div class="text-pink-500">❌ 暂无数据，请尝试其他分类或刷新</div>';
    fragment.appendChild(emptyEl);
  } else {
    data.subjects.forEach(item => {
      const safeTitle = utils.safeText(item.title);
      const safeRate = utils.safeText(item.rate || "暂无");
      const safeUrl = item.url || "#";
      const originalCoverUrl = item.cover || "";
      const proxiedCoverUrl = typeof PROXY_URL !== 'undefined' ? 
                             PROXY_URL + encodeURIComponent(originalCoverUrl) : 
                             originalCoverUrl;

      const card = document.createElement("div");
      card.className = CONFIG.CLASSES.CARD;
      
      // 使用数据属性传递数据，而不是直接在onclick中使用
      card.setAttribute('data-title', safeTitle);
      
      card.innerHTML = `
        <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer douban-card-cover">
          <img src="${originalCoverUrl}" alt="${safeTitle}"
              class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
              onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
              loading="lazy" referrerpolicy="no-referrer">
          <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
          <div class="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm">
              <span class="text-yellow-400">★</span> ${safeRate}
          </div>
          <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors">
              <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看" class="douban-link">
                  🔗
              </a>
          </div>
        </div>
        <div class="p-2 text-center bg-[#111]">
          <button class="douban-search-btn text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                  title="${safeTitle}">
              ${safeTitle}
          </button>
        </div>
      `;
      
      // 使用事件委托而非内联事件
      const coverEl = card.querySelector('.douban-card-cover');
      const buttonEl = card.querySelector('.douban-search-btn');
      const linkEl = card.querySelector('.douban-link');
      
      if (coverEl) {
        coverEl.addEventListener('click', () => fillAndSearchWithDouban(safeTitle));
      }
      
      if (buttonEl) {
        buttonEl.addEventListener('click', () => fillAndSearchWithDouban(safeTitle));
      }
      
      if (linkEl) {
        linkEl.addEventListener('click', (e) => e.stopPropagation());
      }

      fragment.appendChild(card);
    });
  }

  container.innerHTML = "";
  container.appendChild(fragment);
}

// 显示标签管理模态框
function showTagManageModal() {
  let modal = document.getElementById('tagManageModal');
  if (modal) {
    document.body.removeChild(modal);
  }

  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;
  const currentTags = isMovie ? movieTags : tvTags;

  modal = document.createElement('div');
  modal.id = 'tagManageModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';

  const modalContent = `
    <div class="bg-[#191919] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
      <button id="closeTagModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">&times;</button>
      <h3 class="text-xl font-bold text-white mb-4">标签管理 (${isMovie ? '电影' : '电视剧'})</h3>
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <h4 class="text-lg font-medium text-gray-300">标签列表</h4>
          <button id="resetTagsBtn" class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
            恢复默认标签
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" id="tagsGrid">
          ${currentTags.length ? currentTags.map(tag => {
            const canDelete = tag !== CONFIG.DEFAULT_TAG;
            const safeTag = utils.safeText(tag);
            return `
              <div class="bg-[#1a1a1a] text-gray-300 py-1.5 px-3 rounded text-sm font-medium flex justify-between items-center group">
                <span>${safeTag}</span>
                ${canDelete ?
                  `<button class="delete-tag-btn text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-tag="${safeTag}">✕</button>` :
                  `<span class="text-gray-500 text-xs italic opacity-0 group-hover:opacity-100">必需</span>`
                }
              </div>
            `;
          }).join('') :
          `<div class="col-span-full text-center py-4 text-gray-500">无标签，请添加或恢复默认</div>`}
        </div>
      </div>
      <div class="border-t border-gray-700 pt-4">
        <h4 class="text-lg font-medium text-gray-300 mb-3">添加新标签</h4>
        <form id="addTagForm" class="flex items-center">
          <input type="text" id="newTagInput" placeholder="输入标签名称..."
                 class="flex-1 bg-[#222] text-white border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-pink-500"
                 maxlength="${CONFIG.MAX_TAG_LENGTH}">
          <button type="submit" class="ml-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded">添加</button>
        </form>
        <p class="text-xs text-gray-500 mt-2">提示：标签名称不能为空，不能重复，不能包含特殊字符</p>
      </div>
    </div>
  `;

  modal.innerHTML = modalContent;
  document.body.appendChild(modal);

  // 设置焦点
  setTimeout(() => {
    const input = document.getElementById('newTagInput');
    if (input) input.focus();
  }, 100);

  // 使用事件委托处理删除按钮点击
  const tagsGrid = modal.querySelector('#tagsGrid');
  if (tagsGrid) {
    tagsGrid.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-tag-btn');
      if (deleteBtn) {
        const tagToDelete = deleteBtn.getAttribute('data-tag');
        deleteTag(tagToDelete);
        showTagManageModal(); // 刷新弹窗
      }
    });
  }

  // 设置其他事件监听器
  modal.querySelector('#closeTagModal')?.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  modal.querySelector('#resetTagsBtn')?.addEventListener('click', () => {
    resetTagsToDefault();
    showTagManageModal();
  });

  modal.querySelector('#addTagForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const input = document.getElementById('newTagInput');
    if (!input) return;
    
    const newTag = input.value.trim();
    if (newTag) {
      addTag(newTag);
      input.value = '';
      showTagManageModal();
    }
  });
}

// 添加标签
function addTag(tag) {
  if (!utils.validateTag(tag)) return;

  const safeTag = utils.safeText(tag);
  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;
  const currentTags = isMovie ? movieTags : tvTags;

  if (currentTags.some(existingTag => existingTag.toLowerCase() === safeTag.toLowerCase())) {
    showToast(CONFIG.MESSAGES.TAG_EXISTS, 'warning');
    return;
  }

  if (isMovie) {
    movieTags.push(safeTag);
  } else {
    tvTags.push(safeTag);
  }

  saveUserTags();
  renderDoubanTags();
  showToast('标签添加成功', 'success');
}

// 删除标签
function deleteTag(tag) {
  if (!tag) return;
  
  if (tag === CONFIG.DEFAULT_TAG) {
    showToast(CONFIG.MESSAGES.TAG_RESERVED, 'warning');
    return;
  }

  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;
  const currentTags = isMovie ? movieTags : tvTags;
  const index = currentTags.indexOf(tag);

  if (index !== -1) {
    currentTags.splice(index, 1);
    saveUserTags();

    if (doubanCurrentTag === tag) {
      doubanCurrentTag = CONFIG.DEFAULT_TAG;
      doubanPageStart = 0;
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }

    renderDoubanTags();
    showToast('标签删除成功', 'success');
  }
}

// 重置为默认标签
function resetTagsToDefault() {
  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;
  
  if (isMovie) {
    movieTags = [...defaultMovieTags];
  } else {
    tvTags = [...defaultTvTags];
  }

  doubanCurrentTag = CONFIG.DEFAULT_TAG;
  doubanPageStart = 0;

  saveUserTags();
  renderDoubanTags();
  renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  showToast('已恢复默认标签', 'success');
}

// 重置到首页
function resetToHome() {
  if (typeof resetSearchArea === 'function') {
    resetSearchArea();
  }
  updateDoubanVisibility();
}

// 初始化：页面加载完成时执行
document.addEventListener('DOMContentLoaded', initDouban);

