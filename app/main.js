// Vỏ desktop (Electron) cho Flow Lookbook.
// Chạy server local trong tiến trình này rồi mở giao diện trong cửa sổ app riêng (không có thanh địa chỉ, không tab).
const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { runCleanup } = require('./update-cleanup');

const PORT = process.env.PORT || 4177;
const APP_URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const ICON = path.join(__dirname, 'icon.png');
const PENDING_CLEANUP = path.join(app.getPath('userData'), 'pending-cleanup.json');
const UPDATE_SUCCESS = path.join(app.getPath('userData'), 'update-success.json');
// Chỉ máy có mã nguồn ở E:\FlowLookbook mới có thư mục dist để dọn installer cũ.
const SOURCE_ROOT = process.platform === 'win32' && fs.existsSync('E:\\FlowLookbook') ? 'E:\\FlowLookbook' : '';

app.setName('Flow Lookbook');

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
// Tải installer về thư mục Downloads của người dùng, báo tiến độ cho giao diện.
ipcMain.handle('flow:download-update', async (e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Link tải không hợp lệ.');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('Không tải được bản cập nhật (HTTP ' + res.status + ').');
  let name = '';
  try { name = decodeURIComponent(new URL(res.url || url).pathname.split('/').pop() || ''); } catch (_) {}
  if (!/\.exe$/i.test(name)) name = 'Flow Lookbook Setup.exe';
  const dest = path.join(app.getPath('downloads'), name);
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
  } catch (er) {
    out.destroy();
    try { fs.rmSync(dest, { force: true }); } catch (_) {}
    throw er;
  }
  e.sender.send('flow:update-progress', 100);
  return dest;
});

// Chạy installer im lặng sau khi app đã đóng. Bản dev thì chỉ mở file để kiểm tra.
const UPDATE_LOG = path.join(app.getPath('userData'), 'update.log');
function updateLog(msg) {
  try { fs.appendFileSync(UPDATE_LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
}

// Cài đặt tự dọn file cũ: mặc định bật, có thể tắt trong Cài đặt.
function autoCleanEnabled() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data', 'config.json'), 'utf8'));
    return c.autoCleanOldInstallers !== false;
  } catch (_) { return true; }
}

// App cũ ghi lại việc cần dọn trước khi thoát; app mới sẽ đọc sau khi đã mở lại.
function writePendingCleanup(installer, targetVersion) {
  try {
    fs.writeFileSync(PENDING_CLEANUP, JSON.stringify({
      fromVersion: app.getVersion(),
      installer,
      sourceRoot: SOURCE_ROOT,
      createdAt: Date.now(),
    }, null, 2));
    updateLog('pending cleanup saved');
  } catch (er) { updateLog('pending cleanup error=' + er.message); }
  try {
    fs.writeFileSync(UPDATE_SUCCESS, JSON.stringify({ version: targetVersion || '', at: Date.now() }));
    updateLog('update-success marker saved');
  } catch (er) { updateLog('update-success marker error=' + er.message); }
}

// Chạy lúc app mới đã khởi động: chỉ dọn khi phiên bản thật sự tăng.
function cleanupOldInstallers() {
  let job = null;
  try { job = JSON.parse(fs.readFileSync(PENDING_CLEANUP, 'utf8')); }
  catch (_) { return; }
  try { fs.rmSync(PENDING_CLEANUP, { force: true }); } catch (_) {}
  try { runCleanup(job, app.getVersion(), updateLog, { enabled: autoCleanEnabled() }); }
  catch (er) { updateLog('cleanup error=' + er.message); }
}

// Bản mới đọc marker này ngay lúc khởi động để hiện thông báo thành công.
ipcMain.handle('flow:consume-update-success', () => {
  try {
    if (!fs.existsSync(UPDATE_SUCCESS)) return '';
    let version = '';
    try { version = JSON.parse(fs.readFileSync(UPDATE_SUCCESS, 'utf8')).version || ''; } catch (_) {}
    // Mở lại quá sớm (installer chưa xong) thì GIỮ marker, không báo thành công sai.
    // Lần mở sau, khi app.getVersion() đúng bằng bản đích → mới xoá marker và báo.
    if (version && version !== app.getVersion()) return '';
    fs.rmSync(UPDATE_SUCCESS, { force: true });
    return version;
  } catch (_) { return ''; }
});

ipcMain.handle('flow:install-update', async (_e, file, version) => {
  updateLog('install requested: ' + file + ' (target=' + (version || '?') + ')');
  if (typeof file !== 'string' || !fs.existsSync(file)) throw new Error('Không tìm thấy file cài đặt đã tải.');
  // Không dùng shell.openPath(): Windows có thể hiện hộp thoại "Chọn một ứng dụng để mở".
  if (!app.isPackaged) { updateLog('dev mode: bỏ qua cài tự động'); return 'dev-skipped'; }

  writePendingCleanup(file, version);
  const { spawn } = require('child_process');
  const currentExe = app.getPath('exe');
  // Helper PowerShell tách riêng: đợi app đóng hẳn → cài im lặng → KHÔNG tự mở lại.
  // Người dùng mở lại bằng shortcut; app mới sẽ hiện thông báo thành công nếu phiên bản khớp.
  // Dùng helper thay vì chuỗi cmd `start /WAIT` vì chuỗi đó có thể không chờ/không chạy
  // tuỳ cách Windows xử lý dấu nháy. Mọi bước đều ghi log để dễ kiểm tra.
  const ps = `param([string]$Installer, [string]$AppExe, [string]$Log, [string]$Token)
function W($m) { Add-Content -LiteralPath $Log -Value ("[" + (Get-Date -Format o) + "] " + $m) }
W "helper start token=$Token"
for ($i = 0; $i -lt 100; $i++) {
  $running = Get-Process -Name 'Flow Lookbook' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $AppExe }
  if (-not $running) { break }
  Start-Sleep -Milliseconds 400
}
W "waited ticks=$i stillRunning=$([bool]$running)"
try {
  $proc = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru -ErrorAction Stop
  W "installer exit=$($proc.ExitCode)"
} catch {
  W "installer error=$($_.Exception.Message)"
}
W "install finished - user will relaunch manually"
W "helper end"
`;
  const helper = path.join(os.tmpdir(), 'flow-update-helper.ps1');
  fs.writeFileSync(helper, ps, 'utf8');
  updateLog('helper written: ' + helper);

  // spawn(detached:true) trên Windows làm PowerShell thoát ngay mà KHÔNG chạy -File.
  // Phải dùng một PowerShell trung gian gọi Start-Process để helper là "cháu" tách biệt,
  // sống sót sau khi app đóng. Token giúp phân biệt lần chạy này với log cũ.
  const token = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const inner = "Start-Process -FilePath 'powershell.exe' -ArgumentList @(" +
    "'-NoProfile','-ExecutionPolicy','Bypass','-File'," + q(helper) + "," +
    "'-Installer'," + q(file) + ",'-AppExe'," + q(currentExe) +
    ",'-Log'," + q(UPDATE_LOG) + ",'-Token'," + q(token) + ") -WindowStyle Hidden";
  updateLog('helper spawn token=' + token);
  const wrapper = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', inner,
  ], { stdio: 'ignore', windowsHide: true });
  wrapper.on('error', (er) => updateLog('helper spawn error=' + er.message));
  wrapper.on('exit', (code) => updateLog('helper wrapper exit=' + code));

  // Đợi helper ghi xác nhận rồi mới tắt app — không bao giờ tắt khi helper chưa chạy.
  await new Promise((resolve) => {
    const startedAt = Date.now();
    const iv = setInterval(() => {
      let started = false;
      try { started = fs.readFileSync(UPDATE_LOG, 'utf8').includes('helper start token=' + token); }
      catch (_) {}
      if (started || Date.now() - startedAt > 8000) {
        clearInterval(iv);
        updateLog(started ? 'helper confirmed running' : 'helper start timeout — vẫn tiếp tục');
        resolve();
      }
    }, 100);
  });

  setTimeout(() => app.quit(), 300);
  return 'installing';
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
    createWindow();
    cleanupOldInstallers(); // bản mới đã chạy ổn → dọn installer cũ (nếu có)
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
} else {
  app.quit();
}
