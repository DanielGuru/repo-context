import chalk from "chalk";
import { createServer } from "http";
import { exec } from "child_process";
import { loadConfig } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";

export async function dashboardCommand(options: { dir?: string; port?: string }) {
  const repoRoot = options.dir || process.cwd();
  const port = parseInt(options.port || "3333");
  const config = loadConfig(repoRoot);
  const store = new ContextStore(repoRoot, config);

  if (!store.exists()) {
    console.log(chalk.red("\u2717 No .context/ directory found. Run `repomemory init` first."));
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // API: return JSON data
    if (url.pathname === "/api/entries") {
      const category = url.searchParams.get("category") || undefined;
      const entries = store.listEntries(category);
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(entries.map((e) => ({
        category: e.category,
        filename: e.filename,
        title: e.title,
        content: e.content,
        relativePath: e.relativePath,
        lastModified: e.lastModified.toISOString(),
        sizeBytes: e.sizeBytes,
      }))));
      return;
    }

    if (url.pathname === "/api/stats") {
      const stats = store.getStats();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (url.pathname === "/api/index") {
      const content = store.readIndex();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ content }));
      return;
    }

    // Serve the SPA
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(buildDashboardHTML(config.provider, config.model));
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(chalk.bold(`\n\ud83c\udf10 repomemory dashboard\n`));
    console.log(`  ${chalk.cyan("URL:")} ${chalk.underline(url)}`);
    console.log(`  ${chalk.cyan("Root:")} ${repoRoot}`);
    console.log(chalk.dim(`\n  Press Ctrl+C to stop.\n`));

    // Try to open browser
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${cmd} ${url}`, () => {}); // Silently fail if can't open
  });

  // Graceful shutdown
  process.on("SIGTERM", () => { server.close(); process.exit(0); });
  process.on("SIGINT", () => { server.close(); process.exit(0); });
}

function buildDashboardHTML(provider: string, model: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>repomemory dashboard</title>
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a26;
    --border: #2a2a3a;
    --text: #e4e4ef;
    --text-dim: #7a7a8f;
    --accent: #58a6ff;
    --accent2: #39d353;
    --warn: #f0b040;
    --danger: #f85149;
    --purple: #bc8cff;
    --radius: 12px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  .header {
    border-bottom: 1px solid var(--border);
    padding: 20px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    backdrop-filter: blur(12px);
    background: rgba(10, 10, 15, 0.8);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header h1 {
    font-size: 20px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header h1 .logo {
    background: linear-gradient(135deg, var(--accent), var(--purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .header .meta {
    color: var(--text-dim);
    font-size: 13px;
  }

  .search-bar {
    margin: 24px 32px;
    position: relative;
  }

  .search-bar input {
    width: 100%;
    padding: 14px 20px 14px 44px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-bar input:focus {
    border-color: var(--accent);
  }

  .search-bar .icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    padding: 0 32px 24px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    text-align: center;
  }

  .stat-card .value {
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
  }

  .stat-card .label {
    font-size: 12px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .main {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 0;
    min-height: calc(100vh - 200px);
  }

  .sidebar {
    border-right: 1px solid var(--border);
    padding: 20px 0;
  }

  .sidebar .cat-btn {
    display: block;
    width: 100%;
    padding: 10px 24px;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    border-left: 3px solid transparent;
  }

  .sidebar .cat-btn:hover {
    background: var(--surface);
    color: var(--text);
  }

  .sidebar .cat-btn.active {
    background: var(--surface);
    color: var(--accent);
    border-left-color: var(--accent);
    font-weight: 600;
  }

  .sidebar .cat-btn .count {
    float: right;
    background: var(--surface2);
    color: var(--text-dim);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
  }

  .content {
    padding: 20px 32px;
  }

  .entry-grid {
    display: grid;
    gap: 12px;
  }

  .entry-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .entry-card:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .entry-card .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .entry-card .card-title {
    font-weight: 600;
    font-size: 15px;
  }

  .entry-card .card-meta {
    color: var(--text-dim);
    font-size: 12px;
    display: flex;
    gap: 12px;
  }

  .entry-card .card-category {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .cat-facts { background: rgba(88, 166, 255, 0.15); color: var(--accent); }
  .cat-decisions { background: rgba(188, 140, 255, 0.15); color: var(--purple); }
  .cat-regressions { background: rgba(248, 81, 73, 0.15); color: var(--danger); }
  .cat-sessions { background: rgba(57, 211, 83, 0.15); color: var(--accent2); }
  .cat-changelog { background: rgba(240, 176, 64, 0.15); color: var(--warn); }

  .entry-card .preview {
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1.5;
    max-height: 3em;
    overflow: hidden;
    margin-top: 8px;
  }

  /* Detail view (modal-style) */
  .detail-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 100;
    backdrop-filter: blur(4px);
  }

  .detail-overlay.visible { display: flex; justify-content: center; align-items: flex-start; padding: 60px 40px; }

  .detail-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-width: 800px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    padding: 32px;
  }

  .detail-panel .close-btn {
    float: right;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 24px;
    cursor: pointer;
    padding: 0 8px;
  }

  .detail-panel .close-btn:hover { color: var(--text); }

  .detail-panel h2 { font-size: 20px; margin-bottom: 8px; }

  .detail-panel .md-content {
    font-size: 14px;
    line-height: 1.8;
    color: var(--text);
  }

  .detail-panel .md-content h1 { font-size: 22px; color: var(--accent); margin: 24px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .detail-panel .md-content h2 { font-size: 18px; color: var(--accent); margin: 20px 0 10px; }
  .detail-panel .md-content h3 { font-size: 15px; color: var(--purple); margin: 16px 0 8px; }
  .detail-panel .md-content p { margin: 8px 0; }
  .detail-panel .md-content ul, .detail-panel .md-content ol { margin: 8px 0; padding-left: 24px; }
  .detail-panel .md-content li { margin: 4px 0; }
  .detail-panel .md-content code {
    background: var(--surface2); padding: 2px 6px; border-radius: 4px;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace; font-size: 13px;
  }
  .detail-panel .md-content pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; overflow-x: auto; margin: 12px 0;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; line-height: 1.5;
  }
  .detail-panel .md-content pre code { background: none; padding: 0; }
  .detail-panel .md-content strong { color: var(--text); font-weight: 600; }
  .detail-panel .md-content blockquote {
    border-left: 3px solid var(--accent); padding-left: 16px; margin: 12px 0;
    color: var(--text-dim); font-style: italic;
  }
  .detail-panel .md-content hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

  .empty {
    text-align: center;
    color: var(--text-dim);
    padding: 60px;
    font-size: 15px;
  }

  @media (max-width: 768px) {
    .main { grid-template-columns: 1fr; }
    .sidebar { display: flex; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 0; }
    .sidebar .cat-btn { border-left: none; border-bottom: 3px solid transparent; white-space: nowrap; }
    .sidebar .cat-btn.active { border-left: none; border-bottom-color: var(--accent); }
    .content { padding: 16px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1><span class="logo">\u25c9 repomemory</span> <span style="color:var(--text-dim);font-weight:400;font-size:14px">dashboard</span></h1>
  <div class="meta">${provider} \u00b7 ${model}</div>
</div>

<div class="search-bar">
  <span class="icon">\ud83d\udd0d</span>
  <input type="text" placeholder="Search context files..." id="searchInput" />
</div>

<div class="stats-row" id="statsRow"></div>

<div class="main">
  <div class="sidebar" id="sidebar"></div>
  <div class="content" id="content"></div>
</div>

<div class="detail-overlay" id="detailOverlay">
  <div class="detail-panel" id="detailPanel">
    <button class="close-btn" onclick="closeDetail()">\u00d7</button>
    <h2 id="detailTitle"></h2>
    <div class="card-meta" id="detailMeta" style="margin-bottom:16px"></div>
    <div class="md-content" id="detailContent"></div>
  </div>
</div>

<script>
let allEntries = [];
let currentCategory = null;

async function init() {
  const [entries, stats] = await Promise.all([
    fetch('/api/entries').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
  ]);
  allEntries = entries;

  // Stats
  const row = document.getElementById('statsRow');
  row.innerHTML = \`
    <div class="stat-card"><div class="value">\${stats.totalFiles}</div><div class="label">Files</div></div>
    <div class="stat-card"><div class="value">\${(stats.totalSize / 1024).toFixed(1)}KB</div><div class="label">Total Size</div></div>
    <div class="stat-card"><div class="value">\${Object.keys(stats.categories).length}</div><div class="label">Categories</div></div>
    <div class="stat-card"><div class="value">\${stats.stalestFile ? timeAgo(stats.stalestFile.age) : '-'}</div><div class="label">Stalest Entry</div></div>
  \`;

  // Sidebar
  renderSidebar(stats.categories);
  renderEntries(allEntries);
}

function renderSidebar(categories) {
  const sb = document.getElementById('sidebar');
  let html = '<button class="cat-btn active" onclick="filterCategory(null, this)">All <span class="count">' + allEntries.length + '</span></button>';
  for (const [cat, count] of Object.entries(categories)) {
    html += \`<button class="cat-btn" onclick="filterCategory('\${cat}', this)">\${cat}/ <span class="count">\${count}</span></button>\`;
  }
  sb.innerHTML = html;
}

function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allEntries.filter(e => {
    if (cat && e.category !== cat) return false;
    if (q && !e.title.toLowerCase().includes(q) && !e.content.toLowerCase().includes(q) && !e.filename.toLowerCase().includes(q)) return false;
    return true;
  });
  renderEntries(filtered);
}

function renderEntries(entries) {
  const content = document.getElementById('content');
  if (!entries.length) {
    content.innerHTML = '<div class="empty">No entries found. Run <code>repomemory analyze</code> to generate context.</div>';
    return;
  }

  content.innerHTML = '<div class="entry-grid">' + entries.map((e, i) => \`
    <div class="entry-card" onclick="showDetail(\${i})">
      <div class="card-header">
        <div class="card-title">\${escapeHtml(e.title)}</div>
        <span class="card-category cat-\${e.category}">\${e.category}</span>
      </div>
      <div class="card-meta">
        <span>\${e.filename}</span>
        <span>\${(e.sizeBytes / 1024).toFixed(1)}KB</span>
        <span>\${timeAgo(Date.now() - new Date(e.lastModified).getTime())}</span>
      </div>
      <div class="preview">\${escapeHtml(e.content.slice(0, 200))}</div>
    </div>
  \`).join('') + '</div>';
}

function showDetail(index) {
  const filtered = getFilteredEntries();
  const e = filtered[index];
  if (!e) return;

  document.getElementById('detailTitle').textContent = e.category + '/' + e.filename;
  document.getElementById('detailMeta').innerHTML = \`<span>\${e.title}</span> &middot; <span>\${(e.sizeBytes/1024).toFixed(1)}KB</span> &middot; <span>\${timeAgo(Date.now() - new Date(e.lastModified).getTime())}</span>\`;
  document.getElementById('detailContent').innerHTML = renderMarkdown(e.content);
  document.getElementById('detailOverlay').classList.add('visible');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('visible');
}

function getFilteredEntries() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  return allEntries.filter(e => {
    if (currentCategory && e.category !== currentCategory) return false;
    if (q && !e.title.toLowerCase().includes(q) && !e.content.toLowerCase().includes(q) && !e.filename.toLowerCase().includes(q)) return false;
    return true;
  });
}

document.getElementById('searchInput').addEventListener('input', () => {
  filterCategory(currentCategory, document.querySelector('.cat-btn.active'));
});

document.getElementById('detailOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDetail();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(md) {
  var html = escapeHtml(md);
  var BT = String.fromCharCode(96);
  var codeBlockRe = new RegExp(BT+BT+BT+'(\\\\w*)?\\\\n([\\\\s\\\\S]*?)'+BT+BT+BT, 'g');
  html = html.replace(codeBlockRe, function(_, lang, code) {
    return '<pre><code>' + code.trim() + '</code></pre>';
  });
  var inlineCodeRe = new RegExp(BT+'([^'+BT+']+)'+BT, 'g');
  html = html.replace(inlineCodeRe, '<code>\$1</code>');
  html = html.replace(/^### (.+)\$/gm, '<h3>\$1</h3>');
  html = html.replace(/^## (.+)\$/gm, '<h2>\$1</h2>');
  html = html.replace(/^# (.+)\$/gm, '<h1>\$1</h1>');
  html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>\$1</strong>');
  html = html.replace(/\\*([^*]+)\\*/g, '<em>\$1</em>');
  html = html.replace(/^&gt; (.+)\$/gm, '<blockquote>\$1</blockquote>');
  html = html.replace(/^---\$/gm, '<hr>');
  html = html.replace(/^- (.+)\$/gm, '<li>\$1</li>');
  html = html.replace(/((<li>.*<\\/li>)\\n?)+/g, function(m) { return '<ul>' + m + '</ul>'; });
  html = html.replace(/^\\d+\\. (.+)\$/gm, '<li>\$1</li>');
  html = html.replace(/\\n\\n(?!<)/g, '</p><p>');
  html = html.replace(/\\n(?!<)/g, '<br>');
  return '<p>' + html + '</p>';
}

function timeAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  const d = Math.floor(s / 86400);
  if (d < 30) return d + 'd ago';
  if (d < 365) return Math.floor(d/30) + 'mo ago';
  return Math.floor(d/365) + 'y ago';
}

init();
</script>
</body>
</html>`;
}
