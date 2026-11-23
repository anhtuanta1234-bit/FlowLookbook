// Vỏ desktop (Electron) cho Flow Lookbook.
// Chạy server local trong tiến trình này rồi mở giao diện trong cửa sổ app riêng (không có thanh địa chỉ, không tab).
const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { runCleanup, compareVersion } = require('./update-cleanup');
const { sameVersion, shouldKeepPending, validateInstallerUrl, buildHelperScript } = require('./update-helpers');

const PORT = process.env.PORT || 4177;
const APP_URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const ICON = path.join(__dirname, 'icon.png');
// Chốt cứng userData TRƯỚC mọi getPath('userData') (kể cả lần config.js gọi khi require server).
// Nếu chỉ setName('Flow Lookbook') rồi để Electron tự suy, userData nhảy sang
// %APPDATA%\Flow Lookbook — thư mục cũ — và app đọc nhầm dataset cũ. Giữ nguyên
// %APPDATA%\flowlookbook = thư mục đang dùng. Không migrate/xoá thư mục cũ.
const APP_DATA_NAME = 'flowlookbook';
app.setName('Flow Lookbook');
app.setPath('userData', path.join(app.getPath('appData'), APP_DATA_NAME));
const PENDING_CLEANUP = path.join(app.getPath('userData'), 'pending-cleanup.json');
const UPDATE_SUCCESS = path.join(app.getPath('userData'), 'update-success.json');
const UPDATE_LOCK = path.join(os.tmpdir(), 'flow-update.lock');
const UPDATE_CANCEL = path.join(os.tmpdir(), 'flow-update-cancel.json');
const UPDATE_STATUS = path.join(os.tmpdir(), 'flow-update-status.json');
// Helper ghi file này NGAY SAU KHI qua kiểm tra lock. App chỉ tin đây là "helper đang sống".
const UPDATE_READY = path.join(os.tmpdir(), 'flow-update-ready.json');
let LAST_UPDATE_ERROR = '';
// PowerShell 5.1 ghi UTF-8 có BOM; JSON.parse/so sánh token của Node không chịu BOM.
const stripBom = (s) => String(s == null ? '' : s).replace(/^\uFEFF/, '');
// Chỉ máy có mã nguồn ở E:\FlowLookbook mới có thư mục dist để dọn installer cũ.
const SOURCE_ROOT = process.platform === 'win32' && fs.existsSync('E:\\FlowLookbook') ? 'E:\\FlowLookbook' : '';

// Server đã chạy sẵn ở nơi khác (ví dụ bản chạy nền cũ) thì dùng luôn, không mở thêm.
// Chỉ coi là "đúng app" khi /api/ping trả về đúng định danh, tránh mở nhầm một app khác chiếm cổng 4177.
function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/ping', timeout: 900 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      res.on('end', () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).app === 'flow-lookbook'); }
        catch (_) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer() {
  if (await ping()) return true;
  try {
    require(path.join(ROOT, 'server.js')); // server.js tự lắng nghe cổng khi được nạp
  } catch (err) {
    if (!err || err.code !== 'EADDRINUSE') throw err; // cổng bị chiếm: chờ server đang lên
  }
  for (let i = 0; i < 60; i++) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

let win = null;
let loadAttempts = 0;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1000,
    minHeight: 660,
    title: 'Flow Lookbook',
    backgroundColor: '#0a0f1a',
    autoHideMenuBar: true,
    icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: {
      contextIsolation: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'), // cho giao diện gọi hộp chọn thư mục
    },
  });
  win.removeMenu();
  win.on('page-title-updated', (e) => e.preventDefault()); // giữ tiêu đề cửa sổ gọn "Flow Lookbook"
  loadAttempts = 0;
  win.loadURL(APP_URL);
  // Server nội bộ có thể cần thêm vài trăm ms: tự thử lại thay vì để cửa sổ trắng.
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: bị hủy do chuyển trang, không phải lỗi
    if (!win || win.isDestroyed() || loadAttempts >= 5) return;
    loadAttempts++;
    setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(APP_URL); }, 400);
  });
  win.webContents.on('did-finish-load', () => { loadAttempts = 0; });
  // Tiến trình hiển thị bị treo/kết thúc bất thường: nạp lại giao diện, không để cửa sổ chết.
  win.webContents.on('render-process-gone', () => { if (win && !win.isDestroyed()) win.loadURL(APP_URL); });
  win.on('closed', () => { win = null; });
  // Link ra ngoài (tài liệu, Google Flow...) mở bằng trình duyệt mặc định, không nhảy khỏi app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_URL)) { e.preventDefault(); shell.openExternal(url); }
  });
}

// Khi đóng app: đóng luôn Chrome của tool để không để lại tiến trình ngầm tốn tài nguyên.
app.on('before-quit', (e) => {
  // Instance thứ 2 (bấm shortcut khi app đang mở) sẽ đi thẳng vào app.quit().
  // Không được phép gửi /api/flow/close tới server của instance đang chạy.
  if (!app.hasSingleInstanceLock()) return;
  if (app.isQuitting) return;
  app.isQuitting = true;
  e.preventDefault();
  const http = require('http');
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/flow/close', method: 'POST', timeout: 8000 }, () => { app.quit(); });
  req.on('error', () => { app.quit(); });
  req.on('timeout', () => { req.destroy(); app.quit(); });
  req.end();
});

// Hộp thoại chọn thư mục lưu ảnh (gọi từ nút "Chọn thư mục…" trong Cài đặt).
ipcMain.handle('flow:pick-folder', async (e, current) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Chọn thư mục lưu ảnh 2K',
    defaultPath: (typeof current === 'string' && current) ? current : undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

// ---------- tự tải / cập nhật ----------
const UPDATE_LOG = path.join(app.getPath('userData'), 'update.log');
function updateLog(msg) {
  try { fs.appendFileSync(UPDATE_LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
}

// Tránh chồng 2 lượt tải cùng một installer khi user bấm "Thử lại" trong lúc tải cũ còn chạy.
let activeDownload = null;

// File do bản cũ tải (không có marker) vẫn được tận dụng nếu khớp content-length trên GitHub.
// Nhờ vậy lần bấm lại không phải tải lại 118 MB — đây là lỗi gặp ở v1.1.18.
async function reuseExistingInstaller(dest, checked, e) {
  let st;
  try { st = fs.statSync(dest); } catch (_) { return false; }
  if (!st.isFile() || st.size < 20 * 1024 * 1024) return false;
  try {
    const saved = JSON.parse(fs.readFileSync(dest + '.complete', 'utf8'));
    if (saved.size === st.size && saved.url === checked.url) {
      updateLog('reuse downloaded installer (marker): ' + dest);
      e.sender.send('flow:update-progress', 100);
      return true;
    }
  } catch (_) {}
  // Không có marker: hỏi HEAD xem kích thước có khớp không (tốn vài KB, không tải lại cả file).
  try {
    const head = await fetch(checked.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const len = Number(head.headers.get('content-length') || 0);
    if (head.ok && len > 0 && len === st.size) {
      updateLog('reuse downloaded installer (HEAD size match): ' + dest);
      // Tạo marker để những lần sau khỏi gọi HEAD.
      try { fs.writeFileSync(dest + '.complete', JSON.stringify({ size: st.size, url: checked.url })); } catch (_) {}
      e.sender.send('flow:update-progress', 100);
      return true;
    }
    updateLog('existing installer size mismatch: local=' + st.size + ' remote=' + len);
  } catch (er) {
    updateLog('HEAD verify skipped: ' + er.message);
  }
  return false;
}

// Tải installer về thư mục Downloads của người dùng, báo tiến độ cho giao diện.
async function downloadInstaller(e, checked) {
  // Giữ nguyên tên file do release script tạo. Redirect sang CDN của GitHub (release-assets.*)
  // có tên khác nên KHÔNG được dùng tên đó làm file đích.
  const dest = path.join(app.getPath('downloads'), checked.fileName);
  if (await reuseExistingInstaller(dest, checked, e)) return dest;

  const res = await fetch(checked.url, { redirect: 'follow' });
  if (!res.ok) throw new Error('Không tải được bản cập nhật (HTTP ' + res.status + ').');
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Không đọc được dữ liệu tải về.');
  const out = fs.createWriteStream(dest);
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.write(Buffer.from(value));
      received += value.length;
      e.sender.send('flow:update-progress', total ? Math.min(100, Math.round(received * 100 / total)) : -1);
    }
    await new Promise((resolve, reject) => { out.end(resolve); out.on('error', reject); });
    if (received < 20 * 1024 * 1024) throw new Error('File tải về quá nhỏ, có thể bị lỗi. Vui lòng thử lại.');
    try { fs.writeFileSync(dest + '.complete', JSON.stringify({ size: received, url: checked.url })); } catch (_) {}
  } catch (er) {
    out.destroy();
    try { fs.rmSync(dest, { force: true }); } catch (_) {}
    try { fs.rmSync(dest + '.complete', { force: true }); } catch (_) {}
    throw er;
  }
  e.sender.send('flow:update-progress', 100);
  return dest;
}

ipcMain.handle('flow:download-update', async (e, url) => {
  const checked = validateInstallerUrl(url);
  if (!checked.ok) throw new Error(checked.reason);
  if (activeDownload && activeDownload.url === checked.url) {
    updateLog('download already in progress, reusing promise');
    return activeDownload.promise;
  }
  const promise = downloadInstaller(e, checked);
  activeDownload = { url: checked.url, promise };
  try { return await promise; }
  finally { if (activeDownload && activeDownload.promise === promise) activeDownload = null; }
});

// Cài đặt tự dọn file cũ: mặc định bật, có thể tắt trong Cài đặt.
function autoCleanEnabled() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data', 'config.json'), 'utf8'));
    return c.autoCleanOldInstallers !== false;
  } catch (_) { return true; }
}

// App cũ ghi lại việc cần dọn trước khi thoát; app mới sẽ đọc sau khi đã mở lại.
function writePendingCleanup(installer, targetVersion, token) {
  fs.writeFileSync(PENDING_CLEANUP, JSON.stringify({
    fromVersion: app.getVersion(),
    installer,
    sourceRoot: SOURCE_ROOT,
    createdAt: Date.now(),
  }, null, 2));
  updateLog('pending cleanup saved');
  // Lưu cả token để lần mở sau đối chiếu với trạng thái helper — tránh nhận nhầm
  // status của một lượt cài cũ (user bấm Thử lại nhiều lần).
  fs.writeFileSync(UPDATE_SUCCESS, JSON.stringify({ version: targetVersion || '', at: Date.now(), token: token || '' }));
  updateLog('update-success marker saved');
}

function clearUpdateMarkers() {
  for (const f of [PENDING_CLEANUP, UPDATE_SUCCESS, UPDATE_LOCK, UPDATE_CANCEL, UPDATE_STATUS, UPDATE_READY]) {
    try { fs.rmSync(f, { force: true }); } catch (_) {}
  }
}

// Helper ghi trạng thái thật của installer (exit code / lỗi) sau khi app đã đóng.
function readHelperStatus() {
  try {
    if (!fs.existsSync(UPDATE_STATUS)) return null;
    const s = JSON.parse(stripBom(fs.readFileSync(UPDATE_STATUS, 'utf8')));
    try { fs.rmSync(UPDATE_STATUS, { force: true }); } catch (_) {}
    return s;
  } catch (_) { return null; }
}

// Chạy lúc app mới đã khởi động: chỉ dọn khi phiên bản thật sự tăng.
function cleanupOldInstallers() {
  let job = null;
  try { job = JSON.parse(stripBom(fs.readFileSync(PENDING_CLEANUP, 'utf8'))); }
  catch (_) { return; }
  let result = null;
  try { result = runCleanup(job, app.getVersion(), updateLog, { enabled: autoCleanEnabled() }); }
  catch (er) { updateLog('cleanup error=' + er.message); }
  // Mở app quá sớm (bản chưa tăng) thì GIỮ job — đừng xoá như trước.
  const keep = shouldKeepPending(app.getVersion(), job)
    || (result && result.skipped && result.reason === 'version not advanced');
  if (!keep) {
    try { fs.rmSync(PENDING_CLEANUP, { force: true }); } catch (_) {}
  }
}

// Bản mới đọc marker này ngay lúc khởi động để hiện thông báo thành công.
ipcMain.handle('flow:consume-update-success', () => {
  try {
    if (!fs.existsSync(UPDATE_SUCCESS)) return '';
    let version = '';
    try { version = JSON.parse(stripBom(fs.readFileSync(UPDATE_SUCCESS, 'utf8'))).version || ''; } catch (_) {}
    // Mở lại quá sớm (installer chưa xong) thì GIỮ marker, không báo thành công sai.
    // So sánh bằng số phiên bản để "v1.1.17" / "1.1.17.0" vẫn khớp với app.getVersion().
    if (version && !sameVersion(version, app.getVersion())) return '';
    fs.rmSync(UPDATE_SUCCESS, { force: true });
    return version;
  } catch (_) { return ''; }
});

// Lỗi cài đặt thật (NSIS exit≠0, UAC từ chối, file hỏng) được báo lại cho user.
ipcMain.handle('flow:consume-update-error', () => {
  const msg = LAST_UPDATE_ERROR;
  LAST_UPDATE_ERROR = '';
  return msg;
});

ipcMain.handle('flow:install-update', async (_e, file, version) => {
  updateLog('install requested: ' + file + ' (target=' + (version || '?') + ')');
  if (typeof file !== 'string' || !fs.existsSync(file)) throw new Error('Không tìm thấy file cài đặt đã tải.');
  // Không dùng shell.openPath(): Windows có thể hiện hộp thoại "Chọn một ứng dụng để mở".
  if (!app.isPackaged) { updateLog('dev mode: bỏ qua cài tự động'); return 'dev-skipped'; }

  const { spawn } = require('child_process');
  const token = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const helper = path.join(os.tmpdir(), 'flow-update-helper.ps1');
  const config = path.join(os.tmpdir(), 'flow-update-params.json');
  let wrapper = null;

  // Chặn double-install: nếu có lượt khác còn hiệu lực thì từ chối ngay.
  try {
    if (fs.existsSync(UPDATE_LOCK)) {
      let lock = {};
      try { lock = JSON.parse(stripBom(fs.readFileSync(UPDATE_LOCK, 'utf8'))); } catch (_) {}
      if (lock.token && lock.token !== token && Date.now() - (lock.at || 0) < 10 * 60 * 1000) {
        throw new Error('Đang có một lượt cập nhật khác. Vui lòng đợi vài phút rồi thử lại.');
      }
      try { fs.rmSync(UPDATE_LOCK, { force: true }); } catch (_) {}
      try { fs.rmSync(UPDATE_READY, { force: true }); } catch (_) {}
    }
    fs.writeFileSync(UPDATE_LOCK, JSON.stringify({ token, at: Date.now() }), { flag: 'wx' });
  } catch (er) {
    clearUpdateMarkers();
    throw er;
  }

  let rolledBack = false;
  const cancelAndRollback = (reason) => {
    if (rolledBack) return;
    rolledBack = true;
    try { fs.writeFileSync(UPDATE_CANCEL, token, 'utf8'); } catch (_) {}
    if (wrapper && !wrapper.killed) { try { wrapper.kill(); } catch (_) {} }
    updateLog(reason + ' — hủy cập nhật, app vẫn mở');
    clearUpdateMarkers();
    for (const f of [config, helper]) { try { fs.rmSync(f, { force: true }); } catch (_) {} }
  };

  try {
    writePendingCleanup(file, version, token);
    fs.writeFileSync(helper, buildHelperScript(), 'utf8');
    // KHÔNG truyền đường dẫn có dấu cách qua -ArgumentList: PowerShell 5.1 sẽ tách
    // "C:\Users\TA ANH TUAN\..." thành nhiều arg, Windows hiện hộp "Chọn ứng dụng để mở 'TA'".
    fs.writeFileSync(config, JSON.stringify({
      installer: file,
      appExe: app.getPath('exe'),
      log: UPDATE_LOG,
      token,
      lock: UPDATE_LOCK,
      cancel: UPDATE_CANCEL,
      status: UPDATE_STATUS,
      ready: UPDATE_READY,
      processName: path.basename(app.getPath('exe'), '.exe'),
    }), 'utf8');
    updateLog('helper written: ' + helper);

    // spawn(detached:true) trên Windows làm PowerShell thoát ngay mà KHÔNG chạy -File.
    // Phải dùng PowerShell trung gian để helper sống sót sau khi app đóng. Token giúp
    // phân biệt lần chạy này với log cũ và là cách duy nhất để hủy helper nếu timeout.
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    const inner = "Start-Process -FilePath 'powershell.exe' -ArgumentList @(" +
      "'-NoProfile','-ExecutionPolicy','Bypass','-File'," + q(helper) +
      ",'-Config'," + q(config) + ") -WindowStyle Hidden";
    updateLog('helper spawn token=' + token);
    wrapper = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', inner,
    ], { stdio: 'ignore', windowsHide: true });
    wrapper.on('error', (er) => updateLog('helper spawn error=' + er.message));
    wrapper.on('exit', (code) => updateLog('helper wrapper exit=' + code));

    // Đợi helper ghi file ready (chỉ ghi SAU khi đã qua kiểm tra lock) rồi mới cho UI
    // đếm ngược. Trước đây chỉ soi câu "helper start" trong log — câu đó ghi TRƯỚC khi
    // kiểm tra lock nên helper đã abort mà app vẫn tưởng đang chạy → đóng app, không cài.
    // Timeout 15s (AV/PS cold start có thể chậm hơn 8s) → huỷ + rollback marker.
    await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const iv = setInterval(() => {
        let ready = false;
        try { ready = stripBom(fs.readFileSync(UPDATE_READY, 'utf8')).trim() === token; } catch (_) {}
        if (ready) {
          clearInterval(iv);
          updateLog('helper confirmed running');
          resolve();
          return;
        }
        let st = null;
        try {
          if (fs.existsSync(UPDATE_STATUS)) st = JSON.parse(stripBom(fs.readFileSync(UPDATE_STATUS, 'utf8')));
        } catch (_) {}
        if (st && st.ok === false) {
          clearInterval(iv);
          cancelAndRollback('helper abort: ' + (st.error || 'unknown'));
          reject(new Error(st.error || 'Không khởi được tiến trình cập nhật. Vui lòng bấm “Thử lại”.'));
          return;
        }
        if (Date.now() - startedAt > 15000) {
          clearInterval(iv);
          cancelAndRollback('helper ready timeout');
          reject(new Error('Không khởi được tiến trình cập nhật. Vui lòng bấm “Thử lại”.'));
        }
      }, 100);
    });
  } catch (er) {
    cancelAndRollback('helper setup error: ' + (er && er.message ? er.message : er));
    if (String(er && er.message || '').includes('Không khởi được')) throw er;
    throw new Error('Không chuẩn bị được bản cập nhật: ' + (er && er.message ? er.message : er));
  }

  // Không tự đóng ở đây: giao diện sẽ đếm ngược 3 giây rồi gọi flow:quit-for-update.
  return 'ready';
});

// Giao diện gọi sau khi đã hiện thông báo 3 giây cho người dùng đọc kịp.
ipcMain.handle('flow:quit-for-update', () => {
  updateLog('quit requested for update');
  setTimeout(() => app.quit(), 200);
  return 'quitting';
});

// Bấm shortcut lần nữa khi app đang mở: đưa cửa sổ hiện có lên trước, không mở trùng.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    let ok = false;
    let detail = '';
    try { ok = await ensureServer(); }
    catch (e) { detail = '\n\nChi tiết: ' + (e?.message || e); }
    if (!ok) {
      dialog.showErrorBox('Flow Lookbook', 'Không khởi động được máy chủ nội bộ (cổng ' + PORT + ').\nHãy kiểm tra Node.js rồi mở lại app.' + detail);
      app.quit();
      return;
    }
    const status = readHelperStatus();

    // App đã mở lại thì mọi helper của phiên trước (nếu còn sống) PHẢI dừng,
    // nếu không nó sẽ cài ngay lúc user đang dùng app. Ghi lệnh huỷ theo đúng token cũ.
    let marker = {};
    try {
      marker = JSON.parse(stripBom(fs.readFileSync(UPDATE_SUCCESS, 'utf8')));
      if (typeof marker === 'string') marker = { version: marker };
    } catch (_) {}
    try {
      if (fs.existsSync(UPDATE_LOCK)) {
        let stale = {};
        try { stale = JSON.parse(stripBom(fs.readFileSync(UPDATE_LOCK, 'utf8'))); } catch (_) {}
        if (stale.token && Date.now() - (stale.at || 0) < 10 * 60 * 1000) {
          fs.writeFileSync(UPDATE_CANCEL, stale.token, 'utf8');
          updateLog('cancelled stale helper token=' + stale.token);
        }
      }
    } catch (_) {}
    for (const f of [UPDATE_LOCK, UPDATE_READY]) { try { fs.rmSync(f, { force: true }); } catch (_) {} }

    const targetVersion = String(marker.version || '');
    const targetAdvanced = targetVersion && compareVersion(targetVersion, app.getVersion()) > 0;
    const statusMatches = !!status && (!marker.token || !status.token || status.token === marker.token);
    const installConfirmed = !!status && status.ok === true && statusMatches;

    if (status && status.ok === false && statusMatches) {
      // NSIS thất bại / helper abort: đừng giữ marker thành công, báo lỗi thật cho user.
      updateLog('helper reported install failure: ' + (status.error || 'exit=' + status.exitCode));
      LAST_UPDATE_ERROR = 'Cài đặt phiên bản mới thất bại'
        + (status.error ? ': ' + status.error : '')
        + '. App vẫn dùng bản cũ, bạn có thể thử lại trong Cài đặt.';
      clearUpdateMarkers();
    } else if (targetAdvanced && !installConfirmed) {
      // Marker hứa lên bản mới nhưng app vẫn bản cũ → cài không ăn (helper chết im,
      // hoặc NSIS trả 0 mà không ghi đè). Không để marker treo mãi, báo lỗi rõ ràng.
      updateLog('update did not apply: target=' + targetVersion + ' current=' + app.getVersion()
        + ' status=' + (status ? JSON.stringify(status) : 'none'));
      LAST_UPDATE_ERROR = 'Cài đặt phiên bản ' + targetVersion + ' không thành công. App vẫn dùng bản '
        + app.getVersion() + '. Vui vào Cài đặt → Kiểm tra phiên bản mới để thử lại.';
      clearUpdateMarkers();
    } else {
      if (status) updateLog('helper reported install success, exit=' + status.exitCode);
      cleanupOldInstallers(); // bản mới đã chạy ổn → dọn installer cũ (nếu có)
    }
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
} else {
  app.quit();
}
