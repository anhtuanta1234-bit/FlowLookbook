// Điều khiển Google Flow qua Chrome thật (Playwright + CDP).
// Mọi chỗ phụ thuộc giao diện Flow nằm trong file này (SEL + L + các hàm nhỏ) để dễ sửa khi Flow đổi giao diện.
// Mỗi "khóa" (key) = một dự án Flow riêng = một tab riêng. Bước 1, bước 2 và MỖI CẢNH ở bước 3 đều có khóa riêng.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('./config');
const chrome = require('./chrome');
const { validate2kFile } = require('./image');

const FLOW_HOME = 'https://flow.google.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const human = () => { const c = cfg.get(); if (c.fastMode) return sleep(50 + Math.random() * 100); const [a, b] = c.humanDelayMs; return sleep(a + Math.random() * (b - a)); };

// ---- selector gom một chỗ ----
const SEL = {
  tile: 'flow-grid-tile-container',
};
const L = {
  newProject: (p) => p.getByRole('button', { name: /Dự án mới/ }).first(),
  composer: (p) => p.getByRole('textbox', { name: /Bạn muốn tạo/ }).first(),
  plus: (p) => p.getByRole('button', { name: /Thêm thành phần/ }).first(),
  submit: (p) => p.getByRole('button', { name: /Bắt đầu tạo/ }).first(),
  // nút cài đặt model/tỉ lệ/số ảnh; aria-label "Điều kiện kích hoạt cài đặt", chữ hiển thị chứa tên model.
  // (TUYỆT ĐỐI không bấm nút "Tác nhân" bên cạnh)
  chip: (p) => p.locator('button', { hasText: /Nano Banana|Veo/ }).first(),
  reuse: (tile) => tile.getByRole('button', { name: /Sử dụng lại câu lệnh/ }).first(),
};

class Lock {
  constructor() { this.p = Promise.resolve(); }
  run(fn) { const r = this.p.then(fn, fn); this.p = r.catch(() => {}); return r; }
}

class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.waiters = []; }
  // Đổi giới hạn ngay khi người dùng sửa cài đặt: tăng thì đánh thức bớt việc đang chờ,
  // giảm thì các việc đang chạy cứ chạy xong rồi mới thu về đúng mức mới.
  setLimit(n) {
    const next = Math.max(1, Math.floor(n) || 1);
    this.limit = next;
    while (this.waiters.length && this.active < this.limit) {
      this.active++;
      this.waiters.shift()();
    }
  }
  async run(fn) {
    if (this.active >= this.limit) await new Promise((resolve) => this.waiters.push(resolve));
    else this.active++;
    try { return await fn(); }
    finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}

// ---------------- trạng thái ----------------
async function status() {
  const c = cfg.get();
  const http = require('http');
  const up = await new Promise((res) => {
    const r = http.get({ host: '127.0.0.1', port: c.cdpPort, path: '/json/list', timeout: 1200 }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x)); resp.on('end', () => { try { res(JSON.parse(d)); } catch (_) { res(null); } });
    });
    r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); });
  });
  if (!up) return { browser: false, loggedIn: false };
  const pages = up.filter((t) => t.type === 'page');
  const loggedIn = pages.some((t) => /^https:\/\/flow\.google\.com\/(project|$|\?)/.test(t.url) && !/accounts\.google/.test(t.url));
  const onLogin = pages.some((t) => /accounts\.google\.com/.test(t.url));
  return { browser: true, loggedIn, onLogin };
}

// Hiện cửa sổ Chrome để đăng nhập / xem; còn lại tool chạy ngầm.
async function open() { await chrome.ensureBrowser({ visible: true }); await chrome.showWindow(); }
const hide = () => chrome.hideWindow().catch(() => {});
// Hiện cửa sổ Chrome và đưa tới đúng dự án Flow (để người dùng tự xem/xử lý lỗi trực tiếp).
async function reveal(url) {
  await chrome.ensureBrowser({ visible: true });
  await chrome.showWindow();
  const ctx = await chrome.getContext();
  const norm = (u) => String(u || '').split('?')[0].replace(/\/$/, '');
  const target = url || FLOW_HOME; // chưa có dự án Flow (lỗi xảy ra trước khi tạo) thì mở trang chủ Flow
  let pg = ctx.pages().find((x) => norm(x.url()) === norm(target)) || (!url ? ctx.pages().find((x) => /flow.google.com/.test(x.url())) : null);
  if (!pg) { pg = (ctx.pages().find((x) => x.url() === 'about:blank')) || await ctx.newPage(); await pg.goto(target, { waitUntil: 'domcontentloaded' }).catch(() => {}); }
  await pg.bringToFront().catch(() => {});
}

async function isLoggedIn(page) {
  if (/accounts\.google\.com/.test(page.url())) return false;
  return page.getByRole('button', { name: /Tài khoản Google|Thông tin về tài khoản/ }).first().isVisible().catch(() => false);
}

// ---------------- tab = dự án Flow ----------------
const tabs = new Map(); // key -> Promise<tab>

async function newFlowProject(page) {
  await page.goto(FLOW_HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (!(await isLoggedIn(page))) throw new Error('Chưa đăng nhập Google trong Chrome của tool. Bấm "Mở Chrome / đăng nhập" ở góc trên rồi đăng nhập.');
  await L.newProject(page).click({ force: true, timeout: 20000 });
  await page.waitForURL(/\/project\//, { timeout: 30000 });
  await L.composer(page).waitFor({ timeout: 30000 });
  return page.url();
}

// Lấy (hoặc tạo) tab của một dự án Flow. url có sẵn -> mở lại đúng dự án; chưa có -> bấm "Dự án mới".
function getTab({ key, url, onUrl }) {
  const existing = tabs.get(key);
  if (existing) return existing.then((t) => { t.users++; return t; });
  const pr = (async () => {
    const page = await chrome.newBackgroundPage();
    const t = { key, page, lock: new Lock(), settingsOk: false, uploaded: new Map(), users: 1, url: null };
    try {
      if (url) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await L.composer(page).waitFor({ timeout: 30000 }).catch(async () => {
          if (!(await isLoggedIn(page))) throw new Error('Chưa đăng nhập Google trong Chrome của tool.');
          throw new Error('Không mở được dự án Flow. Thử lại.');
        });
        t.url = page.url();
      } else {
        t.url = await newFlowProject(page);
        onUrl && onUrl(t.url);
      }
    } catch (e) { await page.close().catch(() => {}); tabs.delete(key); throw e; }
    return t;
  })();
  tabs.set(key, pr);
  pr.catch(() => tabs.delete(key));
  return pr;
}

async function releaseTab(t) {
  if (--t.users > 0) return;
  tabs.delete(t.key);
  await t.page.close().catch(() => {});
}

// Đóng đúng tab Flow của một bước/cảnh. generate() đã release tab khi lỗi, nhưng đề phòng
// tab còn sót thì đóng hẳn để lần sau chắc chắn mở cửa sổ Flow + dự án mới.
async function closeSceneTab(projectId, stage, sceneId) {
  const key = `${projectId}:${stage}${sceneId ? ':' + sceneId : ''}`;
  const pr = tabs.get(key);
  if (!pr) return 0;
  tabs.delete(key);
  try {
    const t = await pr;
    if (t.users > 1) { t.users--; return 0; }
    await t.page.close().catch(() => {});
  } catch (_) {}
  return 1;
}

// Đóng ngay các tab Flow của một dự án (dùng khi bạn xóa dự án: không để Flow chạy tiếp việc của dự án đó).
async function closeProjectTabs(projectId) {
  const prefix = projectId + ':';
  const closing = [];
  for (const [key, pr] of [...tabs]) {
    if (!key.startsWith(prefix)) continue;
    tabs.delete(key);
    closing.push(pr.then((t) => t.page.close().catch(() => {})).catch(() => {}));
  }
  // đóng luôn các tab đang tải 2K của dự án này (không để Flow chạy tiếp việc đã bị bỏ)
  for (const entry of [...dlPages]) {
    if (entry.projectId !== projectId) continue;
    dlPages.delete(entry);
    closing.push(entry.page.close().catch(() => {}));
  }
  await Promise.all(closing);
  return closing.length;
}

// Dọn tab Flow còn sót của lần chạy trước (chỉ gọi lúc khởi động tool, khi chưa có việc nào đang chạy).
// Giữ lại tab đầu của cửa sổ, chỉ đóng các tab dự án mở ở nền.
async function closeStrayTabs() {
  if (!(await chrome.isRunning())) return 0;
  const ctx = await chrome.getContext();
  const pages = ctx.pages();
  let closed = 0;
  for (const page of pages.slice(1)) {
    const u = page.url();
    if (!/^https:\/\/flow\.google\.com\/project\//.test(u)) continue;
    await page.close().catch(() => {});
    closed++;
  }
  return closed;
}

// ---------------- cài đặt: 9:16, số ảnh, model ----------------
async function chipText(p) { return (await L.chip(p).innerText()).replace(/\s+/g, ' '); }

async function ensureSettings(t) {
  const p = t.page; const c = cfg.get();
  const txt = await chipText(p);
  if (new RegExp(`crop_9_16.*x${c.imagesPerRun}\\b`).test(txt) && /2\.1/.test(txt)) { t.settingsOk = true; return; }
  await L.chip(p).click({ force: true });
  await human();
  // các lựa chọn là role=radio với chữ kiểu "crop_9_16 9:16", "x4"
  await p.locator('[role=radio]', { hasText: /9:16/ }).first().click({ force: true });
  await p.locator('[role=radio]', { hasText: new RegExp(`^\\s*x${c.imagesPerRun}\\s*$`) }).first().click({ force: true });
  await human();
  if (!/2\.1/.test(await chipText(p))) {
    await p.getByRole('button', { name: /Chọn nhóm mô hình/ }).click({ force: true });
    await p.getByText('Nano Banana 2.1', { exact: true }).last().click({ force: true });
  }
  await p.keyboard.press('Escape');
  await human();
  const after = await chipText(p);
  if (!new RegExp(`x${c.imagesPerRun}\\b`).test(after) || !/crop_9_16/.test(after)) throw new Error('Không đặt được 9:16 / x' + c.imagesPerRun + ' trên Flow. Giao diện: ' + after);
  t.settingsOk = true;
}

// ---------------- ô nhập câu lệnh ----------------
// Số ảnh đang đính kèm: khối nhỏ nhất chứa cả ô gõ lẫn nút "Bắt đầu tạo", đếm <img>.
async function composerAttachCount(p) {
  return p.evaluate(() => {
    const submit = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Bắt đầu tạo');
    const box = [...document.querySelectorAll('[role=textbox]')].find((e) => /Bạn muốn tạo/.test(e.getAttribute('aria-label') || ''));
    if (!submit || !box) return 0;
    let el = submit;
    while (el && !el.contains(box)) el = el.parentElement;
    return el ? el.querySelectorAll('img').length : 0;
  });
}

// Đảm bảo hộp chọn ảnh đã đóng và mọi lớp phủ (tooltip/metadata) đã tắt — lớp phủ còn mở sẽ chặn mọi cú bấm.
async function closePicker(p) {
  // Di chuyển chuột ra vùng trống để tắt tooltip "Ngày tạo..." đang phủ lên nút.
  await p.mouse.move(5, 5).catch(() => {});
  const search = p.getByPlaceholder(/Tìm kiếm thành phần/).first();
  for (let i = 0; i < 4; i++) {
    if (!(await search.isVisible().catch(() => false)) && (await p.locator('.cdk-overlay-backdrop-showing').count()) === 0 && (await p.locator('.cdk-overlay-container .metadata-row:visible').count()) === 0) return;
    await p.keyboard.press('Escape');
    await sleep(200);
  }
  await p.locator('.cdk-overlay-backdrop-showing').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  await p.mouse.move(5, 5).catch(() => {});
}

// Mục ảnh THẬT trong hộp chọn (có thêm chữ "Hình ảnh"); tránh nhầm với nút cùng tên ở lưới dự án phía sau hộp chọn.
const pickerItem = (p, name) => p.locator('button:visible', { hasText: name }).filter({ hasText: 'Hình ảnh' }).first();

// Sau khi bấm 1 mục ảnh: Flow có lúc thêm luôn vào câu lệnh, có lúc cần bấm "Thêm vào câu lệnh". Xử lý cả hai.
async function confirmAdd(p, before) {
  const t1 = Date.now();
  while (Date.now() - t1 < 5000) {
    if ((await composerAttachCount(p)) > before) return;
    const btn = p.locator('button:visible', { hasText: /Thêm vào câu lệnh/ }).first();
    if (await btn.count()) { await btn.click().catch(() => {}); return; }
    await sleep(250);
  }
}

// Chép file sang tên duy nhất để chọn đúng ảnh vừa upload trong danh sách (nhiều ảnh có thể trùng tên).
function uniqueCopy(file) {
  const dir = path.join(os.tmpdir(), 'flow-lookbook-upload');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file) || '.png';
  const name = `fl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const dest = path.join(dir, name + ext);
  fs.copyFileSync(file, dest);
  return { dest, name };
}

const fileKey = (f) => { const s = fs.statSync(f); return `${path.resolve(f)}|${s.size}|${s.mtimeMs}`; };

async function attachFile(t, file) {
  const p = t.page;
  const before = await composerAttachCount(p);
  const key = fileKey(file);
  const known = t.uploaded.get(key);
  const { dest, name } = known ? { dest: null, name: known } : uniqueCopy(file);
  try {
    await closePicker(p);
    await L.plus(p).click({ force: true });
    await human();
    if (!known) {
      const [chooser] = await Promise.all([
        p.waitForEvent('filechooser', { timeout: 15000 }),
        p.locator('button', { hasText: /Tải nội dung nghe nhìn lên/ }).first().click({ force: true }),
      ]);
      await chooser.setFiles(dest);
    } else {
      await p.getByPlaceholder(/Tìm kiếm thành phần/).first().fill(name);
    }
    const item = pickerItem(p, name);
    await item.waitFor({ timeout: 90000 }).catch(() => { throw new Error('Tải ảnh lên Flow quá lâu hoặc thất bại: ' + path.basename(file)); });
    const expected = await item.locator('img').first().getAttribute('src').catch(() => null);
    t.uploaded.set(key, name);
    await item.click({ force: true });
    await human();
    await confirmAdd(p, before);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      if ((await composerAttachCount(p)) > before) { await closePicker(p); return expected; }
      await sleep(200);
    }
    throw new Error('Flow không đính ảnh vào ô nhập: ' + path.basename(file));
  } catch (e) {
    await closePicker(p).catch(() => {});
    throw e;
  } finally {
    if (dest) fs.rmSync(dest, { force: true });
  }
}

// Các ảnh đang đính kèm trong ô nhập, theo đúng thứ tự hiện trong ô.
async function composerThumbSrcs(p) {
  return p.evaluate(() => {
    const submit = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Bắt đầu tạo');
    const box = [...document.querySelectorAll('[role=textbox]')].find((e) => /Bạn muốn tạo/.test(e.getAttribute('aria-label') || ''));
    if (!submit || !box) return [];
    let el = submit; while (el && !el.contains(box)) el = el.parentElement;
    return el ? [...el.querySelectorAll('img')].map((i) => i.currentSrc || i.src) : [];
  });
}
const srcBase = (u) => String(u || '').split('?')[0].replace(/=[sw]\d+[^/]*$/i, '');

async function verifyComposerOrder(p, expected) {
  const got = (await composerThumbSrcs(p)).map(srcBase);
  const want = expected.map(srcBase);
  if (!want.length || got.length !== want.length || want.some((src) => !src) || got.some((src) => !src)) {
    throw new Error('Không thể xác minh đầy đủ ảnh tham chiếu trong Flow. Tool đã dừng để tránh tạo ảnh với ảnh sai hoặc thiếu.');
  }
  if (want.some((src, i) => got[i] !== src)) {
    throw new Error('Thứ tự ảnh trong ô nhập của Flow bị lệch. Tool đã dừng để không gửi sai thứ tự.');
  }
  return { verified: true, count: got.length };
}

// Gửi TẤT CẢ ảnh đầu vào lên Flow trong MỘT lượt chọn file (nhanh hơn tải từng ảnh), rồi thêm vào ô nhập ĐÚNG THỨ TỰ
// ảnh 1, 2, 3, 4… Cuối cùng kiểm tra lại thứ tự trong ô nhập; nếu lệch thì dừng, không gửi sai thứ tự.
async function attachFiles(t, files) {
  const p = t.page;
  const items = files.map((file) => { const key = fileKey(file); return { file, key, name: t.uploaded.get(key) || null }; });
  const fresh = items.filter((x) => !x.name);
  if (fresh.length) {
    const copies = fresh.map((x) => { const c = uniqueCopy(x.file); x.name = c.name; return c; });
    try {
      await closePicker(p);
      await L.plus(p).click({ force: true });
      await human();
      const [chooser] = await Promise.all([
        p.waitForEvent('filechooser', { timeout: 15000 }),
        p.locator('button', { hasText: /Tải nội dung nghe nhìn lên/ }).first().click({ force: true }),
      ]);
      if (copies.length > 1 && !chooser.isMultiple()) throw new Error('MULTI_UNSUPPORTED');
      await chooser.setFiles(copies.map((c) => c.dest));
      // đợi tất cả ảnh vừa tải lên hiện trong danh sách (Flow xử lý song song)
      for (const x of fresh) {
        await pickerItem(p, x.name).waitFor({ timeout: 120000 })
          .catch(() => { throw new Error('Tải ảnh lên Flow quá lâu hoặc thất bại: ' + path.basename(x.file)); });
        t.uploaded.set(x.key, x.name);
      }
      await closePicker(p);
    } finally { for (const c of copies) fs.rmSync(c.dest, { force: true }); }
  }
  // thêm vào ô nhập lần lượt đúng thứ tự (ảnh đã tải sẵn nên mỗi ảnh chỉ vài giây)
  const expected = [];
  for (const x of items) {
    const before = await composerAttachCount(p);
    await closePicker(p);
    await L.plus(p).click({ force: true });
    await human();
    await p.getByPlaceholder(/Tìm kiếm thành phần/).first().fill(x.name);
    const item = pickerItem(p, x.name);
    await item.waitFor({ timeout: 30000 });
    expected.push(await item.locator('img').first().getAttribute('src').catch(() => null));
    await item.click({ force: true });
    await human();
    await confirmAdd(p, before);
    const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 30000) { if ((await composerAttachCount(p)) > before) { ok = true; break; } await sleep(150); }
    if (!ok) throw new Error('Flow không đính ảnh vào ô nhập: ' + path.basename(x.file));
    await closePicker(p);
  }
  if (cfg.get().fastMode) return { verified: true, count: items.length, skipped: true };
  return verifyComposerOrder(p, expected);
}

// ---------------- KÉO-THẢ ảnh thẳng vào khung nhập (nhanh hơn bấm dấu +) ----------------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// Thả các file vào khung nhập của Flow (giống kéo ảnh từ máy vào). Trả về khi Flow đã đính đủ số ảnh.
async function dropOnComposer(p, list, timeoutMs) {
  const before = await composerAttachCount(p);
  const payload = list.map((f) => ({ name: path.basename(f), type: MIME[path.extname(f).toLowerCase()] || 'image/png', b64: fs.readFileSync(f).toString('base64') }));
  const hit = await p.evaluate(async (payload) => {
    const submit = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Bắt đầu tạo');
    const box = [...document.querySelectorAll('[role=textbox]')].find((e) => /Bạn muốn tạo/.test(e.getAttribute('aria-label') || ''));
    if (!submit || !box) return false;
    let el = submit; while (el && !el.contains(box)) el = el.parentElement;
    const target = el || box;
    const dt = new DataTransfer();
    for (const f of payload) {
      const bin = atob(f.b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      dt.items.add(new File([u8], f.name, { type: f.type }));
    }
    const r = target.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, o));
    return true;
  }, payload);
  if (!hit) throw new Error('Không tìm thấy khung nhập của Flow để thả ảnh.');
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if ((await composerAttachCount(p)) >= before + list.length) return;
    await sleep(400);
  }
  throw new Error('Thả ảnh vào Flow nhưng Flow không đính đủ ảnh (quá thời gian).');
}

// Dấu vân tay nhỏ (16x16 xám) của ảnh để so khớp ảnh gốc với ảnh thu nhỏ trong khung nhập.
async function fingerprints(ctx, p, originals, thumbs) {
  const loaded = [];
  for (const s of thumbs) {
    let b64 = await p.evaluate(async (u) => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const r = await fetch(u, { signal: controller.signal });
        if (!r.ok) return null;
        const b = new Uint8Array(await r.arrayBuffer()); let s = '';
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        return btoa(s);
      } catch (_) { return null; } finally { clearTimeout(timer); }
    }, s);
    if (!b64) {
      try {
        const r = await ctx.request.get(s, { timeout: 8000 });
        b64 = r.ok() ? (await r.body()).toString('base64') : null;
      } catch (_) { b64 = null; }
    }
    loaded.push(b64);
  }
  const origB64 = originals.map((f) => fs.readFileSync(f).toString('base64'));
  return p.evaluate(async ({ a, b }) => {
    const hash = async (b64) => {
      if (!b64) return null;
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u8]));
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16); g.drawImage(bmp, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data; const v = [];
      for (let i = 0; i < d.length; i += 4) v.push(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      const m = v.reduce((x, y) => x + y, 0) / v.length;
      return v.map((x) => x - m);
    };
    return { orig: await Promise.all(a.map(hash)), thumb: await Promise.all(b.map(hash)) };
  }, { a: origB64, b: loaded });
}

// Mỗi ảnh trong khung nhập → ảnh gốc giống nhất. Trả về mảng chỉ số (null nếu không so được).
function matchOrder(fp) {
  if (!fp.thumb.length || fp.thumb.some((x) => !x) || fp.orig.some((x) => !x)) return null;
  const dist = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2; return s; };
  return fp.thumb.map((th) => { let bi = 0, bd = Infinity; fp.orig.forEach((o, i) => { const d = dist(th, o); if (d < bd) { bd = d; bi = i; } }); return bi; });
}

// Kéo-thả TẤT CẢ ảnh cùng lúc; kiểm tra thứ tự ảnh 1, 2, 3… trong khung. Nếu Flow xếp sai thứ tự → nạp lại trang và thả LẦN LƯỢT
// từng ảnh (đợi ảnh trước vào khung rồi mới thả ảnh sau) cho đúng thứ tự, rồi kiểm tra lại. Vẫn sai thì dừng, không gửi.
let dropOk = null; // null = chưa biết; false = Flow không nhận kéo-thả vào khung nhập (chỉ tải ảnh lên dự án) -> khỏi thử lại
async function attachByDrop(t, files) {
  if (dropOk === false) throw new Error('DROP_UNSUPPORTED');
  const p = t.page; const ctx = p.context();
  const n = files.length;
  await closePicker(p);
  if ((await composerAttachCount(p)) > 0) { await p.reload({ waitUntil: 'domcontentloaded' }); t.settingsOk = false; await sleep(2500); await ensureSettings(t); }
  const check = async () => {
    await sleep(2500); // chờ ảnh thu nhỏ tải xong
    const thumbs = (await composerThumbSrcs(p));
    if (thumbs.length !== n) return { ok: false, why: `khung có ${thumbs.length}/${n} ảnh` };
    const order = matchOrder(await fingerprints(ctx, p, files, thumbs));
    if (!order) return { ok: true, verified: false };
    return order.every((v, i) => v === i) ? { ok: true, verified: true } : { ok: false, why: 'thứ tự ' + order.map((v) => v + 1).join(',') };
  };
  try { await dropOnComposer(p, files, dropOk ? 120000 : 15000); }
  catch (e) { if (dropOk === null) dropOk = false; throw e; }
  dropOk = true;
  let r = await check();
  if (r.ok) return r;
  if (n > 1) { // làm lại từng ảnh một
    await p.reload({ waitUntil: 'domcontentloaded' }); t.settingsOk = false; await sleep(2500); await ensureSettings(t);
    for (const f of files) {
      const before = await composerAttachCount(p);
      await dropOnComposer(p, [f], 90000);
      const t0 = Date.now(); while (Date.now() - t0 < 15000 && (await composerAttachCount(p)) < before + 1) await sleep(300);
      await human();
    }
    r = await check();
    if (r.ok) return r;
  }
  throw new Error('Ảnh trong khung nhập của Flow không đúng thứ tự (' + r.why + '). Tool đã dừng để không gửi sai.');
}

// ---------------- ô ảnh (tile) ----------------
const tileCount = (p) => p.locator(SEL.tile).count();

async function tagNewest(p, tag, n) {
  return p.evaluate(({ sel, tag, n }) => {
    let k = 0;
    for (const el of document.querySelectorAll(sel)) { if (k >= n) break; if (!el.dataset.fl) { el.dataset.fl = tag; k++; } }
    return k;
  }, { sel: SEL.tile, tag, n });
}

async function readTag(p, tag) {
  return p.evaluate(({ sel, tag }) => [...document.querySelectorAll(sel)].filter((e) => e.dataset.fl === tag).map((e) => {
    const img = e.querySelector('img[data-media-id]');
    const txt = (e.innerText || '').trim();
    const m = txt.match(/(\d{1,3})\s*%/);
    return { mediaId: img?.dataset.mediaId || null, src: img && img.complete && img.naturalWidth > 100 ? img.src : null, pct: m ? +m[1] : null, text: txt.slice(0, 120) };
  }), { sel: SEL.tile, tag });
}

// Địa chỉ ảnh ở lưới Flow kết thúc bằng "=s512-rw" (bản nhỏ, nén mạnh -> mờ). Đổi thành "=s0" là bản GỐC đầy đủ,
// đúng bản Flow tải khi bạn mở ảnh ra xem chi tiết.
const fullUrl = (u) => u.replace(/=s\d+(?:-[a-z]+)*(?=$|\?)/i, '=s0');
async function getBytes(ctx, src) {
  const full = fullUrl(src);
  for (const u of full !== src ? [full, src] : [src]) {
    try {
      const r = await ctx.request.get(u, { timeout: 12000 });
      const type = r.headers()['content-type'] || '';
      if (r.ok() && /^image\//.test(type)) return { buffer: await r.body(), ext: /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : 'png', full: u === full && full !== src };
    } catch (_) { /* thử địa chỉ kế tiếp */ }
  }
  throw new Error('Không tải được ảnh xem trước từ Flow.');
}

const BAD = /không thành công|thất bại|lỗi|failed|error/i;
// Flow cảnh báo nghi tự động hóa: DỪNG ngay, không thử lại, không tìm cách né.
const ABUSE = /hoạt động bất thường|unusual activity|suspicious activity/i;

// ---------------- gõ prompt vào Flow: BẢO ĐẢM ĐÚNG TỪNG CHỮ ----------------
// Đối chiếu bỏ MỌI khoảng trắng/xuống dòng (Flow có thể trình bày lại chỗ xuống dòng),
// nhưng toàn bộ CHỮ phải có đủ, đúng thứ tự, không thừa không thiếu. Nghiêm cấm gửi sai / lệch prompt.
const normPrompt = (s) => String(s || '').replace(/\u00a0/g, '').replace(/\s+/g, '');
const readablePrompt = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Đọc đúng nội dung đang có trong ô nhập của Flow (hỗ trợ cả <textarea> lẫn ô contenteditable).
function readComposer(p) {
  return p.evaluate(() => {
    const box = [...document.querySelectorAll('[role=textbox]')].find((e) => /Bạn muốn tạo/.test(e.getAttribute('aria-label') || ''));
    if (!box) return null;
    if (typeof box.value === 'string') return box.value;
    return box.innerText || box.textContent || '';
  }).catch(() => null);
}

// Xóa sạch ô nhập (chọn hết rồi xóa; lặp vài lần cho chắc) để prompt mới KHÔNG bị nối thêm vào chữ cũ.
async function clearComposer(p) {
  await L.composer(p).click({ force: true });
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('Control+A');
    await p.keyboard.press('Delete');
    await sleep(100);
    const cur = await readComposer(p);
    if (cur !== null && normPrompt(cur) === '') return;
  }
}

// Gõ prompt rồi ĐỌC LẠI đối chiếu. Lệch thì xóa rồi gõ lại; vẫn lệch thì DỪNG, tuyệt đối không bấm tạo.
async function setPromptVerified(p, prompt) {
  const want = normPrompt(prompt);
  if (!want) throw new Error('Prompt gửi Flow đang trống.');
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    await clearComposer(p);
    await L.composer(p).click({ force: true });
    await p.keyboard.insertText(prompt);
    await sleep(250);
    raw = (await readComposer(p)) || '';
    if (normPrompt(raw) === want) return;
  }
  const e = new Error('Ô nhập của Flow không khớp prompt chuẩn nên tool đã DỪNG, không gửi để tránh sai prompt.'
    + '\n• Mong đợi: ' + readablePrompt(prompt).slice(0, 140)
    + '\n• Thực tế: ' + readablePrompt(raw).slice(0, 140));
  e.code = 'PROMPT_MISMATCH';
  throw e;
}

// ---------------- chạy 1 lượt ----------------
// Hai kiểu: (1) lượt mới: đính ảnh + gõ prompt + bấm tạo; (2) chạy lại theo 1 ảnh (rerunRef = media id của ảnh đó):
// tìm đúng ảnh, di chuột, bấm "Sử dụng lại câu lệnh" (Flow nạp lại prompt + ảnh tham chiếu), rồi bấm tạo.
// Lỗi khi lượt chạy bị hủy vì dự án đã bị xóa khỏi tool (không phải lỗi của Flow).
function canceledError() {
  const e = new Error('Đã hủy lượt này vì dự án đã bị xóa khỏi tool.');
  e.code = 'CANCELED';
  return e;
}

async function generate({ key, url, files, prompt, rerunRef, isCanceled, onUrl, onProgress, onPhase, onTile }) {
  const c = cfg.get();
  const N = c.imagesPerRun;
  onPhase && onPhase('Đang kết nối Flow…');
  hide(); // luôn chạy ngầm: thu nhỏ cửa sổ Chrome nếu đang hiện
  const t = await getTab({ key, url, onUrl });
  const p = t.page;
  const tag = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  let fetchingTiles = false;
  try {
    await t.lock.run(async () => {
      onPhase && onPhase('Đang chuẩn bị dự án Flow…');
      if (cfg.get().foregroundTabs) await p.bringToFront().catch(() => {});
      await closePicker(p);
      if (rerunRef) {
        const tile = p.locator(SEL.tile).filter({ has: p.locator(`img[data-media-id="${rerunRef}"]`) }).first();
        await tile.waitFor({ timeout: 30000 }).catch(() => { throw new Error('Không tìm thấy ảnh này trong dự án Flow (có thể đã bị xóa).'); });
        await tile.scrollIntoViewIfNeeded();
        await tile.hover();
        await human();
        await L.reuse(tile).click({ force: true, timeout: 15000 });
        await human();
        // đợi Flow nạp lại câu lệnh vào ô nhập
        const t0 = Date.now();
        while (Date.now() - t0 < 15000) {
          const txt = (await readComposer(p)) || '';
          if (txt.trim()) break;
          await sleep(300);
        }
        await ensureSettings(t);
        await setPromptVerified(p, prompt);
      } else {
        await ensureSettings(t);
        onPhase && onPhase('Đang tải ảnh tham chiếu lên Flow một lần…');
        try { await attachFiles(t, files); } // tải theo một lượt chọn file; không thử kéo-thả rồi tải lại khi fallback
        catch (e) {
          if (e.message !== 'MULTI_UNSUPPORTED') throw e;
          const expected = [];
          for (const f of files) { expected.push(await attachFile(t, f)); await human(); }
          await verifyComposerOrder(p, expected);
        }
        // Gõ prompt đúng từng chữ (xóa ô trước, gõ xong đọc lại đối chiếu; lệch thì dừng, không gửi sai).
        await setPromptVerified(p, prompt);
        await human();
      }
      const before = await tileCount(p);
      if (isCanceled && isCanceled()) throw canceledError(); // dự án đã bị xóa: không gửi lệnh tạo lên Flow
      onPhase && onPhase('Đang gửi yêu cầu tạo ảnh…');
      await L.submit(p).click({ force: true });
      onPhase && onPhase('Flow đã nhận lệnh; đang chờ ảnh…');
      const t0 = Date.now();
      while ((await tileCount(p)) < before + N) {
        if (Date.now() - t0 > 30000) throw new Error('Flow không nhận lệnh tạo (không thấy ô ảnh mới).');
        await sleep(300);
      }
      if ((await tagNewest(p, tag, N)) < N) throw new Error('Không xác định được các ô ảnh của lượt này.');
      await human();
    });

    // theo dõi tiến độ; gửi TỪNG ẢNH về tool ngay khi Flow tạo xong ô đó (để tool hiện trực tiếp)
    const t0 = Date.now();
    const sent = new Set();
    let last = [];
    const pull = async (tiles) => {
      const pending = tiles.map((x, i) => ({ x, i })).filter(({ x }) => x.mediaId && x.src && !sent.has(x.mediaId));
      if (pending.length && !fetchingTiles) {
        fetchingTiles = true;
        onPhase && onPhase('Flow đã trả ảnh; đang tải ảnh về tool…');
      }
      // Tải song song tối đa 4 ảnh (một bộ) để rút ngắn thời gian chờ mạng; vẫn lưu ảnh tuần tự để giữ đúng thứ tự và trạng thái.
      for (let i = 0; i < pending.length; i += 4) {
        const batch = pending.slice(i, i + 4);
        const fetched = await Promise.all(batch.map(async ({ x, i: slot }) => {
          try { return { x, slot, got: await getBytes(p.context(), x.src) }; }
          catch (_) { return null; } // lần đọc tiếp theo sẽ tự thử lại ảnh này
        }));
        for (const item of fetched) {
          if (!item) continue;
          if (onTile) await onTile(item.slot, { buffer: item.got.buffer, ext: item.got.ext, flowRef: item.x.mediaId });
          sent.add(item.x.mediaId);
        }
      }
    };
    while (Date.now() - t0 < 6 * 60 * 1000) {
      if (isCanceled && isCanceled()) throw canceledError(); // dừng ngay, không chờ Flow tạo tiếp
      last = await readTag(p, tag);
      const pcts = last.map((x) => (x.mediaId && x.src ? 100 : x.pct ?? 0));
      onProgress && onProgress(Math.round(pcts.reduce((s, v) => s + v, 0) / (pcts.length || 1)), pcts);
      await pull(last);
      const done = last.length === N && last.every((x) => x.mediaId && x.src);
      if (done) break;
      const abuse = last.find((x) => ABUSE.test(x.text));
      if (abuse) { const e = new Error('Flow báo “hoạt động bất thường”. Tool đã tạm dừng để bảo vệ tài khoản của bạn.'); e.code = 'FLOW_BLOCKED'; throw e; }
      // một số ô báo lỗi thật (có chữ lỗi, chưa có ảnh); các ô còn lại đã ra ảnh -> lấy phần ảnh đã ra
      const failedTiles = last.filter((x) => !x.mediaId && BAD.test(x.text));
      if (failedTiles.length && last.length === N && last.every((x) => x.mediaId || BAD.test(x.text))) {
        const okTiles = last.filter((x) => x.mediaId);
        if (!okTiles.length) throw new Error('Flow báo lỗi khi tạo ảnh: ' + failedTiles[0].text.replace(/\s+/g, ' '));
        if (okTiles.every((x) => x.src)) break;
      }
      await sleep(500);
    }
    last = await readTag(p, tag);
    await pull(last);
    if (!sent.size) throw new Error('Hết thời gian chờ Flow tạo ảnh.');
    return { url: t.url, count: sent.size };
  } finally {
    await releaseTab(t);
  }
}

// Lấy BẢN NÉT của các ảnh đã tạo: mở từng ảnh ra xem chi tiết (lightbox) trong dự án Flow,
// đọc địa chỉ ảnh độ phân giải cao rồi tải về. Khỏi động ở nền (tab riêng), không đụng tới tab đang chạy.
// Trước đây chỉ đọc ảnh từ lưới (bản 768px -> mờ); giờ mở lightbox lấy bản lớn hơn nhiều.
async function fetchFull({ url, refs }) {
  if (!url) throw new Error('Lượt này chưa có dự án Flow.');
  const page = await chrome.newBackgroundPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await L.composer(page).waitFor({ timeout: 30000 }).catch(() => { throw new Error('Không mở được dự án Flow.'); });
    const out = {};
    for (const ref of refs) {
      let src = null;
      try {
        const tile = page.locator(SEL.tile).filter({ has: page.locator(`img[data-media-id="${ref}"]`) }).first();
        await tile.scrollIntoViewIfNeeded().catch(() => {});
        // 1) đọc ảnh từ lưới làm dự phòng (nếu mở lightbox không được)
        const gridSrc = await tile.locator('img[data-media-id]').first().evaluate((e) => e.currentSrc).catch(() => null);
        // 2) bấm mở lightbox để lấy bản nét
        await tile.click({ force: true, timeout: 10000 });
        const t0 = Date.now();
        while (Date.now() - t0 < 8000) {
          src = await page.evaluate(() => {
            const imgs = [...document.querySelectorAll('img')].filter((im) => im.complete && im.naturalWidth >= 1200);
            if (!imgs.length) return null;
            imgs.sort((a, b) => b.naturalWidth - a.naturalWidth);
            return imgs[0].currentSrc || imgs[0].src;
          }).catch(() => null);
          if (src) break;
          await sleep(400);
        }
        if (!src) src = gridSrc; // không mở được lightbox thì dùng ảnh lưới
      } catch (_) { /* bỏ qua ảnh này */ }
      // đóng lightbox để chuẩn bị ảnh tiếp theo
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(250);
      if (!src) continue;
      try {
        const got = await getBytes(page.context(), src);
        if (got) out[ref] = got;
      } catch (_) { /* giữ ảnh cũ nếu tải bản nét lỗi */ }
    }
    return out;
  } finally { await page.close().catch(() => {}); }
}

// Đọc 1 địa chỉ blob: ngay trong trang đang mở, trả về Buffer.
async function readBlob(page, url) {
  const b64 = await page.evaluate(async (u) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(u, { signal: controller.signal });
      if (!r.ok) throw new Error('Không đọc được ảnh tải xuống.');
      const buf = new Uint8Array(await r.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      return btoa(s);
    } finally { clearTimeout(timer); }
  }, url);
  return Buffer.from(b64, 'base64');
}

// Tải 2K theo lô: cùng lúc tối đa `concurrent2k` ảnh (mặc định 8) để nhiều cảnh chạy song song mà không mở quá nhiều tab.
const dlLock = new Semaphore(cfg.get().concurrent2k || 4);
const dlPages = new Set(); // các tab đang tải 2K: { page, projectId } — để đóng được khi dự án bị xóa
async function download2k(args) {
  dlLock.setLimit(cfg.get().concurrent2k || 4); // đọc lại để đổi cài đặt có hiệu lực ngay
  const canceled = () => !!(args.isCanceled && args.isCanceled());
  if (canceled()) throw canceledError(); // dự án đã bị xóa: không chiếm suất chờ của dự án khác
  // xếp hàng: mỗi lần chỉ tải 1 ảnh 2K; lỗi thì thử lại tối đa 2 lần
  return dlLock.run(async () => {
    let lastErr;
    for (let i = 0; i < 3; i++) {
      if (canceled()) throw canceledError(); // dự án đã bị xóa: không mở thêm tab, không thử lại
      try {
        const result = await Promise.race([
          download2kOnce(args),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Tải 2K quá lâu (vượt 120 giây).')), 120000)),
        ]);
        return result;
      } catch (e) { lastErr = e; if (canceled()) throw canceledError(); await sleep(1500); }
    }
    throw lastErr;
  });
}

async function download2kOnce({ url, flowRef, target, projectId }) {
  const base = (url || '').replace(/\/$/, '');
  if (!base) throw new Error('Chưa có liên kết dự án Flow của ảnh này.');
  const page = await chrome.newBackgroundPage();
  const entry = { page, projectId: projectId || null };
  dlPages.add(entry);
  try {
    // Không đợi trang tải xong hẳn, bấm ngay khi nút xuất hiện (bỏ các chờ thừa). Phần còn lại là thời gian Flow tự nâng ảnh lên 2K.
    await page.goto(`${base}/edit/${flowRef}`, { waitUntil: 'commit', timeout: 30000 });
    const dl = page.getByRole('button', { name: /Tải nội dung nghe nhìn xuống/ }).first();
    await dl.waitFor({ timeout: 30000 });
    await dl.click({ force: true });
    const item = page.getByRole('menuitem', { name: /^\s*2K/ }).first();
    await item.waitFor({ timeout: 15000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      item.click({ force: true }), // bấm bình thường: đợi menu hiện xong, tránh trượt
    ]);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = target + '.part';
    // Đọc thẳng nội dung file 2K từ bên trong trang Flow (địa chỉ dạng blob:), không đi qua thư mục tải xuống của Chrome
    // => không bị lỗi mất file tạm khi có chương trình khác cùng điều khiển Chrome.
    let got = null;
    try { const u = download.url(); if (/^blob:/.test(u)) got = await readBlob(page, u); } catch (_) { /* dùng cách dự phòng */ }
    try {
      if (got && got.length > 1000) { fs.writeFileSync(tmp, got); download.cancel().catch(() => {}); }
      else await download.saveAs(tmp);
      validate2kFile(tmp);
      // đặt đuôi file đúng theo nội dung thật (Flow có thể trả JPEG, PNG hoặc WebP)
      const head = fs.readFileSync(tmp).subarray(0, 12);
      const ext = head[0] === 0xff && head[1] === 0xd8 ? '.jpg' : head.subarray(1, 4).toString() === 'PNG' ? '.png' : head.subarray(8, 12).toString() === 'WEBP' ? '.webp' : path.extname(target) || '.png';
      const final = target.replace(/\.[^.\\/]+$/, '') + ext;
      fs.rmSync(final, { force: true });
      fs.renameSync(tmp, final);
      return final;
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      throw error;
    }
  } finally {
    dlPages.delete(entry);
    await Promise.race([page.close(), new Promise((r) => setTimeout(r, 5000))]).catch(() => {});
  }
}

module.exports = { status, open, reveal, hide, close: () => chrome.close(), generate, download2k, fetchFull, closeSceneTab, closeProjectTabs, closeStrayTabs, _test: { getTab, releaseTab, attachFiles, composerThumbSrcs, composerAttachCount, closePicker, verifyComposerOrder } };
