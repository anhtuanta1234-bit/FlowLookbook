// Chrome thật với profile riêng + cổng điều khiển (CDP), nối Playwright vào.
// Chạy NGẦM: cửa sổ thu nhỏ, các tab mở ở nền; chỉ hiện cửa sổ khi bạn bấm "Đăng nhập Flow" / "Xem cửa sổ Flow".
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');
const cfg = require('./config');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  const c = cfg.get();
  if (c.chromePath && fs.existsSync(c.chromePath)) return c.chromePath;
  return CHROME_CANDIDATES.find((p) => p && fs.existsSync(p));
}

function httpJson(port, p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 1500 }, (res) => {
      let d = ''; res.on('data', (x) => (d += x));
      res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(d) : null); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
const pingCdp = async (port) => !!(await httpJson(port, '/json/version'));

let browser = null;
let starting = null;
let chromePid = null; // PID của process Chrome mà tool đã spawn

// visible=true chỉ khi người dùng chủ động mở để đăng nhập; còn lại Chrome khởi động ở dạng thu nhỏ.
function ensureBrowser({ visible = false } = {}) {
  if (browser && browser.isConnected()) return Promise.resolve(browser);
  if (starting) return starting;
  starting = (async () => {
    const c = cfg.get();
    if (!(await pingCdp(c.cdpPort))) {
      const exe = findChrome();
      if (!exe) throw new Error('Không tìm thấy Chrome. Hãy cài Google Chrome hoặc điền đường dẫn trong Cài đặt > Nâng cao.');
      const profile = path.join(cfg.dataDir, 'chrome-profile');
      fs.mkdirSync(profile, { recursive: true });
      const args = [
        `--remote-debugging-port=${c.cdpPort}`,
        `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check',
        '--window-size=1280,900',
        // giữ trang chạy bình thường khi cửa sổ bị thu nhỏ / che khuất (nếu không Chrome sẽ làm chậm trang ẩn)
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion',
      ];
      if (!visible) args.push('--start-minimized');
      args.push('https://flow.google.com/');
      const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
      chromePid = child.pid;
      child.unref();
      for (let i = 0; i < 40; i++) { if (await pingCdp(c.cdpPort)) break; await new Promise((r) => setTimeout(r, 500)); }
      if (!(await pingCdp(c.cdpPort))) throw new Error('Chrome không mở được cổng điều khiển.');
    }
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${c.cdpPort}`);
    browser.on('disconnected', () => { browser = null; });
    return browser;
  })();
  const done = () => { starting = null; };
  starting.then(done, done);
  return starting;
}

async function getContext() {
  const b = await ensureBrowser();
  return b.contexts()[0] || (await b.newContext());
}

// ---------- ẩn / hiện cửa sổ ----------
async function setWindowState(state) {
  const b = await ensureBrowser();
  const targets = ((await httpJson(cfg.get().cdpPort, '/json/list')) || []).filter((t) => t.type === 'page');
  const s = await b.newBrowserCDPSession();
  try {
    const ids = new Set();
    for (const t of targets) { try { ids.add((await s.send('Browser.getWindowForTarget', { targetId: t.id })).windowId); } catch (_) {} }
    for (const windowId of ids) await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } });
    return ids.size;
  } finally { await s.detach().catch(() => {}); }
}
const hideWindow = () => setWindowState('minimized');
async function showWindow() {
  await setWindowState('normal');
  const ctx = await getContext();
  const pg = ctx.pages()[0]; if (pg) await pg.bringToFront().catch(() => {});
}

// ---------- tab mới ở NỀN (không bật cửa sổ lên) ----------
let createChain = Promise.resolve();
let openPages = 0;
const maxTabs = () => cfg.get().maxChromeTabs || 12;
function newBackgroundPage() {
  const run = async () => {
    // Chờ nếu đã mở đủ số tab tối đa để tránh hết RAM.
    while (openPages >= maxTabs()) { await new Promise((r) => setTimeout(r, 500)); }
    openPages++;
    const b = await ensureBrowser();
    const ctx = b.contexts()[0] || (await b.newContext());
    try {
      const s = await b.newBrowserCDPSession();
      try {
        const waiter = ctx.waitForEvent('page', { timeout: 10000 });
        await s.send('Target.createTarget', { url: 'about:blank', background: true });
        return await waiter;
      } finally { await s.detach().catch(() => {}); }
    } catch (_) { return ctx.newPage(); }
    finally { /* decrement when page closes */ }
  };
  // tạo từng tab một để hai tab song song không nhận nhầm của nhau
  const r = createChain.then(run, run);
  createChain = r.catch(() => {});
  // Theo dõi số tab đang mở: giảm khi tab bị đóng.
  r.then((page) => {
    page.on('close', () => { openPages = Math.max(0, openPages - 1); });
  }).catch(() => { openPages = Math.max(0, openPages - 1); });
  return r;
}

// Chrome của tool có đang mở sẵn không (không tự mở thêm nếu chưa chạy).
const isRunning = () => pingCdp(cfg.get().cdpPort);

// Kill toàn bộ cây process (process cha + các process con) theo PID.
function killTree(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/T', '/F', '/PID', String(pid)], () => resolve());
  });
}

// Tìm các process chrome.exe của tool (dùng profile riêng hoặc cổng CDP của tool).
// Trả về mảng PID.
function findToolChromePids() {
  return new Promise((resolve) => {
    const port = cfg.get().cdpPort;
    const profile = path.join(cfg.dataDir, 'chrome-profile').replace(/'/g, "''");
    const ps = `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' -or $_.CommandLine -like '*${profile}*' } | Select-Object -ExpandProperty ProcessId`;
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], (err, stdout) => {
      if (err) return resolve([]);
      const ids = String(stdout).split(/\s+/).map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
      resolve([...new Set(ids)]);
    });
  });
}

// Đóng toàn bộ cửa sổ Chrome mà tool đang điều khiển (ngắt kết nối).
// - Đóng tất cả trang/tab dự án đang mở
// - Kill toàn bộ cây process Chrome của tool (cả cha lẫn con)
async function close() {
  // 1. Đóng tất cả trang đang mở qua Playwright (tắt các tab dự án làm ảnh)
  if (browser) {
    try {
      for (const ctx of browser.contexts()) {
        for (const pg of ctx.pages()) { await pg.close().catch(() => {}); }
      }
    } catch (_) {}
    try { await browser.close(); } catch (_) {}
    browser = null;
  }
  starting = null;

  // 2. Kill process Chrome của tool
  const killed = new Set();
  if (chromePid) { await killTree(chromePid); killed.add(chromePid); chromePid = null; }
  // Đảm bảo không sót process nào (kể cả khi Chrome được mở từ trước, không có PID lưu)
  const leftovers = await findToolChromePids();
  for (const pid of leftovers) {
    if (!killed.has(pid)) { await killTree(pid); killed.add(pid); }
  }
}

module.exports = { ensureBrowser, getContext, findChrome, hideWindow, showWindow, newBackgroundPage, isRunning, close };
