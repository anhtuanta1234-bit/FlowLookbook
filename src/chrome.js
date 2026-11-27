// Chrome thật với profile riêng + cổng điều khiển (CDP), nối Playwright vào.
// Flow và Firefly MỖI BẾN 1 process/profile/cổng riêng: đổi Gmail Firefly không đụng session Google của Flow.
// Chạy NGẦM: cửa sổ thu nhỏ, các tab mở ở nền; chỉ hiện cửa sổ khi người dùng chủ động đăng nhập/xem.
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
const FLOW_HOME = 'https://flow.google.com/';
const FIREFLY_HOME = 'https://firefly.adobe.com/';

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

function killTree(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/T', '/F', '/PID', String(pid)], () => resolve());
  });
}

// Lần đầu tách Firefly: kế thừa đăng nhập từ profile cũ (Chrome đang đóng mới copy được).
// Copies chứa cookie Adobe đã đăng nhập; sau đó 2 profile phát triển riêng, đổi Gmail Firefly
// không đụng session Google của Flow.
function seedProfile(dir, seedFrom) {
  if (!seedFrom || fs.existsSync(dir)) return;
  const src = path.join(cfg.dataDir, seedFrom);
  if (!fs.existsSync(src)) return;
  try { fs.cpSync(src, dir, { recursive: true }); } catch (_) {}
}

// Tạo một bộ Chrome độc lập. Flow và Firefly truyền cổng/profile/trang mở đầu khác nhau.
function createChrome({ getPort, profileName, startUrl, seedFrom, minWindow, maximized }) {
  let browser = null;
  let starting = null;
  let chromePid = null; // PID của process Chrome mà bộ này đã spawn

  const port = () => Math.max(1, Number(getPort()) || 9333);
  const profile = () => path.join(cfg.dataDir, profileName);

  // visible=true chỉ khi người dùng chủ động mở để đăng nhập. Bộ maximized (Firefly) luôn full màn hình,
  // kể cả khi chạy ngầm — chỉ khác là không đẩy cửa sổ lên trước app.
  function ensureBrowser({ visible = false } = {}) {
    if (browser && browser.isConnected()) return Promise.resolve(browser);
    if (starting) return starting;
    starting = (async () => {
      const p = port();
      if (!(await pingCdp(p))) {
        const exe = findChrome();
        if (!exe) throw new Error('Không tìm thấy Chrome. Hãy cài Google Chrome hoặc điền đường dẫn trong Cài đặt > Nâng cao.');
        const dir = profile();
        seedProfile(dir, seedFrom); // copy profile cũ trước khi Chrome khởi động
        fs.mkdirSync(dir, { recursive: true });
        const args = [
          `--remote-debugging-port=${p}`,
          `--user-data-dir=${dir}`,
          '--no-first-run', '--no-default-browser-check', '--disable-fre', '--disable-search-engine-choice-screen',
          // Firefly mở sẵn full màn hình để canvas không co, chấm logo không lệch. Flow giữ cỡ cũ.
          ...(maximized ? ['--start-maximized'] : ['--window-position=60,60', '--window-size=1000,700']),
          // giữ trang chạy bình thường khi cửa sổ bị che khuất (nếu không Chrome sẽ làm chậm trang ẩn)
          '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
          '--disable-features=CalculateNativeWinOcclusion',
        ];
        // Chạy ngầm = không đẩy cửa sổ lên, KHÔNG thu nhỏ (thu nhỏ làm canvas Firefly co lại).
        if (!visible && !maximized) args.push('--start-minimized');
        args.push(startUrl);
        const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
        chromePid = child.pid;
        child.unref();
        for (let i = 0; i < 40; i++) { if (await pingCdp(p)) break; await new Promise((r) => setTimeout(r, 500)); }
        if (!(await pingCdp(p))) throw new Error('Chrome không mở được cổng điều khiển.');
      }
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${p}`);
      browser.on('disconnected', () => { browser = null; });
      // Firefly khởi động trong automation thì đẩy ra ngoài màn hình NGAY, không để ló lên dù 1 giây.
      if (maximized && !visible) await setOffscreen(browser).catch(() => {});
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

  // ---------- ẩn / hiện cửa sổ (chỉ của bộ này) ----------
  async function setWindowState(state) {
    const b = await ensureBrowser();
    const targets = ((await httpJson(port(), '/json/list')) || []).filter((t) => t.type === 'page');
    const s = await b.newBrowserCDPSession();
    try {
      const ids = new Set();
      for (const t of targets) { try { ids.add((await s.send('Browser.getWindowForTarget', { targetId: t.id })).windowId); } catch (_) {} }
      for (const windowId of ids) await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } });
      return ids.size;
    } finally { await s.detach().catch(() => {}); }
  }
  // Firefly: đưa mọi cửa sổ về MAXIMIZED (khi người dùng chủ động mở/kiểm tra).
  // Chỉ gửi lệnh khi cửa sổ chưa full màn hình để không xáo trộn z-order lúc automation đang chạy.
  async function setMaximized() {
    const b = await ensureBrowser();
    const targets = ((await httpJson(port(), '/json/list')) || []).filter((t) => t.type === 'page');
    const s = await b.newBrowserCDPSession();
    try {
      const ids = new Set();
      for (const t of targets) { try { ids.add((await s.send('Browser.getWindowForTarget', { targetId: t.id })).windowId); } catch (_) {} }
      for (const windowId of ids) {
        try {
          const cur = (await s.send('Browser.getWindowBounds', { windowId })).bounds || {};
          if (cur.windowState !== 'maximized') await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
        } catch (_) {}
      }
      return ids.size;
    } finally { await s.detach().catch(() => {}); }
  }
  // Khi chạy automation: DỜI cửa sổ Firefly RA NGOÀI màn hình, không thu nhỏ.
  // Vẫn cấp đúng kích thước màn hình nên canvas không co, chấm logo không lệch; người dùng chỉ thấy app.
  // Nhận browser có sẵn để gọi ngay lúc khởi động, không gọi lại ensureBrowser() (tránh chờ chính nó).
  async function setOffscreen(b = null) {
    b = b || await ensureBrowser();
    const ctx = b.contexts()[0] || (await b.newContext());
    let sw = 1920, sh = 1080;
    try {
      const pg = ctx.pages()[0];
      if (pg) {
        const dim = await pg.evaluate(() => ({ w: screen.width || 1920, h: screen.height || 1080 }));
        sw = dim.w || sw; sh = dim.h || sh;
      }
    } catch (_) {}
    const targets = ((await httpJson(port(), '/json/list')) || []).filter((t) => t.type === 'page');
    const s = await b.newBrowserCDPSession();
    try {
      const ids = new Set();
      for (const t of targets) { try { ids.add((await s.send('Browser.getWindowForTarget', { targetId: t.id })).windowId); } catch (_) {} }
      for (const windowId of ids) {
        try {
          const cur = (await s.send('Browser.getWindowBounds', { windowId })).bounds || {};
          if (cur.windowState === 'normal' && (cur.left || 0) <= -sw) continue; // đã ở ngoài màn hình
          const width = Math.max(cur.width || 0, sw);
          const height = Math.max(cur.height || 0, sh);
          await s.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'normal', left: -width - 40, top: -height - 40, width, height },
          });
        } catch (_) {}
      }
      return ids.size;
    } finally { await s.detach().catch(() => {}); }
  }
  // “Ẩn” với Firefly = dời ra ngoài màn hình (vẫn full size); Flow thì thu nhỏ như cũ.
  const hideWindow = () => (maximized ? setOffscreen() : setWindowState('minimized'));
  async function showWindow() {
    if (maximized) await setMaximized();
    else await setWindowState('normal');
    // Firefly cần cửa sổ đủ lớn: bị thu nhỏ thì canvas mask co lại, dễ chấm nhầm canvas nền.
    if (minWindow && !maximized) {
      try {
        const b = await ensureBrowser();
        const targets = ((await httpJson(port(), '/json/list')) || []).filter((t) => t.type === 'page');
        const s = await b.newBrowserCDPSession();
        try {
          const ids = new Set();
          for (const t of targets) {
            try { ids.add((await s.send('Browser.getWindowForTarget', { targetId: t.id })).windowId); } catch (_) {}
          }
          for (const windowId of ids) {
            try {
              const cur = (await s.send('Browser.getWindowBounds', { windowId })).bounds || {};
              if ((cur.width || 0) < minWindow.width || (cur.height || 0) < minWindow.height) {
                await s.send('Browser.setWindowBounds', {
                  windowId,
                  bounds: {
                    left: minWindow.left ?? cur.left,
                    top: minWindow.top ?? cur.top,
                    width: Math.max(cur.width || 0, minWindow.width),
                    height: Math.max(cur.height || 0, minWindow.height),
                  },
                });
              }
            } catch (_) {}
          }
        } finally { await s.detach().catch(() => {}); }
      } catch (_) {}
    }
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

  const isRunning = () => pingCdp(port());

  // Tìm process Chrome CỦA BỘ NÀY (theo cổng hoặc profile riêng) — không đụng Chrome của bộ kia.
  function findToolChromePids() {
    return new Promise((resolve) => {
      const p = port();
      const dir = profile().replace(/'/g, "''");
      const ps = `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${p}*' -or $_.CommandLine -like '*${dir}*' } | Select-Object -ExpandProperty ProcessId`;
      execFile('powershell.exe', ['-NoProfile', '-Command', ps], (err, stdout) => {
        if (err) return resolve([]);
        const ids = String(stdout).split(/\s+/).map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
        resolve([...new Set(ids)]);
      });
    });
  }

  // Đóng toàn bộ cửa sổ Chrome của bộ này (tab dự án, tab Firefly, tiến trình CDP).
  async function close() {
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
    const killed = new Set();
    if (chromePid) { await killTree(chromePid); killed.add(chromePid); chromePid = null; }
    const leftovers = await findToolChromePids();
    for (const pid of leftovers) {
      if (!killed.has(pid)) { await killTree(pid); killed.add(pid); }
    }
  }

  return { ensureBrowser, getContext, findChrome, hideWindow, showWindow, newBackgroundPage, isRunning, findToolChromePids, close };
}

const flowChrome = createChrome({
  getPort: () => cfg.get().cdpPort,
  profileName: 'chrome-profile',
  startUrl: FLOW_HOME,
});

const fireflyChrome = createChrome({
  getPort: () => {
    const c = cfg.get();
    const flow = Number(c.cdpPort) || 9333;
    const ff = Number(c.fireflyCdpPort) || flow + 1;
    return ff === flow ? flow + 1 : ff; // lỡ cấu hình trùng cổng thì tự lệch đi 1
  },
  profileName: 'chrome-firefly-profile',
  startUrl: FIREFLY_HOME,
  seedFrom: 'chrome-profile', // giữ đăng nhập Firefly sau khi tách Chrome
  // LUÔN full màn hình (kể cả lúc chạy ngầm) để canvas mask to, chấm logo đúng chỗ.
  // “Ngầm” ở đây = không bringToFront, không che app đang dùng.
  maximized: true,
});

module.exports = {
  ...flowChrome,
  createChrome,
  flow: flowChrome,
  firefly: fireflyChrome,
  closeAll: async () => { await Promise.allSettled([flowChrome.close(), fireflyChrome.close()]); },
};
