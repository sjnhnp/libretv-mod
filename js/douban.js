// ================= 豆瓣热门电影电视剧推荐功能 =================

// ------ 豆瓣标签列表及相关状态 ------
let movieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
let tvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];
let doubanMovieTvCurrentSwitch = 'movie';  // 当前tab：movie/tv
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16; // 每页项目数

// ============= 工具函数 =============

/** 统一XSS转义Title用 */
function escapeHtml(str) {
    return String(str).replace(/[<>"']/g, c => ({
        '<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'
    }[c]));
}

/** 节点存在检查,不存在直接return */
function $(id) {
    return document.getElementById(id);
}

// ========== 初始化 =============

function initDouban() {
    // 1. 初始化toggle switch
    const doubanToggle = $('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
        doubanToggle.checked = isEnabled;

        // 切换外观
        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg?.nextElementSibling;
        if (isEnabled) {
            toggleBg?.classList.add('bg-pink-600');
            toggleDot?.classList.add('translate-x-6');
        }
        doubanToggle.addEventListener('change', function(e) {
            const checked = e.target.checked;
            localStorage.setItem('doubanEnabled', checked);

            if (checked) {
                toggleBg?.classList.add('bg-pink-600');
                toggleDot?.classList.add('translate-x-6');
            } else {
                toggleBg?.classList.remove('bg-pink-600');
                toggleDot?.classList.remove('translate-x-6');
            }
            updateDoubanVisibility();
        });
        updateDoubanVisibility();
    }

    // 2. 获取热门标签
    fetchDoubanTags();

    // 3. 渲染切换器与标签
    renderDoubanMovieTvSwitch();
    renderDoubanTags();

    // 4. 换一批按钮
    setupDoubanRefreshBtn();

    // 5. 首次加载推荐
    if (localStorage.getItem('doubanEnabled') === 'true') {
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
}

// ========== 显示/隐藏豆瓣区 ==========
function updateDoubanVisibility() {
    const doubanArea = $('doubanArea');
    if (!doubanArea) return;
    const enabled = localStorage.getItem('doubanEnabled') === 'true';
    const isSearching = $('resultsArea') && !$('resultsArea').classList.contains('hidden');
    if (enabled && !isSearching) {
        doubanArea.classList.remove('hidden');
        // 无内容才加载数据
        if ($('douban-results')?.children.length === 0) {
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    } else {
        doubanArea.classList.add('hidden');
    }
}

// ========== 搜索框相关操作 ==========
/** 填充搜索框、或及执行搜索、可选自动勾选dbzy */
function fillSearch(title, opts = {}) {
    if (!title) return;
    const safeTitle = escapeHtml(title);
    const input = $('searchInput');
    if (input) {
        input.value = safeTitle;
        if (opts.focus) input.focus();
        if (opts.dbzy) { // 自动勾选豆瓣资源
            if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
                const doubanCheckbox = $('api_dbzy');
                if (doubanCheckbox) doubanCheckbox.checked = true;
                if (typeof updateSelectedAPIs === 'function') {
                    updateSelectedAPIs();
                } else {
                    selectedAPIs.push('dbzy');
                    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
                    const countEl = $('selectedAPICount');
                    if (countEl) countEl.textContent = selectedAPIs.length;
                }
                if (typeof showToast === 'function') showToast('已自动选择豆瓣资源API', 'info');
            }
        }
        if (opts.search && typeof search === 'function') {
            search();
        } else if (opts.infoToast && typeof showToast === 'function') {
            showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
        }
    }
}

// 只填充，不自动搜索
function fillSearchInput(title) {
    fillSearch(title, { focus:true, infoToast:true });
}
// 填充并自动搜索
function fillAndSearch(title) {
    fillSearch(title, { search:true });
}
// 填充并确保豆瓣API+自动搜索
function fillAndSearchWithDouban(title) {
    fillSearch(title, { dbzy:true, search:true });
}

// ========== 电影/电视剧切换器渲染 ==========
function renderDoubanMovieTvSwitch() {
    const movieToggle = $('douban-movie-toggle');
    const tvToggle = $('douban-tv-toggle');
    if (!movieToggle || !tvToggle) return;

    movieToggle.addEventListener('click', function() {
        if (doubanMovieTvCurrentSwitch === 'movie') return;
        movieToggle.classList.add('bg-pink-600','text-white');
        movieToggle.classList.remove('text-gray-300');
        tvToggle.classList.remove('bg-pink-600','text-white');
        tvToggle.classList.add('text-gray-300');
        doubanMovieTvCurrentSwitch = 'movie';
        doubanCurrentTag = '热门';
        renderDoubanTags(movieTags);
        setupDoubanRefreshBtn();
        if (localStorage.getItem('doubanEnabled') === 'true') {
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart=0);
        }
    });
    tvToggle.addEventListener('click', function() {
        if (doubanMovieTvCurrentSwitch === 'tv') return;
        tvToggle.classList.add('bg-pink-600','text-white');
        tvToggle.classList.remove('text-gray-300');
        movieToggle.classList.remove('bg-pink-600','text-white');
        movieToggle.classList.add('text-gray-300');
        doubanMovieTvCurrentSwitch = 'tv';
        doubanCurrentTag = '热门';
        renderDoubanTags(tvTags);
        setupDoubanRefreshBtn();
        if (localStorage.getItem('doubanEnabled') === 'true') {
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart=0);
        }
    });
}

// ========== 标签选择器渲染 ==========
function renderDoubanTags(tags) {
    const tagContainer = $('douban-tags');
    if (!tagContainer) return;
    tags = tags || (doubanMovieTvCurrentSwitch==='movie' ? movieTags : tvTags);
    tagContainer.innerHTML = '';
    tags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 ' +
            (tag === doubanCurrentTag ?
                'bg-pink-600 text-white shadow-md' :
                'bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white');
        btn.textContent = tag;
        btn.onclick = function() {
            if (doubanCurrentTag !== tag) {
                doubanCurrentTag = tag;
                doubanPageStart = 0;
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
                renderDoubanTags(tags);
            }
        };
        tagContainer.appendChild(btn);
    });
}

// ========== 换一批 ==========
function setupDoubanRefreshBtn() {
    const btn = $('douban-refresh');
    if (!btn) return;
    btn.onclick = function() {
        doubanPageStart += doubanPageSize;
        if (doubanPageStart > 9 * doubanPageSize) doubanPageStart = 0;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    };
}

// ====== 拉取标签（豆瓣API/CORS）=======
function fetchDoubanTags() {
    fetchDoubanData('https://movie.douban.com/j/search_tags?type=movie')
        .then(data => {
            if (data.tags) movieTags = data.tags;
            if (doubanMovieTvCurrentSwitch === 'movie') renderDoubanTags(movieTags);
        }).catch(e => console.error("豆瓣电影标签获取失败：", e));
    fetchDoubanData('https://movie.douban.com/j/search_tags?type=tv')
        .then(data => {
            if (data.tags) tvTags = data.tags;
            if (doubanMovieTvCurrentSwitch === 'tv') renderDoubanTags(tvTags);
        }).catch(e => console.error("豆瓣电视剧标签获取失败：", e));
}

// ======= 渲染热门推荐内容 =======
function renderRecommend(tag, pageLimit, pageStart) {
    const container = $("douban-results");
    if (!container) return;
    // 加载状态
    container.classList.add("relative");
    container.innerHTML = `
      <div class="absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-10">
        <div class="flex items-center">
          <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-pink-500 ml-4">加载中...</span>
        </div>
      </div>
    `;

    const dataUrl = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;
    fetchDoubanData(dataUrl).then(data => {
        renderDoubanCards(data, container);
    }).catch(error => {
        console.error("获取豆瓣数据失败：", error);
        container.innerHTML = `
            <div class="col-span-full text-center py-8 text-red-400">❌ 获取豆瓣数据失败，请稍后重试<br>
            <span class="text-sm text-gray-500">提示：使用VPN可能有助于解决此问题</span></div>`;
    });
}

// ==== 拉取API，并自带fallback ====
async function fetchDoubanData(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    try {
        // PROXY_URL必须是全局已定义的前缀
        const response = await fetch(PROXY_URL + encodeURIComponent(url), {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://movie.douban.com/',
                'Accept': 'application/json, text/plain, */*'
            }
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("豆瓣 API 请求失败，尝试备用：", err);
        // fallback: allorigins代理
        const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) throw new Error(`备用API失败！状态:${fallbackResponse.status}`);
        const data = await fallbackResponse.json();
        if (data && data.contents) return JSON.parse(data.contents);
        throw new Error("allorigins 代理无效数据");
    }
}

// ========== 渲染卡片 =============
function renderDoubanCards(data, container) {
    const fragment = document.createDocumentFragment();
    if (!data.subjects || data.subjects.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "col-span-full text-center py-8";
        emptyEl.innerHTML = `<div class="text-pink-500">❌ 暂无数据，请尝试其他分类或刷新</div>`;
        fragment.appendChild(emptyEl);
    } else {
        // 批量渲染
        data.subjects.forEach(item => {
            const card = document.createElement('div');
            card.className = "bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg";
            const safeTitle = escapeHtml(item.title);
            const safeRate = escapeHtml(item.rate||"暂无");
            const originalCoverUrl = item.cover;
            const proxiedCoverUrl = PROXY_URL + encodeURIComponent(originalCoverUrl);
            card.innerHTML = `
                <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
                    <img src="${originalCoverUrl}" alt="${safeTitle}"
                        class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                        onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
                        loading="lazy" referrerpolicy="no-referrer">
                    <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
                    <div class="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm">
                        <span class="text-yellow-400">★</span> ${safeRate}
                    </div>
                    <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors">
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看">🔗</a>
                    </div>
                </div>
                <div class="p-2 text-center bg-[#111]">
                    <button onclick="fillAndSearchWithDouban('${safeTitle}')"
                        class="text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                        title="${safeTitle}">
                        ${safeTitle}
                    </button>
                </div>
            `;
            fragment.appendChild(card);
        });
    }
    container.innerHTML = '';
    container.appendChild(fragment);
}

// ==== 首页重置 ====
function resetToHome() {
    if (typeof resetSearchArea === 'function') resetSearchArea();
    updateDoubanVisibility();
}

// ==== 页面加载时启动 ====
document.addEventListener('DOMContentLoaded', initDouban);
