// Adobe Firefly logo removal automation qua Chrome RIÊNG (không chung profile/CDP với Flow).
// Đổi Gmail Firefly liên tục vì thế không đụng session Google của Flow.
// UI selectors are centralized here because Firefly changes frequently.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const chrome = require('./chrome-firefly');
const { imageDimensions } = require('./image');

const DEFAULT_HOME = 'https://firefly.adobe.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UI_TICK_MS = 150;
// Chờ theo điều kiện thật thay vì ngủ cố định: nhanh hơn nhưng vẫn bấm đúng lúc nút đã active.
async function waitUntil(check, timeoutMs, label, tickMs = UI_TICK_MS) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await check();
    if (last) return last;
    await sleep(tickMs);
  }
  if (label) throw new Error(label);
  return last;
}
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
  // Cỡ cọ thật nằm trong hộp “Cài đặt cọ vẽ”, không phải slider để lộ ngay trên thanh công cụ.
  brushSettings: (p) => p.locator('#gen-remove-brush-settings-trigger').first(),
  brushSizeSlider: (p) => p.locator('sp-slider[label="Kích thước cọ"]').first(),
  brushSizeRange: (p) => L.brushSizeSlider(p).locator('input[type="range"]').first(),
  brushSizeRole: (p) => p.getByRole('slider', { name: /Kích thước cọ|Brush size/i }).first(),
  // Nút xác nhận trên bản hiện tại là "Áp dụng", bản cũ là "Xóa"/"Remove".
  removeBtn: (p) => p.getByRole('button', { name: /^(?:Xóa|Remove|Áp dụng|Apply)$/i }).first(),
  removeBtnText: (p) => p.getByText(/^(?:Xóa|Remove|Áp dụng|Apply)$/i).first(),
  downloadBtn: (p) => p.getByRole('button', { name: /Tải xuống|Download/i }).first(),
  // Khung 9:16 nằm trong công cụ Cắt: preset "Thêm" -> option 9:16 -> nút "Cắt".
  cropTool: (p) => p.getByRole('button', { name: /Cắt và mở rộng|Crop and expand/i }).first(),
  moreRatio: (p) => p.getByRole('combobox', { name: /^Thêm$|More/i }).first(),
  // getByRole('combobox') đôi khi không thấy picker trong shadow DOM; selector thật là sp-picker[label="Thêm"].
  ratioPicker: (p) => p.locator('sp-picker[label="Thêm"]').first(),
  ratio916: (p) => p.locator('sp-menu-item[value="9:16"]').first(),
  ratio916Role: (p) => p.getByRole('option', { name: '9:16' }).first(),
  cropApply: (p) => p.getByRole('button', { name: /^Cắt$/i }).first(),
  // Firefly đôi khi hiện hộp "Xác nhận cắt" sau khi bấm Cắt, hoặc thông báo hết dung lượng
  // lưu trữ chắn toàn bộ thao tác. Phải đóng trước khi chấm cọ, nếu không nút Xóa không chạy.
  cropAck: (p) => p.getByRole('button', { name: /^Xác nhận cắt$/i }).first(),
  storageContinue: (p) => p.getByRole('button', { name: /^Tiếp tục$/i }).first(),
  removalDone: (p) => p.getByText(/hoàn tất thao tác tạo sinh|hoàn tất thao tác/i).first(),
};

// Firefly vẫn giữ banner "hết lượt" trên trang kết quả dù ảnh hiện tại ĐÃ tạo xong.
// Nếu nút Tải xuống dùng được thì ảnh này là ảnh đã làm xong → ưu tiên tải,
// không được đánh dấu hết lượt rồi tạo lại từ đầu khi đổi Gmail.
async function downloadReady(page) {
  const btn = L.downloadBtn(page);
  return (await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => true));
}

// Sau khi bấm Xóa, Firefly chạy vài giây rồi hiện ĐÚNG câu này trên ảnh.
// Nút Tải xuống có thể đã tồn tại từ trước → không được dùng nó làm tín hiệu xong.
const isRemovalDone = (text) => /đã hoàn tất thao tác tạo sinh|hoàn tất thao tác tạo sinh|generative remove (?:complete|done)|removal complete/i.test(String(text || ''));

async function removalComplete(page, state) {
  const s = state || await readPageState(page);
  if (isRemovalDone(s.uiText) || isRemovalDone(s.deepText)) return true;
  return await L.removalDone(page).isVisible().catch(() => false);
}

async function waitForRemovalComplete(page, timeoutMs = 180000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const state = await readPageState(page);
    if (await removalComplete(page, state)) return true; // Firefly đã báo xong mới được phép tải.
    if (await detectQuotaBlock(page, state)) throw quotaError();
    await sleep(400);
  }
  throw new Error('Firefly chưa báo “Đã hoàn tất thao tác tạo sinh”.');
}

// Toàn bộ giao diện Firefly nằm trong shadow DOM của <firefly-home-app>/<firefly-ash-shell>.
// document.querySelector() thường KHÔNG thấy các nút đó → phải đi qua shadowRoot.
const readPageState = (page) => page.evaluate(() => {
  const visited = new Set();
  const all = [];
  const walk = (root, depth) => {
    // Giao diện editor hiện nằm sâu hơn 10 lớp shadow root. Dừng ở 10 làm hasEditorApp/
    // hasUpload luôn false dù trang đã vào /image-editor -> tool báo nhầm FIREFLY_LOGIN
    // và không bao giờ chạy tới bước tải ảnh lên.
    if (!root || depth > 26) return;
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
  const uiNodes = all.filter((el) => !/^(?:SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName));
  const deepText = uiNodes.map((el) => el.innerText || el.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
  // Text node thật trên giao diện (không lẫn JS) để nhận câu báo “hoàn tất tạo sinh” trên ảnh.
  const uiText = uiNodes.map((el) => el.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
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
    uiText,
  };
}).catch(() => ({}));

// Firefly mất ~5-10s đầu để xác nhận tài khoản; trong lúc đó mọi nút đều disabled.
// Chỉ chờ đủ 5s MỘT LẦN cho toàn bộ tab, không cộng thêm ở bước editor.
async function waitForFireflyReady(page, timeoutMs = 30000, minWaitMs = 5000) {
  const start = Date.now();
  const end = start + timeoutMs;
  let ready = false;
  while (Date.now() < end) {
    const state = await readPageState(page);
    if (state.login) return false; // để prepareScene báo lỗi đăng nhập thay vì lỗi "chưa sẵn sàng"
    if ((state.hasApp || state.hasEditorApp) && state.activeButtons > 0 && /firefly\.adobe\.com/i.test(state.url || '')) {
      ready = true;
      break;
    }
    await sleep(UI_TICK_MS);
  }
  if (!ready) throw new Error('Firefly chưa sẵn sàng sau khi đăng nhập. Hãy đợi vài giây rồi thử lại.');
  const remain = minWaitMs - (Date.now() - start);
  if (remain > 0) await sleep(remain);
  return true;
}

async function waitForEditorReady(page, timeoutMs = 30000, minWaitMs = 5000) {
  const start = Date.now();
  const end = start + timeoutMs;
  let ready = false;
  while (Date.now() < end) {
    const state = await readPageState(page);
    if (state.login) return false;
    // Chỉ có khung điều hướng thì chưa phải editor; phải thấy công cụ "Chấm sửa và xóa"
    // hoặc canvas thật. Khi chưa đăng nhập Adobe, Firefly chỉ render khung vỏ.
    if (/image-editor/i.test(state.url || '') && state.activeButtons > 0 && (state.hasEditorApp || state.hasCanvas)) {
      ready = true;
      break;
    }
    await sleep(UI_TICK_MS);
  }
  if (!ready) throw loginError();
  // 5 giây đã được tiêu ở waitForFireflyReady; chỉ bù phần còn thiếu, không chờ lại từ đầu.
  const remain = minWaitMs - (Date.now() - start);
  if (remain > 0) await sleep(remain);
  return true;
}

async function isClickable(locator) {
  return (await locator.isVisible().catch(() => false)) && (await locator.isEnabled().catch(() => true));
}

// Chờ locator đầu tiên thật sự active; thử lại mọi phương án dự phòng mỗi 150ms.
async function waitClickable(page, locators, { timeout = 8000, label = 'nút trên Firefly' } = {}) {
  const list = locators.map((loc) => (typeof loc === 'function' ? loc(page) : loc));
  return waitUntil(async () => {
    for (const l of list) if (await isClickable(l)) return l;
    return null;
  }, timeout, `Không thấy ${label} đang hoạt động trên Firefly.`);
}

// Chờ nút thật sự active rồi mới bấm. Firefly disable nút trong vài giây đầu nên click thường bị trượt.
async function clickEnabledAny(page, locators, opts = {}) {
  const target = await waitClickable(page, locators, opts);
  await target.click({ force: true, timeout: 5000 });
  return true;
}

async function tryClick(page, locators, opts = {}) {
  try { return await clickEnabledAny(page, locators, opts); } catch (_) { return false; }
}

class Lock {
  constructor() { this.p = Promise.resolve(); }
  run(fn) { const r = this.p.then(fn, fn); this.p = r.catch(() => {}); return r; }
}

const tabs = new Map(); // key -> Promise<tab>
const lock = new Lock();
let loginKeepAlive = false; // cửa sổ Firefly đang mở cho người dùng đổi Gmail: không tự tắt

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
    // Firefly dùng Chrome RIÊNG cổng 9334. Đọc nhầm 9333 (Flow) thì chip báo “chưa kết nối” mãi.
    const r = http.get({ host: '127.0.0.1', port: c.fireflyCdpPort, path: '/json/list', timeout: 1200 }, (resp) => {
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
  loginKeepAlive = true; // người dùng đang đăng nhập/đổi Gmail: giữ cửa sổ này lại
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
  loginKeepAlive = true;
  await chrome.ensureBrowser({ visible: true });
  await chrome.showWindow();
  const ctx = await chrome.getContext();
  const pg = ctx.pages().find((x) => isFireflyUrl(x.url()));
  if (pg) await pg.bringToFront().catch(() => {});
  else await open();
}

// Bấm “Chạy tất cả” / bắt đầu xóa logo: dời cửa sổ Firefly ra ngoài màn hình NGAY,
// không để Chrome ló lên che app. Việc chiếu vẫn chạy trong tab nền.
async function background() {
  loginKeepAlive = false;
  await chrome.hideWindow().catch(() => {});
  return { ok: true };
}

async function getTab(key) {
  const existing = tabs.get(key);
  if (existing) return existing;
  cancelIdleClose(); // ảnh kế tiếp dùng lại Chrome đang ấm, không khởi động lại từ đầu
  const pr = (async () => {
    const page = await chrome.newBackgroundPage();
    const t = { key, page, users: 1 };
    try {
      // Vào thẳng editor: đi qua trang chủ rồi mới goto lại tốn thêm một lần tải trang.
      await page.goto(editorUrl(), { waitUntil: 'domcontentloaded' });
    } catch (e) { await page.close().catch(() => {}); tabs.delete(key); await closeIfIdle(); throw e; }
    return t;
  })();
  tabs.set(key, pr);
  pr.catch(() => tabs.delete(key));
  return pr;
}

// Giữ process Chrome ấm GIỮA Hai ảnh kế tiếp: đóng ngay thì ảnh sau phải khởi động lại Chrome
// (chậm, khung chiếu mất trắng 1 lúc). Hết hạn mới đóng để nhẹ RAM; có tab mới là hủy hẹn.
let idleCloseTimer = null;
function cancelIdleClose() {
  if (idleCloseTimer) { clearTimeout(idleCloseTimer); idleCloseTimer = null; }
}
async function closeIfIdle() {
  if (tabs.size || loginKeepAlive) return;
  cancelIdleClose();
  idleCloseTimer = setTimeout(() => { idleCloseTimer = null; chrome.close().catch(() => {}); }, 300000);
}
// Lỗi / hết lượt / tạm dừng / tắt tool thì đóng ngay, không chờ hẹn.
async function closeIdleNow() {
  cancelIdleClose();
  await chrome.close().catch(() => {});
}

async function releaseTab(key) {
  const pr = tabs.get(key);
  if (!pr) { await closeIfIdle(); return; }
  tabs.delete(key);
  try { const t = await pr; await detachPreview(t); await t.page.close().catch(() => {}); } catch (_) {}
  await closeIfIdle();
}

async function closeProjectTabs(projectId) {
  const prefix = projectId + ':';
  const closing = [];
  for (const [key, pr] of [...tabs]) {
    if (!key.startsWith(prefix)) continue;
    tabs.delete(key);
    closing.push(pr.then(async (t) => { await detachPreview(t); await t.page.close().catch(() => {}); }).catch(() => {}));
  }
  await Promise.all(closing);
  await closeIfIdle();
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

// Thông báo hết dung lượng lưu trữ / hộp xác nhận cắt có thể chắn toàn bộ thao tác.
// Chỉ chờ trong một cửa sổ ngắn rồi bấm ngay khi nút hiện ra, không sleep cố định.
async function dismissFireflyDialogs(page, graceMs = 400) {
  const locs = [L.storageContinue(page), L.cropAck(page)];
  const clicked = new Set();
  const end = Date.now() + graceMs;
  while (Date.now() < end) {
    for (let i = 0; i < locs.length; i++) {
      if (clicked.has(i) || !(await isClickable(locs[i]))) continue;
      await locs[i].click({ force: true, timeout: 5000 }).catch(() => {});
      clicked.add(i);
    }
    if (clicked.size && !(await Promise.all(locs.map((l) => isClickable(l)))).some(Boolean)) break;
    await sleep(100);
  }
}

// Firefly không có preset 9:16 trên thanh tỷ lệ thường mà nằm trong picker "Thêm" của công cụ Cắt.
// Chọn xong phải bấm "Cắt" rồi xác nhận thì khung 9:16 mới áp dụng cho ảnh trước khi tô vùng logo.
async function selectAspect916(page) {
  try {
    if (!(await tryClick(page, [L.cropTool], { timeout: 5000, label: 'công cụ Cắt và mở rộng' }))) return false;
    const picker = await waitClickable(page, [L.ratioPicker, L.moreRatio], { timeout: 5000, label: 'picker “Thêm”' });
    await picker.click({ force: true, timeout: 5000 });
    const option = await waitClickable(page, [
      (p) => L.ratio916(p),
      (p) => L.ratio916Role(p),
      (p) => p.getByText('9:16', { exact: true }).first(),
    ], { timeout: 5000, label: 'preset 9:16' });
    await option.click({ force: true, timeout: 5000 });
    if (!(await tryClick(page, [L.cropApply], { timeout: 5000, label: 'nút Cắt' }))) return false;
    // Hộp “Xác nhận cắt” hiện ra ngay sau khi bấm Cắt; chờ có điều kiện rồi bấm, không ngủ cố định 1500ms.
    await dismissFireflyDialogs(page, 1500);
    return true;
  } catch (_) {
    return false; // không được làm đứt luồng xóa logo chỉ vì Adobe đổi lại giao diện chọn khung
  }
}

function normalizeMask(mask) {
  const n = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
  const xPct = Math.min(99, Math.max(0, n(mask?.xPct, 89.940)));
  const yPct = Math.min(99, Math.max(0, n(mask?.yPct, 94.329)));
  return {
    xPct, yPct,
    wPct: Math.max(0.1, Math.min(100 - xPct, n(mask?.wPct, 6.12))),
    hPct: Math.max(0.1, Math.min(100 - yPct, n(mask?.hPct, 3.343))),
  };
}

async function findCanvas(page, { prefer9x16 = false } = {}) {
  // Không dùng :visible vì canvas nằm trong shadow DOM; lọc bằng boundingBox bên dưới.
  const candidates = page.locator('canvas');
  const count = await candidates.count();
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < count; i++) {
    const c = candidates.nth(i);
    const box = await c.boundingBox().catch(() => null);
    if (!box) continue;
    const cls = await c.evaluate((el) => String(el.className || '')).catch(() => '');
    const isMask = /mask-canvas/i.test(cls);
    // Canvas mask trên ảnh 2K chỉ rộng ~199px; khi cửa sổ bị thu nhỏ có thể xuống ~50px.
    // Ngưỡng cũ 60/100 loại nó → chấm nhầm canvas nền → logo vẫn còn. Chỉ loại canvas vô hình.
    if (isMask ? (box.width < 10 || box.height < 10) : (box.width < 200 || box.height < 200)) continue;
    let score;
    if (prefer9x16) {
      // Sau khi bấm “Chấm sửa và xóa” Firefly có 2 canvas: canvas nền (tỷ lệ ~1.7)
      // và canvas mask thật (class mask-canvas, tỷ lệ 9:16). mask-canvas là vùng chấm
      // THEO ĐỊNH NGHĨA — ưu tiên tuyệt đối, kể cả khi nó nhỏ vì cửa sổ bị thu lại.
      score = isMask ? -Infinity : Math.abs(box.width / box.height - 9 / 16);
    } else {
      score = -box.width * box.height; // lúc upload chỉ có canvas nền: lấy canvas lớn nhất
    }
    if (score < bestScore) { bestScore = score; best = { locator: c, box }; }
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
async function waitForMaskCanvas(page, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try { return await findCanvas(page, { prefer9x16: true }); } catch (e) { last = e; await sleep(500); }
  }
  throw last || new Error('Firefly chưa hiện đúng vùng ảnh 9:16 để chấm logo.');
}

// Cỡ cọ nằm trong hộp “Cài đặt cọ vẽ: 64px”. Web component <sp-slider> có input[type=range]
// bên trong shadow root; gán .value bằng JS KHÔNG cập nhật state, phải dùng bàn phím như người thật.
async function setBrushSize(page, size) {
  const target = Math.min(128, Math.max(5, Math.round(Number(size) || 14)));
  await clickEnabledAny(page, [L.brushSettings], { timeout: 10000, label: 'nút Cài đặt cọ vẽ' });
  let range = L.brushSizeRange(page);
  if (!(await waitUntil(async () => (await range.count().catch(() => 0)) > 0, 2500, null, 100).catch(() => false))) {
    const byRole = L.brushSizeRole(page);
    if (await waitUntil(async () => (await byRole.count().catch(() => 0)) > 0, 1000, null, 100).catch(() => false)) {
      range = byRole.locator('input[type="range"]').first();
    }
  }
  if (!(await range.count().catch(() => 0))) throw new Error('Không thấy thanh “Kích thước cọ” trong Firefly.');
  const min = Number(await range.getAttribute('min')) || 5;
  const current = Number(await range.inputValue());
  if (current !== target) {
    await range.focus();
    await page.keyboard.press('Home'); // về mức nhỏ nhất rồi tăng từng nấc như người bấm
    const steps = Math.max(0, Math.min(128 - min, target - min));
    for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight');
    // Đợi state web component nhận đúng giá trị; không ngủ cố định 500ms.
    await waitUntil(async () => Number(await range.inputValue().catch(() => NaN)) === target, 1500, null, 100).catch(() => {});
  }
  const label = await L.brushSettings(page).innerText().catch(() => '');
  await page.keyboard.press('Escape'); // đóng hộp cài đặt để không che canvas
  await waitUntil(async () => !(await range.isVisible().catch(() => false)), 1000, null, 100).catch(() => {});
  return { target, label };
}
async function waitForDownloadReady(page, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await downloadReady(page)) return true; // Ảnh đã tạo xong: bỏ qua banner quota còn sót lại.
    if (await detectQuotaBlock(page)) throw quotaError();
    await sleep(400);
  }
  throw new Error('Firefly chưa tạo xong ảnh để tải xuống.');
}

async function applyBrush(page, mask, imagePath, brushSize, cropped = true) {
  // Chấm đúng 1 lần vào tâm vùng logo trên canvas mask 9:16 — đúng thao tác người dùng
  // đã làm trực tiếp: chỉnh cọ mức 14 rồi chấm, sau đó bấm Xóa.
  const boxBefore = (await waitForMaskCanvas(page)).box;
  const m = normalizeMask(mask);
  const brush = await setBrushSize(page, brushSize);
  // Cọ vừa đóng hộp cài đặt: lấy lại box mới, không dùng box cũ đã bị dịch layout.
  const boxAfter = (await waitForMaskCanvas(page)).box;
  if (process.env.FLOW_FIREFLY_DEBUG) {
    console.log('[FIREFLY DEBUG] boxBefore=' + JSON.stringify(boxBefore) + ' boxAfter=' + JSON.stringify(boxAfter));
  }

  let rel = { x: (m.xPct + m.wPct / 2) / 100, y: (m.yPct + m.hPct / 2) / 100 };
  const src = imagePath ? imageDimensions(imagePath) : null;
  if (cropped && src?.width > 0 && src?.height > 0) {
    // Firefly crop ảnh về 9:16 bằng cách cắt giữa. Mask được cấu hình theo phần trảm
    // của ảnh gốc nên phải đổi sang phần trăm của khung đã cắt trước khi chấm.
    const ratio = 9 / 16;
    let cropW, cropH, offX, offY;
    if (src.width / src.height > ratio) {
      cropH = src.height; cropW = src.height * ratio; offX = (src.width - cropW) / 2; offY = 0;
    } else {
      cropW = src.width; cropH = src.width / ratio; offX = 0; offY = (src.height - cropH) / 2;
    }
    const px = rel.x * src.width;
    const py = rel.y * src.height;
    rel = {
      x: Math.min(1, Math.max(0, (px - offX) / cropW)),
      y: Math.min(1, Math.max(0, (py - offY) / cropH)),
    };
  }

  // Firefly đôi khi không nhận nét chấm đầu (UI còn transition), hoặc cửa sổ bị thu/thay đổi
  // layout ngay lúc chấm. Mỗi lần thử lấy LẠI box canvas để tính tọa độ mới, không dùng box cũ.
  let attempts = 0, ready = false, box = boxAfter, cx = 0, cy = 0;
  for (; attempts < 3 && !ready; attempts++) {
    if (attempts) await sleep(400);
    box = (await waitForMaskCanvas(page)).box;
    cx = box.x + rel.x * box.width;
    cy = box.y + rel.y * box.height;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(200);
    ready = !!(await waitClickable(page, [L.removeBtn, L.removeBtnText], { timeout: 2500, label: 'nút xóa sau khi chấm' }).catch(() => null));
  }
  if (!ready) throw new Error('Firefly không nhận nét chấm vào vùng logo. Hãy thử lại xóa logo.');
  return { box, mask: m, brush: brush.target, brushLabel: brush.label, point: { cx, cy }, attempts };
}

// Firefly hết free có 2 dạng: banner “hết lượt” hoặc màn hình mời “nâng cấp gói trả phí”.
// Cả hai đều là hết lượt free hàng ngày, không phải lỗi và không nên tự mua gói.
const QUOTA_TEXT_RE = /đã hết lượt|hết lượt (?:tạo|miễn phí|free|generative)|hôm nay còn 0 lượt|đã dùng hết số lượt tạo|đã đạt giới hạn|nâng cấp để tiếp tục tạo|nâng cấp[^.]{0,40}(?:trả phí|premium|pro|paid|để tiếp tục)|mua thêm lượt|mua thêm credit|out of generative credits|no generative credits|generation limit reached|daily limit reached|insufficient credits|quota exceeded|upgrade[^.]{0,40}(?:paid|premium|pro) plan|subscribe to continue|buy more credits|get more (?:generative )?credits/i;
const QUOTA_LOCATOR_RES = [
  /đã hết lượt|hết lượt|hôm nay còn 0 lượt|đã dùng hết số lượt tạo/i,
  /đã đạt giới hạn/i,
  /nâng cấp[^.]{0,40}(?:trả phí|premium|pro|paid|để tiếp tục)/i,
  /mua thêm lượt|mua thêm credit/i,
  /out of generative credits|no generative credits|insufficient credits/i,
  /generation limit reached|daily limit reached|quota exceeded/i,
  /upgrade[^.]{0,40}(?:paid|premium|pro) plan/i,
  /subscribe to continue|buy more credits|get more (?:generative )?credits/i,
];

function isQuotaText(text) {
  return QUOTA_TEXT_RE.test(String(text || ''));
}

function stateHasQuota(state) {
  // CHỈ tin body (text người dùng thấy được). deepText/uiText gồm cả tooltip ẨN và mã JS
  // của Firefly — từng làm tool tưởng hết lượt dù ảnh đã tải lên và còn lượt.
  return isQuotaText(state?.body);
}

async function detectQuotaBlock(page, state) {
  const st = state || await readPageState(page);
  // Banner quota nằm trong shadow DOM nên body.innerText thường không thấy: dùng locator,
  // nhưng phải kiểm tra TỪNG kết quả có isVisible() thật — không được đếm tooltip ẩn.
  if (stateHasQuota(st)) return true;
  for (const re of QUOTA_LOCATOR_RES) {
    const loc = page.getByText(re);
    const count = Math.min(await loc.count().catch(() => 0), 12);
    for (let i = 0; i < count; i++) {
      if (await loc.nth(i).isVisible().catch(() => false)) {
        if (process.env.FLOW_FIREFLY_DEBUG) console.log('[FIREFLY DEBUG] quota banner visible: ' + re.source);
        return true;
      }
    }
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
      const state = await readPageState(page);
      // Chỉ coi là hết lượt khi KHÔNG có nút tải: ảnh đã tạo thì vẫn cho tải tiếp.
      if (await detectQuotaBlock(page, state) && !(await downloadReady(page))) throw quotaError();
      await sleep(400);
    }
    throw new Error('Firefly chưa tạo xong ảnh để tải xuống.');
  } finally {
    page.off('download', onDownload);
  }
}

function quotaError() {
  return Object.assign(new Error('Firefly đang dùng lượt free hàng ngày và đã hết. Vui lòng đổi mail khác rồi tiếp tục.'), { code: 'FIREFLY_QUOTA' });
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
    loginKeepAlive = false; // đã bắt đầu xóa logo: không giữ cửa sổ đăng nhập cũ
    await chrome.hideWindow().catch(() => {}); // dời cửa sổ Firefly ra ngoài màn hình (vẫn full size), không ló lên lúc chạy
    await releaseTab(key); // clean old session
    const t = await getTab(key);
    const p = t.page;
    try {
      // Chạy Firefly hoàn toàn trong tab nền: KHÔNG showWindow/bringToFront,
      // bạn xem trực tiếp trong ô chiếu của app thay vì cửa sổ Chrome nổi lên.
      onPhase?.('Đang mở Adobe Firefly…');
      assertNotCanceled(isCanceled);
      if (!(await isLoggedIn(p))) throw loginError();
      // 5 giây đầu Firefly xác nhận tài khoản: chờ MỘT LẦN cho cả tab, không chờ lại ở editor.
      if (!(await waitForFireflyReady(p))) throw loginError();

      onPhase?.('Đang mở Chỉnh sửa hình ảnh…');
      // getTab đã vào thẳng /image-editor; chỉ goto/bấm menu khi Adobe redirect sang trang chủ.
      let onEditor = /image-editor/i.test(p.url());
      if (!onEditor) {
        try {
          await p.goto(editorUrl(), { waitUntil: 'domcontentloaded', timeout: 45000 });
          onEditor = /image-editor/i.test(p.url());
        } catch (_) {}
      }
      if (!onEditor) {
        await clickEnabledAny(p, [L.imagesNav, L.imagesNavLegacy, L.imagesNavLink, L.imagesNavText], { label: 'mục Hình ảnh' }).catch(() => {});
        assertNotCanceled(isCanceled);
        await clickEnabledAny(p, [L.editImage, L.editImageText, L.editImageLegacy, L.editImageLink], { label: 'mục Chỉnh sửa hình ảnh' }).catch(() => {});
      }
      if (!(await waitForEditorReady(p))) throw loginError();
      assertNotCanceled(isCanceled);

      onPhase?.('Đang tải ảnh 2K lên Firefly…');
      await uploadImage(p, imagePath);
      await waitForCanvas(p);
      await dismissFireflyDialogs(p);
      if (await detectQuotaBlock(p)) throw quotaError();
      assertNotCanceled(isCanceled);

      onPhase?.('Đang cắt ảnh về khung chuẩn 9:16…');
      const ratio916 = await selectAspect916(p);
      onPhase?.(ratio916 ? 'Đã cắt ảnh về khung chuẩn 9:16.' : 'Không tìm thấy nút chọn 9:16, giữ khung ảnh gốc.');

      onPhase?.('Đang bấm công cụ Chấm sửa và xóa…');
      await clickEnabledAny(p, [L.removeObject, L.removeObjectText], { label: 'công cụ Chấm sửa và xóa' });
      assertNotCanceled(isCanceled);

      onPhase?.(`Đang mở Cài đặt cọ, chọn cỡ ${cfg.get().logoBrushSize}…`);
      onPhase?.('Đang chấm vào đúng vùng logo trên ảnh 9:16…');
      await applyBrush(p, cfg.get().logoRemoveMask, imagePath, cfg.get().logoBrushSize, ratio916);
      if (await detectQuotaBlock(p)) throw quotaError();

      onPhase?.('Đang bấm Xóa để Firefly xóa logo…');
      await clickEnabledAny(p, [L.removeBtn, L.removeBtnText], { timeout: 30000, label: 'nút xóa/áp dụng' });
      onPhase?.('Đang chờ Firefly báo “Đã hoàn tất thao tác tạo sinh”…');
      await waitForRemovalComplete(p);
      assertNotCanceled(isCanceled);

      onPhase?.('Đã xóa logo trên Firefly. Chờ bạn bấm “Ổn” để tải xuống.');
      return { ok: true, key };
    } catch (e) {
      if (process.env.FLOW_FIREFLY_DEBUG) {
        await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'flb-firefly-debug.png') }).catch(() => {});
        console.log('[FIREFLY DEBUG] screenshot saved, error=' + e.message);
      }
      // Lỗi/quota/hủy: đóng tab nền Firefly, không để nặng máy hay tồn session cũ.
      await releaseTab(key);
      // Hết lượt: mở lại 1 cửa sổ Firefly nhìn thấy được để bạn tự đăng nhập Gmail khác.
      if (e?.code === 'FIREFLY_QUOTA') await open().catch(() => {});
      throw e;
    }
  });
}

// Ảnh Firefly tải về thường thấp hơn ảnh 2K gốc vài px. Ép đúng chiều rộng/cao của ảnh gốc
// bằng canvas trên chính tab Firefly: crop giữa theo tỷ lệ gốc rồi scale, không làm méo ảnh.
// Trả về null thì giữ nguyên ảnh đã tải (không làm hỏng cả lượt xóa logo).
async function fitImageToSize(page, file, size) {
  try {
    if (!size?.width || !size?.height) return null;
    const b64 = fs.readFileSync(file).toString('base64');
    const out = await page.evaluate(async ({ b64, w, h }) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u8]));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      const scale = Math.max(w / bmp.width, h / bmp.height);
      const sw = w / scale, sh = h / scale;
      g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return c.toDataURL('image/png').split(',')[1];
    }, { b64, w: size.width, h: size.height });
    const buf = Buffer.from(out || '', 'base64');
    return buf.length > 1024 ? buf : null;
  } catch (_) {
    return null;
  }
}

async function downloadPrepared({ projectId, sceneId, targetPath, matchSize, onPhase, isCanceled }) {
  return lock.run(async () => {
    const key = `${projectId}:${sceneId}`;
    const pr = tabs.get(key);
    if (!pr) throw new Error('Không còn phiên Firefly của cảnh này. Hãy bấm “Làm lại xóa logo”.');
    const t = await pr;
    const p = t.page;
    const tmp = targetPath + '.part';
    try {
      assertNotCanceled(isCanceled);
      // Tải ảnh cũng giữ Chrome ở nền, không làm cửa sổ nổi lên.
      // Banner hết lượt có thể còn hiện dù ảnh đã tạo xong: có nút Tải xuống thì vẫn tải.
      if (!(await downloadReady(p)) && await detectQuotaBlock(p)) throw quotaError();

      onPhase?.('Đang bấm nút Tải xuống trên Firefly…');
      const download = await waitForDownloadClick(p);
      onPhase?.('Đã bấm Tải xuống, đang lưu ảnh sạch vào anhdaxoalogo…');
      assertNotCanceled(isCanceled);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      await download.saveAs(tmp);
      const size = imageDimensions(tmp);
      if (!size || !size.width || !size.height) throw new Error('File tải về từ Firefly không đọc được.');
      const finalExt = path.extname(download.suggestedFilename() || '') || path.extname(targetPath) || '.png';
      const final = targetPath.replace(/\.[^.\\/]+$/, '') + finalExt;
      fs.rmSync(final, { force: true });
      fs.renameSync(tmp, final);
      let outSize = size;
      // Chiều rộng/cao của file sạch phải BẰNG file gốc để so sánh 1-1 trong Bước 4.
      if (matchSize?.width && matchSize?.height && (size.width !== matchSize.width || size.height !== matchSize.height)) {
        onPhase?.('Đang chỉnh ảnh sạch đúng kích thước ảnh gốc…');
        const png = await fitImageToSize(p, final, matchSize);
        if (png) {
          const targetPng = /\.png$/i.test(targetPath) ? targetPath : targetPath.replace(/\.[^.\\/]+$/, '') + '.png';
          fs.rmSync(targetPng, { force: true });
          fs.writeFileSync(targetPng, png);
          if (final !== targetPng) fs.rmSync(final, { force: true });
          final = targetPng;
          outSize = { width: matchSize.width, height: matchSize.height };
        }
      }
      onPhase?.('Đã tải ảnh sạch về máy.');
      return { ok: true, file: final, width: outSize.width, height: outSize.height };
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      // Lỗi / hết lượt / tạm dừng: đóng tab Firefly ngay, không giữ process Chrome ăn RAM.
      // Ảnh bị chặn sẽ được tạo lại đúng ảnh đó bằng Gmail mới (không làm lại ảnh đã xong).
      throw e;
    } finally {
      await releaseTab(key);
    }
  });
}

// Giữ lại cho dữ liệu cũ: giờ Firefly đóng tab ngay khi lỗi/tạm dừng nên hầu như luôn trả false.
function hasSceneTab(projectId, sceneId) {
  return tabs.has(`${projectId}:${sceneId}`);
}

async function discardScene({ projectId, sceneId }) {
  return lock.run(async () => { await releaseTab(`${projectId}:${sceneId}`); });
}

// Đóng toàn bộ Chrome Firefly khi tắt tool (không đụng Chrome đang chạy Flow).
async function closeAll() {
  return lock.run(async () => {
    cancelIdleClose();
    loginKeepAlive = false;
    for (const [key, pr] of [...tabs]) {
      tabs.delete(key);
      try { const t = await pr; await detachPreview(t); await t.page.close().catch(() => {}); } catch (_) {}
    }
    await chrome.close().catch(() => {});
  });
}

// Chiếu TRỰC TIẾP nguyên tab Chrome của cảnh đang xóa, từ lúc tạo tab đến lúc Firefly báo xong.
// Không phóng to/cắt canvas, không gọi showWindow/bringToFront nên Chrome không nổi lên.
// Không truyền clip: chụp đúng viewport tab nên khung cố định, không giật khi canvas Firefly đổi kích thước.
let previewCache = { key: '', at: 0, data: '' };
async function detachPreview(tab) {
  if (!tab?.cdp) return;
  try { await tab.cdp.detach(); } catch (_) {}
  tab.cdp = null;
}
async function preview({ projectId, sceneId } = {}) {
  if (!projectId || !sceneId) return { ok: false };
  if (!(await chrome.isRunning())) return { ok: false };
  const key = `${projectId}:${sceneId}`;
  // Chỉ lấy ĐÚNG tab của cảnh này, không vớt tab cảnh khác trong cùng dự án.
  const pr = tabs.get(key);
  if (!pr) return { ok: false };
  const tab = await pr.catch(() => null);
  const page = tab?.page;
  if (!page || page.isClosed()) return { ok: false };
  // Chỉ chiếu đúng tab /image-editor CỦA CẢNH NÀY — không vớt tab Firefly gốc/trang chủ.
  if (!/image-editor/i.test(page.url())) return { ok: false };
  const now = Date.now();
  // Cache rất ngắn để app poll 500ms mượt, không tạo lại session CDP mỗi lần.
  if (previewCache.key === key && now - previewCache.at < 180) return { ok: true, data: previewCache.data };
  const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview timeout')), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
  try {
    if (!tab.cdp) {
      tab.cdp = await withTimeout(page.context().newCDPSession(page), 1500);
      // Giữ trang ở trạng thái focus dù cửa sổ đang thu nhỏ: Chrome không ngừng vẽ,
      // nên khung chiếu không bị đen/đứng khi bạn minimize hoặc khi tool ẩn cửa sổ.
      await tab.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    }
    // Không truyền vùng cắt — CDP chụp đúng viewport tab (ổn định, không nhảy theo box canvas).
    const shot = await withTimeout(tab.cdp.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 82, optimizeForSpeed: true, fromSurface: false, captureBeyondViewport: false,
    }), 2500);
    const data = shot?.data || '';
    if (!data) { await detachPreview(tab); return { ok: false }; }
    previewCache = { key, at: Date.now(), data: `data:image/jpeg;base64,${data}` };
    return { ok: true, data: previewCache.data };
  } catch (_) { await detachPreview(tab); return { ok: false }; }
}

module.exports = {
  status, open, reveal, background, preview,
  prepareScene, downloadPrepared, discardScene, hasSceneTab,
  closeProjectTabs, closeAll, closeIdleNow,
  _test: { normalizeMask, fireflyHome, editorUrl, isQuotaText, isRemovalDone, waitForFireflyReady, clickEnabledAny, readPageState, selectAspect916, setBrushSize, findCanvas, applyBrush },
};