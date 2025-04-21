// /js/components/HistoryItem.js

/**
 * historyData: 观看历史/搜索历史单项对象
 * type: 'viewing'|'search'
 * onPlayCallback: (url, title, episodeIndex, playbackPosition, episodes) => void  <-- 注意参数签名变化！
 * onDeleteCallback: (historyData) => void
 */
export function createHistoryItemElement(historyData, type, onPlayCallback, onDeleteCallback) {
    const wrapper = document.createElement('div');
    // ... (其他代码保持不变，如设置 className, 创建删除按钮等) ...
    wrapper.className = 'history-item cursor-pointer relative group p-3 hover:bg-gray-800 rounded transition-colors duration-150 mb-2'; // 稍作样式调整示例

    // 删除按钮 (保持不变)
    const btn = document.createElement('button');
    btn.className = 'absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-700 z-10'; // 调整 hover 背景
    btn.title = '删除记录';
    btn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>`;
    btn.addEventListener('click', ev => {
        ev.stopPropagation();
        if (typeof onDeleteCallback === 'function') onDeleteCallback(historyData);
    });
    wrapper.appendChild(btn);

    const info = document.createElement('div');
    info.className = 'history-info';
    // 标题 (保持不变)
    const t = document.createElement('div');
    t.className = 'history-title font-semibold text-sm mb-1 truncate'; // 调整样式
    t.textContent = historyData.title || '未知标题'; // 添加默认值
    info.appendChild(t);

    // 元信息部分（观看历史）(保持不变)
    if (type === 'viewing') {
        const meta = document.createElement('div');
        meta.className = 'history-meta text-xs text-gray-400 mb-1 flex items-center flex-wrap gap-x-1'; // 调整样式

        if (historyData.episodeIndex !== undefined && historyData.episodeIndex !== null) { // 更严格的检查
            const ep = document.createElement('span');
            ep.className = 'history-episode';
            ep.textContent = `第 ${historyData.episodeIndex + 1} 集`;
            meta.appendChild(ep);
            const sep = document.createElement('span');
            sep.className = 'history-separator'; // 移除 mx-1，用 gap 代替
            sep.textContent = '·';
            meta.appendChild(sep);
        }
        const source = document.createElement('span');
        source.className = 'history-source';
        source.textContent = historyData.sourceName || '未知来源';
        meta.appendChild(source);
        info.appendChild(meta);

        // 播放进度 (保持不变)
        if (historyData.playbackPosition && historyData.duration && historyData.duration > 0 && historyData.playbackPosition > 5 && historyData.playbackPosition < historyData.duration * 0.98) { // 调整阈值和检查 duration > 0
            const percent = Math.min(100, Math.max(0, Math.round((historyData.playbackPosition / historyData.duration) * 100))); // 确保百分比在 0-100
            const prog = document.createElement('div');
            prog.className = 'history-progress mt-1';
            // 简单的进度条样式 (Tailwind)
            prog.innerHTML = `
                <div class="w-full bg-gray-600 rounded-full h-1 mb-0.5">
                    <div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-1 rounded-full" style="width: ${percent}%"></div>
                </div>
                <div class="progress-text text-xs text-gray-500">${formatPlaybackTime(historyData.playbackPosition)} / ${formatPlaybackTime(historyData.duration)}</div>`;
            info.appendChild(prog);
        }
        // 时间戳 (保持不变，但建议使用导入的 formatTimestamp)
        const tt = document.createElement('div');
        tt.className = 'history-time text-xs text-gray-500 mt-1';
        // 最好从 ui.js 导入 formatTimestamp 而不是依赖全局 window 对象
        tt.textContent = typeof formatTimestamp === 'function' ? formatTimestamp(historyData.timestamp) : ((new Date(historyData.timestamp)).toLocaleString());
        info.appendChild(tt);
    } else {
        // 搜索历史/其它 (保持不变)
    }

    wrapper.appendChild(info);

    // 播放事件 --- ★★★ 这是需要修改的地方 ★★★ ---
    wrapper.addEventListener('click', () => {
        if (typeof onPlayCallback === 'function') {
            // 检查 historyData 是否有效，以及是否是观看历史类型
            if (historyData && type === 'viewing') {
                // 从 historyData 对象中提取所需的单个属性
                const url = historyData.url;
                const title = historyData.title || '未知标题'; // 提供默认标题
                const episodeIndex = historyData.episodeIndex; // 观看历史应该有这个
                const playbackPosition = historyData.playbackPosition || 0; // 提供默认播放位置
                const episodes = historyData.episodes || []; // 提供默认剧集列表

                // 检查关键信息是否存在
                if (typeof url !== 'string' || url.length < 5) {
                     console.error("History item has invalid URL:", historyData);
                     alert("无法播放：历史记录中的视频地址无效。");
                     return;
                }
                 if (typeof episodeIndex !== 'number' || isNaN(episodeIndex)) {
                     console.error("History item has invalid episode index:", historyData);
                     alert("无法播放：历史记录中的剧集索引无效。");
                     return;
                 }

                // 使用提取出的单个参数调用回调函数 (playFromHistory)
                onPlayCallback(url, title, episodeIndex, playbackPosition, episodes);
            } else if (historyData && type === 'search') {
                // 如果需要处理搜索历史的点击，在这里添加逻辑
                // 例如: onPlayCallback(historyData.text); // 假设回调处理搜索文本
                 console.log("Clicked on search history:", historyData.text);
            } else {
                 console.warn("Invalid history data or type for play callback:", historyData, type);
            }
        }
    });

    return wrapper;
}

// ========== 用于播放进度时间格式化 ==========
// 注意：这个函数在 ui.js 中也存在。建议只保留一个版本，
// 例如保留在 ui.js 中并导出，然后在这里导入使用，
// 或者创建一个单独的 utils.js 文件。
// 为了简单起见，暂时保留这里的副本。
function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    seconds = Math.max(0, seconds); // 确保秒数不为负
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 如果 formatTimestamp 也在这里用到且不在全局作用域，也需要定义或导入
// function formatTimestamp(timestamp) { ... } // 从 ui.js 复制或导入
