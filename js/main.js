'use strict';

/* ==========================================================================
   博客主逻辑：主题切换、Markdown 渲染、文章列表、标签筛选、搜索、
   hash 路由、代码复制、回到顶部
   ========================================================================== */

/* ---------- 工具函数 ---------- */
const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- 主题切换 ---------- */
const THEME_KEY = 'theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
}

/* ---------- Markdown 渲染（轻量实现） ---------- */
function renderInline(text) {
  // 先按行内代码分段处理，再对其余文本应用加粗/斜体/链接
  const parts = String(text).split(/(`[^`]+`)/);
  return parts
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let t = escapeHtml(part);
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return t;
    })
    .join('');
}

function renderMarkdown(src) {
  const lines = String(src).split('\n');
  const out = [];
  let i = 0;

  const isFence = (s) => /^```/.test(s.trim());
  const isHead = (s) => /^#{1,4}\s/.test(s);
  const isQuote = (s) => /^>\s?/.test(s);
  const isUL = (s) => /^\s*[-*+]\s+/.test(s);
  const isOL = (s) => /^\s*\d+[.)]\s+/.test(s);

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (isFence(line)) {
      const lang = line.trim().slice(3).trim();
      i++;
      const buf = [];
      while (i < lines.length && !isFence(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束围栏
      const code = escapeHtml(buf.join('\n'));
      out.push(
        `<div class="code-wrap">` +
        `<pre class="code-block"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${code}</code></pre>` +
        `<button class="copy-btn" type="button">复制</button></div>`
      );
      continue;
    }

    // 标题
    if (isHead(line)) {
      const m = line.match(/^(#{1,4})\s+(.*)$/);
      const lvl = m[1].length;
      out.push(`<h${lvl}>${renderInline(m[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // 引用
    if (isQuote(line)) {
      const buf = [];
      while (i < lines.length && isQuote(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote><p>${renderInline(buf.join(' '))}</p></blockquote>`);
      continue;
    }

    // 无序列表
    if (isUL(line)) {
      const buf = [];
      while (i < lines.length && isUL(lines[i])) {
        buf.push(`<li>${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${buf.join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (isOL(line)) {
      const buf = [];
      while (i < lines.length && isOL(lines[i])) {
        buf.push(`<li>${renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${buf.join('')}</ol>`);
      continue;
    }

    // 空行
    if (line.trim() === '') { i++; continue; }

    // 普通段落
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isFence(lines[i]) && !isHead(lines[i]) && !isQuote(lines[i]) &&
      !isUL(lines[i]) && !isOL(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ---------- 状态与文章列表 ---------- */
const state = { tag: '全部', keyword: '' };

function uniqueTags() {
  const set = new Set();
  posts.forEach((p) => p.tags.forEach((t) => set.add(t)));
  return Array.from(set);
}

function renderTagFilters() {
  const tags = uniqueTags();
  const chips = ['全部', ...tags]
    .map((t) => `<button class="chip${state.tag === t ? ' active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
    .join('');
  $('#tag-filters').innerHTML = chips;
  $('#stat-tags').textContent = tags.length;
  $('#stat-posts').textContent = posts.length;
}

function filteredPosts() {
  const kw = state.keyword.trim().toLowerCase();
  return posts.filter((p) => {
    const matchTag = state.tag === '全部' || p.tags.includes(state.tag);
    const matchKw = !kw || [p.title, p.excerpt, ...p.tags].join(' ').toLowerCase().includes(kw);
    return matchTag && matchKw;
  });
}

function postCard(p) {
  return `
    <a href="#/post/${p.id}" class="post-card">
      <div class="post-card-top">
        <time class="post-date">${escapeHtml(p.date)}</time>
        <span class="post-read">${escapeHtml(p.readTime)} 阅读</span>
      </div>
      <h2 class="post-title">${escapeHtml(p.title)}</h2>
      <p class="post-excerpt">${escapeHtml(p.excerpt)}</p>
      <div class="post-tags">${p.tags.map((t) => `<span class="tag"># ${escapeHtml(t)}</span>`).join('')}</div>
    </a>`;
}

function renderList() {
  const list = filteredPosts();
  $('#post-list').innerHTML = list.map(postCard).join('');
  $('#empty-state').hidden = list.length > 0;
}

/* ---------- 视图与路由 ---------- */
function show(view) {
  ['view-home', 'view-post', 'view-about', 'view-archive'].forEach((id) => {
    $('#' + id).hidden = id !== view;
  });
  setActiveNav(view);
  window.scrollTo({ top: 0 });
}

function setActiveNav(view) {
  const map = { 'view-home': 'home', 'view-about': 'about', 'view-archive': 'archive' };
  document.querySelectorAll('.site-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === map[view]);
  });
}

function renderPost(id) {
  const post = posts.find((p) => String(p.id) === String(id));
  if (!post) { location.hash = '#/'; return; }
  document.title = `${post.title} · DevLog`;
  $('#post-content').innerHTML = `
    <div class="post-header">
      <h1 class="post-heading">${escapeHtml(post.title)}</h1>
      <div class="post-meta">
        <time>${escapeHtml(post.date)}</time>
        <span>·</span>
        <span>${escapeHtml(post.readTime)} 阅读</span>
      </div>
      <div class="post-tags">${post.tags.map((t) => `<a href="#/?tag=${encodeURIComponent(t)}" class="tag tag-link"># ${escapeHtml(t)}</a>`).join('')}</div>
    </div>
    <div class="post-body">${renderMarkdown(post.content)}</div>`;
}

function renderArchive() {
  const groups = {};
  posts.forEach((p) => {
    const key = p.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  const keys = Object.keys(groups).sort().reverse();
  const html = keys.map((k) => {
    const items = groups[k]
      .map((p) => `<a href="#/post/${p.id}" class="archive-item"><time>${escapeHtml(p.date)}</time><span>${escapeHtml(p.title)}</span></a>`)
      .join('');
    return `<section class="archive-group"><h2 class="archive-year">${escapeHtml(k)}</h2><div class="archive-items">${items}</div></section>`;
  }).join('');
  $('#archive-list').innerHTML = html;
}

function router() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/post/')) {
    renderPost(hash.slice('#/post/'.length));
    show('view-post');
  } else if (hash === '#about') {
    show('view-about');
    document.title = '关于 · DevLog';
  } else if (hash === '#archive') {
    renderArchive();
    show('view-archive');
    document.title = '归档 · DevLog';
  } else {
    show('view-home');
    document.title = 'DevLog · 个人技术博客';
    const m = hash.match(/[?&]tag=([^&]+)/);
    if (m) {
      state.tag = decodeURIComponent(m[1]);
      renderTagFilters();
    }
    renderList();
  }
}

/* ---------- 事件绑定 ---------- */
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
  document.body.removeChild(ta);
}

function bindEvents() {
  $('#theme-toggle').addEventListener('click', toggleTheme);

  $('#tag-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.tag = chip.dataset.tag;
    renderTagFilters();
    renderList();
  });

  $('#search-input').addEventListener('input', (e) => {
    state.keyword = e.target.value;
    renderList();
  });

  $('#back-btn').addEventListener('click', () => { location.hash = '#/'; });

  // 代码复制（事件委托）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const code = btn.parentElement.querySelector('code').innerText;
    const done = () => {
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
    } else {
      fallbackCopy(code, done);
    }
  });

  // 回到顶部
  const toTop = $('#back-to-top');
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('show', window.scrollY > 400);
  });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  window.addEventListener('hashchange', router);
}

/* ---------- 启动 ---------- */
initTheme();
renderTagFilters();
bindEvents();
router();
