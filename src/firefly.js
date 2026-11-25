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
const L = {
  imagesNav: (p) => p.getByRole('button', { name: /Hình ảnh|Images/i }).first(),
  imagesNavLink: (p) => p.getByRole('link', { name: /Hình ảnh|Images/i }).first(),
  editImage: (p) => p.getByRole('button', { name: /Chỉnh sửa hình ảnh|Edit image/i }).first(),
  editImageLink: (p) => p.getByRole('link', { name: /Chỉnh sửa hình ảnh|Edit image/i }).first(),
  uploadBtn: (p) => p.getByRole('button', { name: /Tải ảnh lên|Upload image|Upload|Chọn ảnh|Choose file/i }).first(),
  uploadInput: (p) => p.locator('input[type="file"]').first(),
  removeObject: (p) => p.getByRole('button', { name: /Chấm sửa và xóa|Remove object|Generative remove|Xóa đối tượng/i }).first(),
  removeObjectText: (p) => p.getByText(/Chấm sửa và xóa|Generative remove|Xóa đối tượng/i).first(),
  brushSize: (p) => p.getByRole('slider', { name: /Kích thước cọ|Brush size|Size/i }).first(),
  brushSizeInput: (p) => p.locator('input[type="range"]').first(),
  removeBtn: (p) => p.getByRole('button', { name: /^Xóa$|^Remove$/i }).first(),
  downloadBtn: (p) => p.getByRole('button', { name: /Tải xuống|Download/i }).first(),
};

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

async function isLoggedIn(page) {
  const url = page.url();
  if (!isFireflyUrl(url) || isLoginUrl(url)) return false;
  // Firefly thường có nút Sign in khi chưa đăng nhập; profile/avatar khi đã đăng nhập.
  const signIn = page.getByRole('button', { name: /Đăng nhập|Sign in/i }).first();
  if (await signIn.isVisible().catch(() => false)) return false;
  return true;
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
      await page.waitForTimeout(1500);
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
  const candidates = page.locator('canvas:visible');
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
    if (await detectQuotaBlock(page)) throw Object.assign(new Error('Đã hết lượt free Firefly. Hãy kết nối lại bằng Gmail khác rồi tiếp tục.'), { code: 'FIREFLY_QUOTA' });
    const btn = L.downloadBtn(page);
    if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => true)) return true;
    await sleep(1000);
  }
  throw new Error('Firefly chưa tạo xong ảnh để tải xuống.');
}

async function applyBrush(page, mask) {
  const { locator, box } = await findCanvas(page);
  const m = normalizeMask(mask);
  // Brush size: slightly larger than logo width in pixels.
  const targetBrush = Math.max(8, Math.round((m.wPct / 100) * box.width * 1.15));
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

  const x1 = box.x + (m.xPct / 100) * box.width;
  const y1 = box.y + (m.yPct / 100) * box.height;
  const x2 = x1 + (m.wPct / 100) * box.width;
  const y2 = y1 + (m.hPct / 100) * box.height;
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

async function detectQuotaBlock(page) {
  const texts = [/đã hết lượt|hết lượt|out of generative credits|no generative credits|quota|limit reached|insufficient credits|đã đạt giới hạn/i];
  for (const re of texts) {
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
      if (await detectQuotaBlock(page)) throw quotaError();
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
    // Firefly cần người dùng nhìn lại kết quả trước khi bấm Ổn: hiện cửa sổ Chrome lên.
    await chrome.showWindow().catch(() => {});
    onPhase?.('Đang mở Adobe Firefly…');
    await p.bringToFront().catch(() => {});
    assertNotCanceled(isCanceled);
    if (!(await isLoggedIn(p))) throw loginError();

    onPhase?.('Đang mở mục Hình ảnh…');
    await clickAny(p, [L.imagesNav, L.imagesNavLink]);
    await sleep(800);
    assertNotCanceled(isCanceled);
    onPhase?.('Đang mở Chỉnh sửa hình ảnh…');
    await clickAny(p, [L.editImage, L.editImageLink]);
    await sleep(1200);
    assertNotCanceled(isCanceled);

    onPhase?.('Đang tải ảnh 2K lên Firefly…');
    const [chooser] = await Promise.all([
      p.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null),
      clickAny(p, [L.uploadBtn, L.uploadInput]).catch(() => null),
    ]);
    if (chooser) await chooser.setFiles(imagePath);
    else {
      const input = L.uploadInput(p);
      await input.waitFor({ timeout: 15000, state: 'attached' });
      await input.setInputFiles(imagePath);
    }
    await waitForCanvas(p);
    assertNotCanceled(isCanceled);

    onPhase?.('Đang chọn công cụ Chấm sửa và xóa…');
    await clickAny(p, [L.removeObject, L.removeObjectText]);
    await sleep(1200);
    assertNotCanceled(isCanceled);

    onPhase?.('Đang tô vùng logo…');
    await applyBrush(p, cfg.get().logoRemoveMask);
    if (await detectQuotaBlock(p)) throw quotaError();

    onPhase?.('Đang bấm Xóa trên Firefly…');
    await clickAny(p, [L.removeBtn, (pg) => pg.getByRole('button', { name: /Remove/i }).first()]);
    await waitForDownloadReady(p);
    assertNotCanceled(isCanceled);

    onPhase?.('Đã xóa logo trên Firefly. Chờ bạn bấm “Ổn” để tải xuống.');
    return { ok: true, key };
  });
}

async function downloadPrepared({ projectId, sceneId, targetPath, onPhase, isCanceled }) {
  return lock.run(async () => {
    const key = `${projectId}:${sceneId}`;
    const pr = tabs.get(key);
    if (!pr) throw new Error('Không còn phiên Firefly của cảnh này. Hãy bấm “Làm lại xóa logo”.');
    const t = await pr;
    const p = t.page;
    assertNotCanceled(isCanceled);
    await chrome.showWindow().catch(() => {});
    await p.bringToFront().catch(() => {});
    if (await detectQuotaBlock(p)) throw quotaError();

    const tmp = targetPath + '.part';
    try {
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
      throw e;
    }
  });
}

async function discardScene({ projectId, sceneId }) {
  return lock.run(async () => { await releaseTab(`${projectId}:${sceneId}`); });
}

module.exports = {
  status, open, reveal,
  prepareScene, downloadPrepared, discardScene,
  closeProjectTabs,
  _test: { normalizeMask, fireflyHome },
};