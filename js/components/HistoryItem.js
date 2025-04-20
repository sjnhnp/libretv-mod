// /js/components/HistoryItem.js

/**
 * historyData: 观看历史/搜索历史单项对象
 * type: 'viewing'|'search'
 * onPlayCallback: (historyData) => void
 * onDeleteCallback: (historyData) => void
 */
export function createHistoryItemElement(historyData, type, onPlayCallback, onDeleteCallback) {
    const wrapper = document.createElement('div');
    wrapper.className = 'history-item cursor-pointer relative group';
    // 删除按钮
    const btn = document.createElement('button');
    btn.className = 'absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10';
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
    // 标题
    const t = document.createElement('div');
    t.className = 'history-title';
    t.textContent = historyData.title;
    info.appendChild(t);

    // 元信息部分（观看历史）
    if (type === 'viewing') {
        const meta = document.createElement('div');
        meta.className = 'history-meta';

        if (historyData.episodeIndex !== undefined) {
            const ep = document.createElement('span');
            ep.className = 'history-episode';
            ep.textContent = `第${historyData.episodeIndex + 1}集`;
            meta.appendChild(ep);
            const sep = document.createElement('span');
            sep.className = 'history-separator mx-1';
            sep.textContent = '·';
            meta.appendChild(sep);
        }
        const source = document.createElement('span');
        source.className = 'history-source';
        source.textContent = historyData.sourceName || '未知来源';
        meta.appendChild(source);
        info.appendChild(meta);

        // 播放进度
        if (historyData.playbackPosition && historyData.duration && historyData.playbackPosition > 10 && historyData.playbackPosition < historyData.duration*0.95) {
            const percent = Math.round((historyData.playbackPosition / historyData.duration) * 100);
            const prog = document.createElement('div');
            prog.className = 'history-progress';
            prog.innerHTML = `<div class="progress-bar"><div class="progress-filled" style="width:${percent}%"></div></div>
                <div class="progress-text">${formatPlaybackTime(historyData.playbackPosition)} / ${formatPlaybackTime(historyData.duration)}</div>`;
            info.appendChild(prog);
        }
        // 时间戳
        const tt = document.createElement('div');
        tt.className = 'history-time';
        tt.textContent = window.formatTimestamp ? window.formatTimestamp(historyData.timestamp) :
            ((new Date(historyData.timestamp)).toLocaleString());
        info.appendChild(tt);
    } else {
        // 搜索历史/其它
        // 补充其它需要的渲染
    }

    wrapper.appendChild(info);

    // 播放事件
    wrapper.addEventListener('click', () => {
        if (typeof onPlayCallback === 'function') onPlayCallback(historyData);
    });

    return wrapper;
}

// ========== 用于播放进度时间格式化 ==========
function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
