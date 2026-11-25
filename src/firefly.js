// Adobe Firefly logo removal automation via existing Chrome CDP profile (shared with Flow).
// UI selectors are centralized here because Firefly changes frequently.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const chrome = require('./chrome');
const { imageDimensions } = require('./image');

const DEFAULT_HOME = 'https://firefly.adobe.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFireflyUrl = (url) => /^https:\/\/firefly\.adobe\.com(?:\/|$)/i.test(String(url || ''));
const isLoginUrl = (url) => /adobeid|auth\.services\.adobe|ims\.na1\.adobelogin/i.test(String(url || ''));

// Firefly đổi giao diện khá thường xuyên: gom hết locator về đây, có nhiều phương án dự phòng.
// Giao diện thật dùng <sp-menu-item role="menuitem"> cho mục điều hướng, không phải button/link thường.
const L = {
  imagesNav: (p) => p.getByRole('menuitem', { name: /^Hình ảnh$|^Images$/i }).first(),
  imagesNavLegacy: (p) => p.getByRole('button', { name: /Hình ảnh|Images/i }).first(),
  imagesNavLink: (p) => p.getByRole('link', { name: /Hình ảnh|Images/i }).first(),
  imagesNavText: (p) => p.locator('sp-menu-item[href="/images"]').first(),
  editImage: (p) => p.getByRole('menuitem', { name: /Chỉnh sửa hình ảnh|Edit image/i }).first(),
  editImageLegacy: (p) => p.getByRole('button', { name: /Chỉnh sửa hình ảnh|Edit image/i }).first(),
  editImageLink: (p) => p.getByRole('link', { name: /Chỉnh sửa hình ảnh|Edit image/i }).first(),
  // Trên giao diện thật đây là <sp-menu-item data-testid="ash-nav-ash-home-image-edit" href="/image-editor">.
  editImageText: (p) => p.locator('sp-menu-item[href="/image-editor"]').first(),
  // Firefly hiện ghi "Tải lên"; bản cũ là "Tải ảnh lên". Nhận cả hai (kể cả trong shadow DOM).
  uploadBtn: (p) => p.getByRole('button', { name: /Tải ảnh lên|Tải lên|Upload image|Upload|Chọn ảnh|Choose file/i }).first(),
  uploadBtnText: (p) => p.getByText(/^Tải lên$|Tải ảnh lên|Upload image|Choose file/i).first(),
  uploadInput: (p) => p.locator('input[type="file"]').first(),
  removeObject: (p) => p.getByRole('button', { name: /Chấm sửa và xóa|Remove object|Generative remove|Xóa đối tượng/i }).first(),
  removeObjectText: (p) => p.getByText(/Chấm sửa và xóa|Generative remove|Xóa đối tượng/i).first(),
  brushSize: (p) => p.getByRole('slider', { name: /Kích thước cọ|Brush size|Size/i }).first(),
  brushSizeInput: (p) => p.locator('input[type="range"]').first(),
  // Nút xác nhận trên bản hiện tại là "Áp dụng", bản cũ là "Xóa"/"Remove".
  removeBtn: (p) => p.getByRole('button', { name: /^(?:Xóa|Remove|Áp dụng|Apply)$/i }).first(),
  removeBtnText: (p) => p.getByText(/^(?:Xóa|Remove|Áp dụng|Apply)$/i).first(),
  downloadBtn: (p) => p.getByRole('button', { name: /Tải xuống|Download/i }).first(),
};

// Firefly vẫn giữ banner "hết lượt" trên trang kết quả dù ảnh hiện tại ĐÃ tạo xong.
// Nếu nút Tải xuống dùng được thì ảnh này là ảnh đã làm xong → ưu tiên tải,
// không được đánh dấu hết lượt rồi tạo lại từ đầu khi đổi Gmail.
async function downloadReady(page) {
  const btn = L.downloadBtn(page);
  return (await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => true));
}

// Toàn bộ giao diện Firefly nằm trong shadow DOM của <firefly-home-app>/<firefly-ash-shell>.
// document.querySelector() thường KHÔNG thấy các nút đó → phải đi qua shadowRoot.
const readPageState = (page) => page.evaluate(() => {
  const visited = new Set();
  const all = [];
  const walk = (root, depth) => {
    if (!root || depth > 10) return;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot && !visited.has(el.shadowRoot)) {
        visited.add(el.shadowRoot);
        walk(el.shadowRoot, depth + 1);
      }
      all.push(el);
    }
  };
  walk(document, 0);
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const enabled = (el) => el.disabled !== true && el.getAttribute('aria-disabled') !== 'true';
  const active = all.filter((el) => (
    /^(?:BUTTON|A|SP-ACTION-BUTTON|SP-BUTTON)$/.test(el.tagName) || /button|menuitem/i.test(el.getAttribute('role') || '')
  )).filter((el) => visible(el) && enabled(el));
  const deepText = all.filter((el) => !/^(?:SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName))
    .map((el) => el.innerText || el.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
  const body = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  const inputOf = (type) => all.filter((el) => el.tagName === 'INPUT' && (!type || el.type === type));
  return {
    url: location.href,
    hasApp: all.some((el) => /^(?:FIREFLY-HOME-APP|FIREFLY-ASH-|SP-MENU-ITEM)$/.test(el.tagName)),
    activeButtons: active.length,
    // Không tin cookie _pin_unauth: Adobe có thể giữ lại sau khi đã đăng nhập.
    // Dấu hiệu chắc chắn là nút Sign in hoặc editor không render được công cụ xóa.
    login: /^(?:Đăng nhập|Sign in)$/im.test(deepText) || inputOf('password').length > 0,
    hasCanvas: all.some((el) => el.tagName === 'CANVAS' && (() => {
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 200;
    })()),
    hasUpload: inputOf('file').length > 0,
    // Giao diện Firefly hiện dùng "Tải lên" (không còn "Tải ảnh lên") ngay màn hình chọn ảnh
    // của /image-editor. Phải nhận cả các nhãn đó thì mới không báo nhầm "chưa đăng nhập".
    hasEditorApp: /Chấm sửa và xóa|Generative remove|Xóa đối tượng|Tải ảnh lên|Tải lên|Upload(?: image)?|Chọn ảnh|Choose file|Lưu trữ đám mây Adobe|Tạo khung vẽ mới/i.test(deepText),
    body,
    deepText,
  };
}).catch(() => ({}));

// Firefly mất ~5-10s đầu để xác nhận tài khoản; trong lúc đó mọi nút đều disabled.
// Bấm ngay sẽ trúng nút chưa active hoặc trang chưa render xong → các lỗi "không tìm thấy nút".
async function waitForFireflyReady(page, timeoutMs = 30000, minWaitMs = 5000) {
  const start = Date.now();
  const end = start + timeoutMs;
  let ready = false;
  while (Date.now() < end) {
    const state = await readPageState(page);
    if (state.login) return false; // để prepareScene báo lỗi đăng nhập thay vì lỗi "chưa sẵn sàng"
    if (state.hasApp && state.activeButtons > 0 && /firefly\.adobe\.com/i.test(state.url || '')) {
      ready = true;
      break;
    }
    await sleep(500);
  }
  if (!ready) throw new Error('Firefly chưa sẵn sàng sau khi đăng nhập. Hãy đợi vài giây rồi thử lại.');
  // Kể cả khi đã thấy nút active vẫn đợi đủ 5s để Adobe kịp xác nhận tài khoản/gắn handler.
  const remain = minWaitMs - (Date.now() - start);
  if (remain > 0) await sleep(remain);
  await sleep(600);
  return true;
}

async function waitForEditorReady(page, timeoutMs = 30000) {
  const start = Date.now();
  const end = start + timeoutMs;
  while (Date.now() < end) {
    const state = await readPageState(page);
    if (state.login) return false;
    // Chỉ có khung điều hướng thì chưa phải editor; phải thấy công cụ "Chấm sửa và xóa"
    // hoặc canvas thật. Khi chưa đăng nhập Adobe, Firefly chỉ render khung vỏ.
    if (/image-editor/i.test(state.url || '') && state.activeButtons > 0 && (state.hasEditorApp || state.hasCanvas)) {
      const remain = 5000 - (Date.now() - start);
      if (remain > 0) await sleep(remain);
      await sleep(600);
      return true;
    }
    await sleep(500);
  }
  throw loginError();
}

async function isClickable(locator) {
  return (await locator.isVisible().catch(() => false)) && (await locator.isEnabled().catch(() => true));
}

// Chờ nút thật sự active rồi mới bấm. Firefly disable nút trong vài giây đầu nên click thường bị trượt.
async function clickEnabledAny(page, locators, { timeout = 15000, label = 'nút trên Firefly' } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const loc of locators) {
      const l = typeof loc === 'function' ? loc(page) : loc;
      if (await isClickable(l)) {
        await l.click({ force: true, timeout: 5000 });
        return true;
      }
    }
    await sleep(300);
  }
  throw new Error(`Không tìm thấy ${label} đang hoạt động trên Firefly. Hãy kiểm tra cửa sổ Firefly.`);
}

class Lock {
  constructor() { this.p = Promise.resolve(); }
  run(fn) { const r = this.p.then(fn, fn); this.p = r.catch(() => {}); return r; }
}

const tabs = new Map(); // key -> Promise<tab>
const lock = new Lock();

function fireflyHome() {
  const url = String(cfg.get().fireflyHomeUrl || DEFAULT_HOME).trim();
  return isFireflyUrl(url) ? url : DEFAULT_HOME;
}
function editorUrl() {
  try { return new URL('/image-editor', fireflyHome()).href; } catch (_) { return 'https://firefly.adobe.com/image-editor'; }
}

async function isLoggedIn(page) {
  const url = page.url();
  if (!isFireflyUrl(url) || isLoginUrl(url)) return false;
  // Nút Sign in nằm trong shadow DOM; cookie _pin_unauth cũng báo phiên chưa xác thực.
  const state = await readPageState(page);
  return !state.login;
}

async function status() {
  const http = require('http');
  const c = cfg.get();
  const up = await new Promise((res) => {
    const r = http.get({ host: '127.0.0.1', port: c.cdpPort, path: '/json/list', timeout: 1200 }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x)); resp.on('end', () => { try { res(JSON.parse(d)); } catch (_) { res(null); } });
    });
    r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); });
  });
  if (!up) return { browser: false, loggedIn: false };
  const pages = up.filter((t) => t.type === 'page');
  const onFirefly = pages.some((t) => isFireflyUrl(t.url));
  const onLogin = pages.some((t) => isLoginUrl(t.url));
  const loggedIn = onFirefly && !onLogin;
  return { browser: true, loggedIn, onFirefly, onLogin };
}

async function open() {
  await chrome.ensureBrowser({ visible: true });
  await chrome.showWindow();
  const ctx = await chrome.getContext();
  let pg = ctx.pages().find((x) => isFireflyUrl(x.url()));
  if (!pg) { pg = ctx.pages().find((x) => x.url() === 'about:blank') || await ctx.newPage(); }
  await pg.goto(fireflyHome(), { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.bringToFront().catch(() => {});
  return { ok: true, url: pg.url() };
}

async function reveal() {
  await chrome.ensureBrowser({ visible: true });
  await chrome.showWindow();
  const ctx = await chrome.getContext();
  const pg = ctx.pages().find((x) => isFireflyUrl(x.url()));
  if (pg) await pg.bringToFront().catch(() => {});
  else await open();
}

async function getTab(key) {
  const existing = tabs.get(key);
  if (existing) return existing;
  const pr = (async () => {
    const page = await chrome.newBackgroundPage();
    const t = { key, page, users: 1 };
    try {
      await page.goto(fireflyHome(), { waitUntil: 'domcontentloaded' });
    } catch (e) { await page.close().catch(() => {}); tabs.delete(key); throw e; }
    return t;
  })();
  tabs.set(key, pr);
  pr.catch(() => tabs.delete(key));
  return pr;
}

async function releaseTab(key) {
  const pr = tabs.get(key);
  if (!pr) return;
  tabs.delete(key);
  try { const t = await pr; await t.page.close().catch(() => {}); } catch (_) {}
}

async function closeProjectTabs(projectId) {
  const prefix = projectId + ':';
  const closing = [];
  for (const [key, pr] of [...tabs]) {
    if (!key.startsWith(prefix)) continue;
    tabs.delete(key);
    closing.push(pr.then((t) => t.page.close().catch(() => {})).catch(() => {}));
  }
  await Promise.all(closing);
}

async function clickAny(page, locators, timeout = 15000) {
  for (const loc of locators) {
    try {
      const l = typeof loc === 'function' ? loc(page) : loc;
      await l.waitFor({ timeout: 2500 });
      await l.click({ force: true, timeout: 5000 });
      return true;
    } catch (_) {}
  }
  // last attempt with full timeout on first
  const first = typeof locators[0] === 'function' ? locators[0](page) : locators[0];
  await first.waitFor({ timeout });
  await first.click({ force: true });
  return true;
}

// Firefly có vài input[type=file] ẩn; input đầu tiên là nơi tải ảnh chính, các input sau là "Tham chiếu".
async function findUploadInput(page) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i);
    const info = await el.evaluate((node) => ({
      text: `${node.labels?.[0]?.innerText || ''} ${node.parentElement?.innerText || ''} ${node.parentElement?.parentElement?.innerText || ''} ${node.outerHTML}`,
    })).catch(() => ({ text: '' }));
    if (!/tham chiếu|reference/i.test(info.text)) return el;
  }
  return count ? inputs.first() : null;
}

async function uploadImage(page, imagePath) {
  // 1) Input file ẩn: nhanh nhất, không phụ thuộc nhãn nút ("Tải lên" hay "Tải ảnh lên").
  const input = await findUploadInput(page);
  if (input) {
    try { await input.setInputFiles(imagePath); return { via: 'input' }; } catch (_) {}
  }
  // 2) Màn hình bắt đầu của /image-editor có nút "Tải lên": bấm để mở đúng file chooser.
  const chooserWait = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  let clicked = false;
  try {
    clicked = await clickEnabledAny(page, [L.uploadBtn, L.uploadBtnText], { timeout: 15000, label: 'nút Tải lên' });
  } catch (_) {}
  const chooser = clicked ? await chooserWait : null;
  if (chooser) {
    await chooser.setFiles(imagePath);
    return { via: 'chooser' };
  }
  // 3) Có thể Firefly chỉ tạo input sau khi bấm nút.
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const later = await findUploadInput(page);
    if (later) {
      try { await later.setInputFiles(imagePath); return { via: 'input-after-click' }; } catch (_) {}
    }
    await sleep(300);
  }
  const st = await readPageState(page);
  const detail = `url=${st.url || ''}, input file=${!!st.hasUpload}, nút active=${st.activeButtons ?? 0}, nhận diện editor=${!!st.hasEditorApp}`;
  throw new Error(`Không tìm thấy nơi tải ảnh lên trên Firefly (${detail}). Hãy mở cửa sổ Firefly kiểm tra${clicked ? ', hoặc bấm "Tải lên" rồi thử lại' : ''}.`);
}

function normalizeMask(mask) {
  const n = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
  const xPct = Math.min(99, Math.max(0, n(mask?.xPct, 84.375)));
  const yPct = Math.min(99, Math.max(0, n(mask?.yPct, 91.352)));
  return {
    xPct, yPct,
    wPct: Math.max(0.1, Math.min(100 - xPct, n(mask?.wPct, 6.12))),
    hPct: Math.max(0.1, Math.min(100 - yPct, n(mask?.hPct, 3.343))),
  };
}

async function findCanvas(page) {
  // Không dùng :visible vì canvas nằm trong shadow DOM; lọc bằng boundingBox bên dưới.
  const candidates = page.locator('canvas');
  const count = await candidates.count();
  let best = null;
  let bestArea = 0;
  for (let i = 0; i < count; i++) {
    const c = candidates.nth(i);
    const box = await c.boundingBox().catch(() => null);
    if (!box || box.width < 200 || box.height < 200) continue;
    const area = box.width * box.height;
    if (area > bestArea) { bestArea = area; best = { locator: c, box }; }
  }
  if (!best) throw new Error('Không tìm thấy vùng ảnh trên Firefly để xóa logo.');
  return best;
}
async function waitForCanvas(page, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try { return await findCanvas(page); } catch (e) { last = e; await sleep(500); }
  }
  throw last || new Error('Firefly chưa hiển thị ảnh để xóa logo.');
}
async function waitForDownloadReady(page, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await downloadReady(page)) return true; // Ảnh đã tạo xong: bỏ qua banner quota còn sót lại.
    if (await detectQuotaBlock(page)) throw quotaError();
    await sleep(1000);
  }
  throw new Error('Firefly chưa tạo xong ảnh để tải xuống.');
}

async function applyBrush(page, mask, imagePath) {
  const { locator, box } = await findCanvas(page);
  const m = normalizeMask(mask);
  // Ảnh 9:16 thường được Firefly hiển thị dạng "contain" trong canvas; quy đổi phần trăm
  // theo đúng khung ảnh thật thay vì toàn bộ canvas để không tô lệch vùng logo.
  let frame = box;
  const src = imagePath ? imageDimensions(imagePath) : null;
  if (src?.width > 0 && src?.height > 0 && box.width > 0 && box.height > 0) {
    const scale = Math.min(box.width / src.width, box.height / src.height);
    const w = src.width * scale;
    const h = src.height * scale;
    frame = { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
  }
  // Brush size: slightly larger than logo width in pixels.
  const targetBrush = Math.max(8, Math.round((m.wPct / 100) * frame.width * 1.15));
  const slider = (await L.brushSize(page).isVisible().catch(() => false)) ? L.brushSize(page) : L.brushSizeInput(page);
  if (await slider.isVisible().catch(() => false) || await slider.count().catch(() => 0)) {
    try { await slider.fill(String(targetBrush)); } catch (_) {
      try {
        await slider.focus();
        await page.keyboard.press('Control+A');
        await page.keyboard.type(String(targetBrush));
        await page.keyboard.press('Enter');
      } catch (_) {}
    }
  }

  const x1 = frame.x + (m.xPct / 100) * frame.width;
  const y1 = frame.y + (m.yPct / 100) * frame.height;
  const x2 = x1 + (m.wPct / 100) * frame.width;
  const y2 = y1 + (m.hPct / 100) * frame.height;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  // Paint a small cross to cover logo area reliably.
  const strokes = [
    [{ x: x1, y: cy }, { x: x2, y: cy }],
    [{ x: cx, y: y1 }, { x: cx, y: y2 }],
    [{ x: x1, y: y1 }, { x: x2, y: y2 }],
  ];
  for (const pts of strokes) {
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const pt of pts.slice(1)) await page.mouse.move(pt.x, pt.y, { steps: 12 });
    await page.mouse.up();
    await sleep(120);
  }
  return { box, mask: m, brush: targetBrush };
}

function isQuotaText(text) {
  return /đã hết lượt|hết lượt (?:tạo|miễn phí|free|generative)|đã đạt giới hạn|out of generative credits|no generative credits|generation limit reached|daily limit reached|insufficient credits|quota exceeded/i.test(String(text || ''));
}

async function detectQuotaBlock(page) {
  const state = await readPageState(page);
  if (isQuotaText(state.body) || isQuotaText(state.deepText)) return true;
  for (const re of [/đã hết lượt|hết lượt/i, /đã đạt giới hạn/i, /out of generative credits|no generative credits|insufficient credits/i, /generation limit reached|daily limit reached|quota exceeded/i]) {
    const loc = page.getByText(re).first();
    if (await loc.isVisible().catch(() => false)) return true;
  }
  return false;
}

async function waitForDownloadClick(page, timeoutMs = 180000) {
  let download = null;
  const onDownload = (d) => { download = d; };
  page.on('download', onDownload);
  try {
    await L.downloadBtn(page).click({ force: true, timeout: 30000 }).catch(() => null);
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (download) return download;
      // Chỉ coi là hết lượt khi KHÔNG có nút tải: ảnh đã tạo thì vẫn cho tải tiếp.
      if (await detectQuotaBlock(page) && !(await downloadReady(page))) throw quotaError();
      await sleep(1000);
    }
    throw new Error('Firefly chưa tạo xong ảnh để tải xuống.');
  } finally {
    page.off('download', onDownload);
  }
}

function quotaError() {
  return Object.assign(new Error('Đã hết lượt free Firefly. Hãy kết nối lại bằng Gmail khác rồi tiếp tục.'), { code: 'FIREFLY_QUOTA' });
}
function loginError() {
  return Object.assign(new Error('Chưa đăng nhập Adobe Firefly. Bấm “Kết nối Firefly” và đăng nhập rồi thử lại.'), { code: 'FIREFLY_LOGIN' });
}
function assertNotCanceled(isCanceled) {
  if (isCanceled?.()) throw Object.assign(new Error('Dự án đã bị hủy.'), { code: 'CANCELED' });
}

async function prepareScene({ projectId, sceneId, imagePath, onPhase, isCanceled }) {
  return lock.run(async () => {
    const key = `${projectId}:${sceneId}`;
    assertNotCanceled(isCanceled);
    await releaseTab(key); // clean old session
    const t = await getTab(key);
    const p = t.page;
    try {
      // Firefly cần người dùng nhìn lại kết quả trước khi bấm Ổn: hiện cửa sổ Chrome lên.
      await chrome.showWindow().catch(() => {});
      onPhase?.('Đang mở Adobe Firefly…');
      await p.bringToFront().catch(() => {});
      assertNotCanceled(isCanceled);
      if (!(await isLoggedIn(p))) throw loginError();
      // 5–10 giây đầu Firefly còn đang xác nhận tài khoản, bấm ngay sẽ trượt nút.
      if (!(await waitForFireflyReady(p))) throw loginError();

      onPhase?.('Đang mở mục Hình ảnh…');
      await clickEnabledAny(p, [L.imagesNav, L.imagesNavLegacy, L.imagesNavLink, L.imagesNavText], { label: 'mục Hình ảnh' });
      await sleep(800);
      assertNotCanceled(isCanceled);
      onPhase?.('Đang mở Chỉnh sửa hình ảnh…');
      await clickEnabledAny(p, [L.editImage, L.editImageText, L.editImageLegacy, L.editImageLink], { label: 'mục Chỉnh sửa hình ảnh' }).catch(async () => {
        // Firefly đôi khi đổi role của menu item: đi thẳng vào editor nếu click không trúng.
        await p.goto(editorUrl(), { waitUntil: 'domcontentloaded' });
      });
      if (!(await waitForEditorReady(p))) throw loginError();
      assertNotCanceled(isCanceled);

      onPhase?.('Đang tải ảnh 2K lên Firefly…');
      await uploadImage(p, imagePath);
      await waitForCanvas(p);
      if (await detectQuotaBlock(p)) throw quotaError();
      assertNotCanceled(isCanceled);

      onPhase?.('Đang chọn công cụ Chấm sửa và xóa…');
      await clickEnabledAny(p, [L.removeObject, L.removeObjectText], { label: 'công cụ Chấm sửa và xóa' });
      await sleep(1200);
      assertNotCanceled(isCanceled);

      onPhase?.('Đang tô vùng logo…');
      await applyBrush(p, cfg.get().logoRemoveMask, imagePath);
      if (await detectQuotaBlock(p)) throw quotaError();

      onPhase?.('Đang bấm Xóa trên Firefly…');
      await clickEnabledAny(p, [L.removeBtn, L.removeBtnText], { timeout: 30000, label: 'nút xóa/áp dụng' });
      await waitForDownloadReady(p);
      assertNotCanceled(isCanceled);

      onPhase?.('Đã xóa logo trên Firefly. Chờ bạn bấm “Ổn” để tải xuống.');
      return { ok: true, key };
    } catch (e) {
      // Lỗi/quota/hủy: đóng tab nền Firefly, không để nặng máy hay tồn session cũ.
      await releaseTab(key);
      // Hết lượt: mở lại 1 cửa sổ Firefly nhìn thấy được để bạn tự đăng nhập Gmail khác.
      if (e?.code === 'FIREFLY_QUOTA') await open().catch(() => {});
      throw e;
    }
  });
}

async function downloadPrepared({ projectId, sceneId, targetPath, onPhase, isCanceled, keepTabOnQuota = false }) {
  return lock.run(async () => {
    const key = `${projectId}:${sceneId}`;
    const pr = tabs.get(key);
    if (!pr) throw new Error('Không còn phiên Firefly của cảnh này. Hãy bấm “Làm lại xóa logo”.');
    const t = await pr;
    const p = t.page;
    const tmp = targetPath + '.part';
    let quotaBlocked = false;
    try {
      assertNotCanceled(isCanceled);
      await chrome.showWindow().catch(() => {});
      await p.bringToFront().catch(() => {});
      // Banner hết lượt có thể còn hiện dù ảnh đã tạo xong: có nút Tải xuống thì vẫn tải.
      if (!(await downloadReady(p)) && await detectQuotaBlock(p)) throw quotaError();

      onPhase?.('Đang tải ảnh sạch từ Firefly…');
      const download = await waitForDownloadClick(p);
      assertNotCanceled(isCanceled);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      await download.saveAs(tmp);
      const size = imageDimensions(tmp);
      if (!size || !size.width || !size.height) throw new Error('File tải về từ Firefly không đọc được.');
      const finalExt = path.extname(download.suggestedFilename() || '') || path.extname(targetPath) || '.png';
      const final = targetPath.replace(/\.[^.\\/]+$/, '') + finalExt;
      fs.rmSync(final, { force: true });
      fs.renameSync(tmp, final);
      onPhase?.('Đã tải ảnh sạch về máy.');
      return { ok: true, file: final, width: size.width, height: size.height };
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      // Ảnh đã tạo nhưng Firefly chặn tải: giữ tab lại để đổi Gmail xong chỉ bấm Ổn,
      // không phải tạo lại ảnh (tốn thêm lượt free của Gmail mới).
      if (keepTabOnQuota && e?.code === 'FIREFLY_QUOTA') quotaBlocked = true;
      throw e;
    } finally {
      if (!quotaBlocked) await releaseTab(key);
    }
  });
}

// Cảnh đã tạo xong trên Firefly còn giữ tab không? Dùng để quyết định tải lại hay tạo lại.
function hasSceneTab(projectId, sceneId) {
  return tabs.has(`${projectId}:${sceneId}`);
}

async function discardScene({ projectId, sceneId }) {
  return lock.run(async () => { await releaseTab(`${projectId}:${sceneId}`); });
}

module.exports = {
  status, open, reveal,
  prepareScene, downloadPrepared, discardScene, hasSceneTab,
  closeProjectTabs,
  _test: { normalizeMask, fireflyHome, editorUrl, isQuotaText, waitForFireflyReady, clickEnabledAny },
};