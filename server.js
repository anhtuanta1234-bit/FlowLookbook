// Máy chủ cục bộ: giao diện + API + hàng đợi chạy Flow.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cfg = require('./src/config');
const store = require('./src/store');
const { completeHqStage, finishHqBatch, dropQueuedRuns, MAX_FLOW_REOPEN, shouldReopenFlow, flowReopenDelayMs, flowBlockedMessage, LOGO_PENDING_STATUSES, LOGO_DONE_STATUSES, allLogoRemovalDone, logoCleanupTargets, normalizeLogoRemoval, appendLogoPhase, step3ReadyForLogo, logoResumeStatus } = require('./src/workflow');
const { imageDimensions, imageDimensionsFromBuffer, imageExtFromBuffer, is2kDimensions, is2kForReference } = require('./src/image');
const { viToEn } = require('./src/translate');
const flow = require('./src/flow');
const firefly = require('./src/firefly');
const { sceneNo, sceneFileBase, logoSceneDone, nextLogoScene } = require('./src/logo-order');

const PORT = Number(process.env.PORT) || 4177;
const APP_ID = 'flow-lookbook';
// Ảnh sạch sau khi xóa logo Firefly: output/<dự án>/anhdaxoalogo/
const LOGO_OUTPUT_DIRNAME = 'anhdaxoalogo';
// Link file version.json dùng để báo cập nhật cho người dùng. Sửa 1 dòng này khi đổi repo,
// rồi build installer mới — mọi app đã cài sẽ tự nhận diện bản mới (không cần cấu hình trong UI).
const UPDATE_MANIFEST_URL = process.env.FLOW_UPDATE_URL
  || 'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json';
// Link placeholder = chưa cấu hình thật: app sẽ không gọi ra ngoài, không báo lỗi 404.
const UPDATE_CONFIGURED = !!UPDATE_MANIFEST_URL && !/YOUR_GITHUB_USERNAME|example\.com/i.test(UPDATE_MANIFEST_URL);
const logDir = path.join(cfg.dataDir, 'logs');
function appendLog(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  console.log(text.trimEnd());
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, 'app.log');
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
        const old = path.join(logDir, 'app.1.log');
        fs.rmSync(old, { force: true });
        fs.renameSync(file, old);
      }
    } catch (_) {}
    fs.appendFileSync(file, text);
  } catch (_) {}
}
// Log riêng theo dự án để dễ tra cứu khi nhiều dự án chạy cùng lúc.
function appendProjectLog(projectId, line) {
  if (!projectId) return appendLog(line);
  const text = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, `project-${projectId}.log`);
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 1 * 1024 * 1024) {
        const old = path.join(logDir, `project-${projectId}.1.log`);
        try { fs.rmSync(old, { force: true }); } catch (_) {}
        fs.renameSync(file, old);
      }
    } catch (_) {}
    fs.appendFileSync(file, text);
  } catch (_) {}
}
// Một lỗi bất ngờ không được làm sập cả app đang chạy nhiều luồng; ghi lại để còn truy nguyên.
process.on('unhandledRejection', (e) => appendLog('unhandledRejection ' + (e?.stack || e)));
process.on('uncaughtException', (e) => appendLog('uncaughtException ' + (e?.stack || e)));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Chặn trang web khác gửi POST/PATCH/DELETE tới server localhost (CSRF).
// Yêu cầu không có Origin (curl, Electron, script nội bộ) vẫn được phép.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try {
      const u = new URL(origin);
      ok = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname) && (!u.port || u.port === String(PORT));
    } catch (_) { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Yêu cầu bị chặn vì đến từ một trang khác (CSRF).' });
  }
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Yêu cầu bị chặn vì đến từ một trang khác (CSRF).' });
  }
  next();
});

// Nhận diện đúng app khi Electron kiểm tra cổng đã có server chưa.
app.get('/api/ping', (req, res) => res.json({ app: APP_ID, port: PORT }));
app.get('/api/version', (req, res) => {
  let pkg = {};
  try { pkg = require('./package.json'); } catch (_) {}
  res.json({ name: 'Flow Lookbook', version: pkg.version || '1.0.0', updateUrl: UPDATE_CONFIGURED ? UPDATE_MANIFEST_URL : '' });
});
app.get('/favicon.ico', (req, res) => res.sendStatus(204));
// ---------- tĩnh ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files/koc', (req, res, next) => express.static(path.join(cfg.dataDir, 'koc'))(req, res, next));
// Chặn id dự án lạ trước khi chạm file system. id KOC là tên file nên KHÔNG dùng hàm này cho /api/koc/:id.
function rejectInvalidProjectId(req, res) {
  if (store.isValidProjectId(req.params.id)) return false;
  res.status(400).json({ error: 'Mã dự án không hợp lệ' });
  return true;
}
app.get('/files/p/:id/:file', (req, res) => {
  if (rejectInvalidProjectId(req, res)) return;
  const p = store.assetPath(req.params.id, req.params.file);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  res.sendFile(p);
});

// ---------- SSE: đẩy cập nhật dự án tới giao diện ----------
const clients = new Set();
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
// Giữ kết nối sống và dọn client đã chết: một tab đóng không được làm hỏng luồng cập nhật của tab khác.
const heartbeat = setInterval(() => {
  for (const c of [...clients]) {
    try { c.write(': ping\n\n'); } catch (_) { clients.delete(c); }
  }
}, 15000);
heartbeat.unref?.();
function broadcast(type, data) {
  if (!clients.size) return;
  const msg = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const c of [...clients]) {
    try { c.write(msg); } catch (_) { clients.delete(c); }
  }
}
function pushProject(p) { store.save(p); broadcast('project', p); }

// ---------- cấu hình ----------
app.get('/api/config', (req, res) => {
  const c = { ...cfg.get() };
  delete c.geminiKey; delete c.geminiModel;
  // fixedOutputRoot: máy này khóa cứng thư mục ảnh; outputRootChosen=false → giao diện nhắc chọn thư mục.
  res.json({
    ...c,
    defaultOutputRoot: cfg.fixedOutputRoot || cfg.defaultOutputRoot,
    fixedOutputRoot: cfg.fixedOutputRoot || '',
    outputRootChosen: cfg.hasSavedOutputRoot(),
  });
});
app.post('/api/config', (req, res) => {
  const patch = {};
  for (const k of ['chromePath']) if (typeof req.body[k] === 'string') patch[k] = req.body[k].trim();
  // Thư mục lưu ảnh: chuẩn hóa và thử tạo luôn, báo lỗi rõ nếu ổ/nhánh không ghi được.
  if (typeof req.body.outputRoot === 'string' && req.body.outputRoot.trim()) {
    const dir = path.resolve(req.body.outputRoot.trim());
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { return res.status(400).json({ error: `Không tạo được thư mục lưu ảnh: ${dir}` }); }
    patch.outputRoot = dir;
  }
  if (typeof req.body.hqIntermediate === 'boolean') patch.hqIntermediate = req.body.hqIntermediate;
  if (typeof req.body.fastMode === 'boolean') patch.fastMode = req.body.fastMode;
  if (typeof req.body.autoCleanOldInstallers === 'boolean') patch.autoCleanOldInstallers = req.body.autoCleanOldInstallers;
  if (typeof req.body.removeLogoEnabled === 'boolean') patch.removeLogoEnabled = req.body.removeLogoEnabled;
  if (req.body.logoBrushSize !== undefined) patch.logoBrushSize = Math.min(128, Math.max(5, Math.round(Number(req.body.logoBrushSize) || 14)));
  if (typeof req.body.fireflyHomeUrl === 'string' && req.body.fireflyHomeUrl.trim()) patch.fireflyHomeUrl = req.body.fireflyHomeUrl.trim();
  if (req.body.logoRemoveMask && typeof req.body.logoRemoveMask === 'object') {
    const m = req.body.logoRemoveMask;
    const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    const cur = cfg.get().logoRemoveMask || {};
    patch.logoRemoveMask = {
      // Tọa độ chốt: tâm (93%, 96%) = trái 2%, xuống 4% từ (95%, 92%).
      xPct: Math.min(100, Math.max(0, num(m.xPct, cur.xPct ?? 89.940))),
      yPct: Math.min(100, Math.max(0, num(m.yPct, cur.yPct ?? 94.329))),
      wPct: Math.min(100, Math.max(0.1, num(m.wPct, cur.wPct ?? 6.12))),
      hPct: Math.min(100, Math.max(0.1, num(m.hPct, cur.hPct ?? 3.343))),
    };
  }
  if (Number.isInteger(req.body.maxChromeTabs)) patch.maxChromeTabs = Math.min(32, Math.max(4, req.body.maxChromeTabs));
  if (Number.isInteger(req.body.maxParallelRuns)) patch.maxParallelRuns = Math.min(8, Math.max(1, req.body.maxParallelRuns));
  if (Number.isInteger(req.body.concurrent2k)) patch.concurrent2k = Math.min(16, Math.max(1, req.body.concurrent2k));
  const logoJustEnabled = patch.removeLogoEnabled === true && !cfg.get().removeLogoEnabled;
  cfg.set(patch);
  res.json({ ok: true });
  if (logoJustEnabled) {
    for (const meta of store.list()) queueLogoRemoval(meta.id).catch((e) => appendLog('logo remove enable queue err: ' + (e?.message || e)));
  }
});

app.get('/api/templates', (req, res) => res.json(store.templates()));
app.post('/api/templates', (req, res) => { store.saveTemplates({ ...store.templates(), ...req.body }); res.json({ ok: true }); });

// ---------- Flow ----------
let loginPending = false;
app.get('/api/flow/status', async (req, res) => {
  const st = await flow.status();
  // vừa đăng nhập xong thì tự thu nhỏ cửa sổ Chrome: từ đây tool chạy ngầm
  if (loginPending && st.loggedIn) { loginPending = false; setTimeout(() => flow.hide(), 3000); }
  res.json({ ...st, paused, queued: queue.length, auto: autoOn, interrupted: interruptedCount, fireflyQuotaPaused: !!logoRemovePausedQuota,
    fireflyDaily: cfg.fireflyDailyFree(),
    fireflyStatus: await firefly.status(),
    logoQueue: { active: logoRemoveActiveKey, waiting: logoRemoveQueue.length, pausedQuota: !!logoRemovePausedQuota } });
});
app.post('/api/auto', (req, res) => { setAuto(!!req.body.on); if (autoOn) resumeAuto(); res.json({ auto: autoOn }); });
app.post('/api/flow/resume', (req, res) => { setPaused(null); pump(); resumePendingSharpUpgrades(); res.json({ ok: true }); });
// Hủy các lượt đang chờ: bỏ khỏi hàng đợi VÀ xóa luôn các lượt chờ / lượt lỗi chưa có ảnh khỏi danh sách (về lại trạng thái ban đầu).
// Lượt đã có ảnh thì giữ nguyên.
app.post('/api/flow/clear-queue', async (req, res) => {
  try {
    const n = queue.length; queue.length = 0;
    await writeLock.run(() => {
      for (const p of store.list()) {
        const full = store.load(p.id); if (!full) continue; let ch = false;
        const clean = (st) => { const k = st.runs.length; st.runs = st.runs.filter((r) => !((r.status === 'queued' || r.status === 'error') && !(r.images || []).length)); if (st.runs.length !== k) ch = true; };
        clean(full.s1); clean(full.s2); for (const sc of full.s3.scenes) clean(sc);
        if (ch) pushProject(full);
      }
    });
    res.json({ cleared: n });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Xóa 1 lượt lỗi chưa có ảnh (nút × ở dòng lỗi)
app.delete('/api/projects/:id/runs/:rid', async (req, res) => {
  try {
    const ch = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return null;
      let changed = false;
      const clean = (st) => { const k = st.runs.length; st.runs = st.runs.filter((r) => !(r.id === req.params.rid && r.status === 'error' && !(r.images || []).length)); if (st.runs.length !== k) changed = true; };
      clean(p.s1); clean(p.s2); for (const sc of p.s3.scenes) clean(sc);
      if (changed) pushProject(p);
      return changed;
    });
    if (ch === null) return res.sendStatus(404);
    res.json({ ok: ch });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/flow/open', async (req, res) => {
  try { await flow.open(); const st = await flow.status(); loginPending = !st.loggedIn; res.json(st); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/firefly/status', async (req, res) => {
  try { res.json(await firefly.status()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/firefly/open', async (req, res) => {
  try { res.json(await firefly.open()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/firefly/reveal', async (req, res) => {
  try { await firefly.reveal(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
// Xem trước Firefly trên app: ảnh lỗi thì trả {ok:false} chứ không báo lỗi lên giao diện.
app.get('/api/firefly/preview', async (req, res) => {
  try {
    const out = await firefly.preview({ projectId: String(req.query.projectId || ''), sceneId: String(req.query.sceneId || '') });
    res.json(out?.ok ? out : { ok: false });
  } catch (_) { res.json({ ok: false }); }
});

// Mở Flow ở đúng dự án đang gặp lỗi (body: { url } hoặc { projectId, stage, sceneId })
app.post('/api/flow/reveal', async (req, res) => {
  try {
    let url = req.body.url;
    if (!url && req.body.projectId) { const p = store.load(req.body.projectId); url = p && (stageState(p, req.body.stage, req.body.sceneId)?.flowUrl || null); }
    if (url && !/^https:\/\/flow\.google\.com\//.test(url)) return res.status(400).json({ error: 'Địa chỉ không hợp lệ.' });
    await flow.reveal(url); res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ngắt kết nối: xóa hàng đợi đang chờ + đóng toàn bộ cửa sổ Chrome của tool.
// Lượt đang chạy sẽ tự ngắt (mất kết nối Chrome); không tạo ảnh nữa.
app.post('/api/flow/close', async (req, res) => {
  try {
    // Xóa các lượt đang chờ trong hàng đợi (không tạo ảnh nữa)
    queue.length = 0;
    await writeLock.run(() => {
      for (const p of store.list()) {
        const full = store.load(p.id); if (!full) continue; let ch = false;
        const clean = (st) => { const k = st.runs.length; st.runs = dropQueuedRuns(st.runs); if (st.runs.length !== k) ch = true; };
        clean(full.s1); clean(full.s2); for (const sc of full.s3.scenes) clean(sc);
        if (ch) pushProject(full);
      }
    });
    await Promise.allSettled([flow.close(), firefly.closeAll()]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chỉ sao lưu dữ liệu thật. chrome-profile / chrome-firefly-profile bị Chrome khoá (EBUSY) nên KHÔNG đụng vào; logs/backups cũng bỏ qua.
const BACKUP_ENTRIES = ['projects', 'koc', 'config.json', 'templates.json', 'auto.json', 'paused.json'];

// Đếm số file + tổng byte của một mục (file đơn hoặc thư mục, đệ quy) để ghi vào manifest.
async function backupEntryStats(target) {
  const fsp = fs.promises;
  let files = 0;
  let bytes = 0;
  const top = await fsp.stat(target);
  if (top.isFile()) return { files: 1, bytes: top.size };
  if (!top.isDirectory()) return { files, bytes };
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of await fsp.readdir(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) {
        files++;
        try { bytes += (await fsp.stat(full)).size; } catch (_) {}
      }
    }
  }
  return { files, bytes };
}

async function doBackup() {
  const fsp = fs.promises;
  const backupRoot = path.join(cfg.dataDir, 'backups');
  await fsp.mkdir(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let dest = path.join(backupRoot, stamp);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(backupRoot, `${stamp}-${i}`);
  const tmp = path.join(backupRoot, `.tmp-${stamp}-${crypto.randomBytes(4).toString('hex')}`);
  let ownsTmp = false;
  try {
    await fsp.mkdir(tmp);
    ownsTmp = true;
    const copied = [];
    let projectsEmpty = false;
    for (const name of BACKUP_ENTRIES) {
      const src = path.join(cfg.dataDir, name);
      let st;
      try { st = await fsp.stat(src); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      const target = path.join(tmp, name);
      if (st.isDirectory()) await fsp.cp(src, target, { recursive: true, force: true });
      else if (st.isFile()) await fsp.copyFile(src, target);
      else continue;
      copied.push(name);
    }
    // Dù chưa có project nào thì backup vẫn phải có thư mục projects (đánh dấu trong manifest).
    if (!copied.includes('projects')) {
      await fsp.mkdir(path.join(tmp, 'projects'), { recursive: true });
      projectsEmpty = true;
      copied.push('projects');
    }
    // Verify tối thiểu TRƯỚC khi rename: có projects/ và có config.json nếu nguồn có.
    const pStat = await fsp.stat(path.join(tmp, 'projects'));
    if (!pStat.isDirectory()) throw new Error('Backup không hợp lệ: thiếu thư mục projects.');
    if (copied.includes('config.json')) {
      const cStat = await fsp.stat(path.join(tmp, 'config.json'));
      if (!cStat.isFile()) throw new Error('Backup không hợp lệ: thiếu config.json.');
    }
    const entries = [];
    for (const name of copied) {
      const s = await backupEntryStats(path.join(tmp, name));
      const entry = { name, files: s.files, bytes: s.bytes, fileCount: s.files, totalBytes: s.bytes };
      if (name === 'projects' && projectsEmpty) entry.empty = true;
      entries.push(entry);
    }
    let pkg = {};
    try { pkg = require('./package.json'); } catch (_) {}
    const manifest = {
      createdAt: new Date().toISOString(),
      appVersion: pkg.version || '1.0.0',
      entries,
      includesChromeProfile: false,
    };
    if (projectsEmpty) manifest.projectsEmpty = true;
    await fsp.writeFile(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));
    // Đổi tên nguyên tử: backup chỉ "tồn tại" khi mọi thứ đã copy + verify xong.
    await fsp.rename(tmp, dest);
    ownsTmp = false;
    // Không để lỗi ghi config biến một backup đã hoàn tất thành lỗi 400.
    try { cfg.set({ lastBackupAt: Date.now() }); } catch (_) {}
    return { ok: true, path: dest, at: Date.now() };
  } catch (e) {
    if (ownsTmp) { try { await fsp.rm(tmp, { recursive: true, force: true }); } catch (_) {} }
    throw e;
  } finally {
    // Dọn backup cũ hơn 2 ngày; KHÔNG xoá thư mục .tmp-* (đang xử lý hoặc do lần trước bỏ lại).
    try {
      const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
      for (const name of await fsp.readdir(backupRoot)) {
        if (name.startsWith('.tmp-')) continue;
        const full = path.join(backupRoot, name);
        try {
          const st = await fsp.stat(full);
          if (st.isDirectory() && st.mtimeMs < cutoff) await fsp.rm(full, { recursive: true, force: true });
        } catch (_) {}
      }
    } catch (_) {}
  }
}
app.post('/api/backup', async (req, res) => {
  try {
    const out = await doBackup();
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/backup/open', (req, res) => {
  const backupRoot = path.join(cfg.dataDir, 'backups');
  try { fs.mkdirSync(backupRoot, { recursive: true }); } catch (_) {}
  require('child_process').spawn('explorer.exe', [backupRoot], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true });
});
app.get('/api/backup/list', (req, res) => {
  try {
    const backupRoot = path.join(cfg.dataDir, 'backups');
    if (!fs.existsSync(backupRoot)) return res.json([]);
    const list = fs.readdirSync(backupRoot).map((name) => {
      const full = path.join(backupRoot, name);
      try { return { name, at: fs.statSync(full).mtimeMs }; } catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.at - a.at);
    res.json(list);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/translate', async (req, res) => {
  try { res.json(await viToEn(req.body.text)); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- KOC ----------
app.get('/api/koc', (req, res) => res.json(store.listKoc()));
app.post('/api/koc', express.raw({ type: () => true, limit: '30mb' }), (req, res) => {
  const ext = imageExtFromBuffer(req.body);
  if (!ext) return res.status(400).json({ error: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.' });
  if (!imageDimensionsFromBuffer(req.body)) return res.status(400).json({ error: 'File ảnh không hợp lệ hoặc bị hỏng.' });
  res.json({ id: store.saveKoc(req.query.name || 'koc', req.body, ext) });
});
app.delete('/api/koc/:id', (req, res) => { store.removeKoc(req.params.id); res.json({ ok: true }); });

// ---------- dự án ----------
app.get('/api/projects', (req, res) => res.json(store.list()));
app.post('/api/projects', async (req, res) => {
  try {
    const p = await writeLock.run(() => {
      const raw = String(req.body?.name ?? '').trim();
      if (!raw) throw new Error('Vui lòng nhập tên sản phẩm.');
      if (store.nameExists(raw)) throw new Error(`Tên sản phẩm "${store.safeName(raw)}" đã tồn tại. Vui lòng đặt tên khác.`);
      const created = store.createProject(raw);
      try { store.outputDirFor(created); } catch (_) {}
      return created;
    });
    res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Thư mục kết quả của dự án nằm trong outputRoot. Chỉ xóa khi đường dẫn vẫn nằm trọn trong
// outputRoot (store.safeName đã chặn ../ nhưng vẫn kiểm tra lại trước khi rm -rf).
function projectOutputDir(p) {
  const root = path.resolve(cfg.get().outputRoot || '');
  const dir = path.resolve(root, store.outputFolderFor(p));
  const rel = path.relative(root, dir);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? dir : null;
}
function removeProjectOutput(p) {
  const dir = projectOutputDir(p);
  if (!dir) return null;
  try { fs.rmSync(dir, { recursive: true, force: true }); return dir; }
  catch (e) { appendLog(`Không xóa được thư mục kết quả "${dir}": ${e.message}`); return null; }
}

// Dọn dẹp _tam của TẤT CẢ dự án — PHẢI đứng trước /:id để không bị Express khớp nhầm
app.post('/api/projects/clean-all', async (req, res) => {
  try {
    const result = await writeLock.run(() => {
      const removed = [];
      const startLogo = [];
      const skipped = [];
      for (const meta of store.list()) {
        const p = store.load(meta.id); if (!p) continue;
        // Không dọn khi dự án còn chạy / đang tải 2K: _tam có thể đang được ghi.
        if (projectHasActiveWork(p)) { skipped.push(p.name); continue; }
        // Chưa lưu xong toàn bộ ảnh Bước 3 thì không tải/dọn và KHÔNG sang Bước 4.
        if (!allStep3Saved(p)) continue;
        const outDir = projectOutputDir(p);
        if (!outDir) { skipped.push(p.name); continue; }
        const tam = path.join(outDir, '_tam');
        const hadTam = fs.existsSync(tam);
        if (hadTam) fs.rmSync(tam, { recursive: true, force: true });
        removeStaleTemp(outDir);
        removeStaleTemp(path.join(outDir, LOGO_OUTPUT_DIRNAME));
        // Mốc "đã tải hết ảnh về": Bước 4 chỉ được phép bắt đầu từ đây.
        p.cleaned = Date.now();
        // Bước 3 vừa xong hành động cuối: mở và tự chuyển giao diện sang Bước 4 nối tiếp.
        p.maxStage = Math.max(p.maxStage || p.stage || 1, 4);
        p.stage = 4;
        p.autoGo = { to: 4, at: Date.now() };
        if (ensureLogoRemovalState(p)) startLogo.push(p.id);
        store.save(p);
        broadcast('project', p);
        if (hadTam) removed.push(meta.id);
      }
      return { ok: true, cleaned: removed.length, skipped, startLogo };
    });
    for (const id of result.startLogo || []) queueLogoRemoval(id).catch((e) => appendLog('logo remove queue err: ' + (e?.message || e)));
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
function projectHasActiveWork(p) {
  // Đang chạy (đã ra khỏi hàng đợi) | còn chờ trong hàng đợi | dự án Flow đang bận việc 2K
  return store.hasActiveWork(p) || busyProjects.has(p.id) || queue.some((job) => job.projectId === p.id);
}
// File tạm còn sót do lần lưu 2K bị gián đoạn (mất điện, tắt app…) — chỉ xóa khi dự án đang rảnh.
function removeStaleTemp(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (/\.(pending|part)-|\.part$/i.test(f)) fs.rmSync(path.join(dir, f), { force: true });
    }
  } catch (_) {}
}
app.post('/api/projects/bulk-delete', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const allProjects = store.list();
      const ids = req.body.all === true
        ? allProjects.map((p) => p.id)
        : [...new Set(Array.isArray(req.body.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [])];
      if (!ids.length) return { code: 400, error: 'Chưa có dự án nào được chọn để xóa.' };

      const projects = ids.map((id) => store.load(id));
      if (projects.some((p) => !p)) return { code: 404, error: 'Một hoặc nhiều dự án không còn tồn tại. Hãy tải lại danh sách.' };
      const busy = projects.filter(projectHasActiveWork);
      if (busy.length) {
        return {
          code: 409,
          error: `Không thể xóa khi dự án còn đang chạy hoặc xử lý ảnh 2K: ${busy.map((p) => p.name).join(', ')}. Hãy đợi hoàn tất rồi thử lại.`,
        };
      }
      // Phải xóa thư mục kết quả TRƯỚC store.remove(): outputFolderFor() cần danh sách
      // dự án cũ để phân biệt các dự án trùng tên (thư mục legacy có đuôi id).
      const outputDirs = projects.map((p) => removeProjectOutput(p)).filter(Boolean);
      for (const p of projects) store.remove(p.id);
      return { deleted: ids, outputDirs };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    // Dự án đã rời khỏi tool: hủy mọi việc còn chờ / đang chạy của nó để Flow không chạy tiếp việc đã bị bỏ.
    for (const id of out.deleted) cancelProjectWork(id);
    res.json({ deleted: out.deleted });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/projects/delete-capabilities', (req, res) => res.json({ safeDelete: true }));
app.get('/api/projects/:id', (req, res) => {
  const p = store.load(req.params.id);
  p ? res.json(p) : res.sendStatus(404);
});
app.delete('/api/projects/:id', async (req, res) => {
  if (rejectInvalidProjectId(req, res)) return;
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      if (projectHasActiveWork(p)) {
        return { code: 409, error: `Dự án "${p.name}" đang chạy hoặc xử lý ảnh 2K. Hãy đợi hoàn tất rồi thử xóa.` };
      }
      const outputDir = removeProjectOutput(p);
      store.remove(p.id);
      return { ok: true, outputDir };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    cancelProjectWork(req.params.id);
    res.json({ ok: true, outputRemoved: !!out.outputDir });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// tải ảnh lên dự án (ảnh đã cắt sẵn từ giao diện)
app.post('/api/projects/:id/assets', express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
  if (!store.load(req.params.id)) return res.sendStatus(404);
  const ext = imageExtFromBuffer(req.body);
  if (!ext) return res.status(400).json({ error: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP. Hãy chuyển ảnh sang một trong các định dạng này.' });
  if (!imageDimensionsFromBuffer(req.body)) return res.status(400).json({ error: 'File ảnh không hợp lệ hoặc bị hỏng.' });
  res.json({ file: store.saveAsset(req.params.id, req.body, ext) });
});

// cập nhật một phần: tên, bước, prompt, danh sách ảnh đầu vào...
app.patch('/api/projects/:id', async (req, res) => {
  if (rejectInvalidProjectId(req, res)) return;
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      const b = req.body;
      let contentChanged = false;
      if (typeof b.name === 'string') {
        const raw = b.name.trim();
        if (!raw) return { code: 400, error: 'Vui lòng nhập tên sản phẩm.' };
        if (store.nameExists(raw, p.id)) return { code: 400, error: `Tên sản phẩm "${store.safeName(raw)}" đã tồn tại. Vui lòng đặt tên khác.` };
        if (!p.outputFolder) p.outputFolder = store.outputFolderFor(p);
        p.name = store.safeName(raw);
      }
      if (b.stage === 4) {
        // Bước 4 là bước thật, nối ngay sau Bước 3 nhưng chỉ mở sau khi đã tải/dọn xong.
        if (!step3ReadyForLogo(p)) return { code: 400, error: 'Hoàn tất Bước 3: chọn & lưu hết ảnh 2K rồi bấm “Tải hết ảnh về & Dọn dẹp” xong rồi mới sang Bước 4.' };
        p.maxStage = Math.max(p.maxStage || p.stage || 1, 4);
        p.stage = 4;
      } else if ([1, 2, 3].includes(b.stage)) {
        const max = p.maxStage || p.stage || 1;
        if (b.stage > max && ((b.stage === 2 && !p.s1.approved) || (b.stage === 3 && !p.s2.approved))) {
          return { code: 400, error: `Hoàn tất bước ${b.stage - 1} (chọn 1 ảnh) rồi mới sang bước ${b.stage}.` };
        }
        if (b.stage > max) {
          const prev = b.stage === 2 ? p.s1 : b.stage === 3 ? p.s2 : null;
          if (prev?.hq?.status === 'loading') return { code: 400, error: 'Đang lấy bản 2K nét, đợi xong rồi sang bước tiếp.' };
          if (prev?.hq?.status === 'error') return { code: 400, error: 'Chưa lấy được bản 2K. Bấm “Thử lại” rồi mới sang bước tiếp.' };
        }
        p.stage = b.stage; p.maxStage = Math.max(max, b.stage);
      }
      if (b.s1) {
        const patch = pick(b.s1, ['inputs', 'promptVi', 'promptEn', 'enFrom', 'approved']);
        Object.assign(p.s1, patch);
        if ('inputs' in patch) contentChanged = true;
        if ('approved' in patch) syncApprovedHq(p, p.s1);
      }
      if (b.s2) {
        const patch = pick(b.s2, ['kocId', 'extras', 'promptVi', 'promptEn', 'enFrom', 'approved']);
        Object.assign(p.s2, patch);
        if ('extras' in patch) contentChanged = true;
        if ('approved' in patch) syncApprovedHq(p, p.s2);
      }
      if (b.s3) {
        const patch = pick(b.s3, ['promptVi', 'promptEn', 'enFrom', 'extras']);
        Object.assign(p.s3, patch);
        if ('extras' in patch) contentChanged = true;
      }
      if (contentChanged) delete p.cleaned; // có ảnh mới → thư mục _tam sẽ có dữ liệu mới
      pushProject(p);
      return { p };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json(out.p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

// Ảnh đã chọn (kể cả ảnh vừa cắt lại) quyết định trạng thái 2K thực tế của bước 1/2.
function syncApprovedHq(p, st) {
  if (!st.approved) { st.hq = null; return; }
  const size = imageDimensions(store.assetPath(p.id, st.approved));
  if (is2kForReference(size)) { st.hq = { status: 'done', for: st.approved, manual: true }; return; }
  // Cắt từ bản 1K (hoặc ảnh nhỏ quá): báo rõ để chọn lại ảnh gốc, lấy 2K rồi cắt trên bản nét.
  if (autoOn && cfg.get().hqIntermediate !== false) {
    st.hq = {
      status: 'error', code: 'cropped', for: st.approved,
      error: `Ảnh đã chọn chỉ ${size ? size.width + '×' + size.height : 'không đọc được kích thước'}, chưa đạt chuẩn ảnh tham chiếu (cần cạnh dài ≥ 2048px và cạnh ngắn ≥ 512px). Hãy bấm “Chọn ảnh này” lại ở ảnh gốc bên dưới để tool lấy bản 2K, rồi cắt trên bản 2K.`,
    };
  } else {
    st.hq = null;
  }
}

// thêm / xóa cảnh ở bước 3
app.post('/api/projects/:id/scenes', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      const maxOrder = p.s3.scenes.reduce((m, s) => Math.max(m, Number.isInteger(s.order) ? s.order : 0), 0);
      const order = Number.isInteger(p.s3.nextOrder) && p.s3.nextOrder > maxOrder ? p.s3.nextOrder : maxOrder + 1;
      p.s3.nextOrder = order + 1;
      const scene = { id: store.uid(4), order, file: req.body.file, label: `Cảnh ${order}`, runs: [], chosen: null, flowUrl: null };
      p.s3.scenes.push(scene);
      delete p.cleaned;
      pushProject(p);
      return { scene };
    });
    if (out.code) return res.sendStatus(out.code);
    res.json(out.scene);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/projects/:id/scenes/:sid', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      const s = p?.s3.scenes.find((x) => x.id === req.params.sid);
      if (!s) return { code: 404 };
      if (typeof req.body.file === 'string') { s.file = req.body.file; delete p.cleaned; }
      if (typeof req.body.label === 'string') s.label = req.body.label.slice(0, 40);
      pushProject(p);
      return { s };
    });
    if (out.code) return res.sendStatus(out.code);
    res.json(out.s);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/projects/:id/scenes/:sid', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      const scene = p.s3.scenes.find((s) => s.id === req.params.sid);
      if (!scene) return { code: 404 };
      if ((scene.runs || []).some((r) => r.status === 'queued' || r.status === 'running' || r.upgrading || (r.preview2kPending || []).length)) {
        return { code: 409, error: 'Cảnh này đang chạy hoặc đang lấy ảnh 2K. Hãy đợi xong rồi xóa.' };
      }
      const ls = scene.logoRemoval?.status;
      if (ls && ['queued', 'preparing', 'waiting_ok', 'downloading'].includes(ls)) {
        return { code: 409, error: 'Cảnh này đang xóa logo trên Firefly. Hãy đợi xong rồi xóa.' };
      }
      p.s3.scenes = p.s3.scenes.filter((s) => s.id !== req.params.sid);
      pushProject(p);
      return { ok: true };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    firefly.discardScene({ projectId: req.params.id, sceneId: req.params.sid }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- chạy Flow ----------
// Mỗi bước (1, 2) và MỖI CẢNH ở bước 3 có dự án Flow riêng (st.flowUrl). Cảnh nào chưa có thì tool bấm "Dự án mới".
// body: { stage, sceneIds? }
function stageBusy(p, stage, sceneId) {
  const st = stageState(p, stage, sceneId);
  if (st && st.runs.some((r) => r.status === 'queued' || r.status === 'running')) return true;
  return queue.some((j) => j.projectId === p.id && j.stage === stage && (stage !== 3 || j.sceneId === sceneId));
}
app.post('/api/projects/:id/run', async (req, res) => {
  try {
    const stage = req.body.stage;
    if (![1, 2, 3].includes(stage)) return res.status(400).json({ error: 'Bước chạy không hợp lệ.' });
    if (paused) return res.status(409).json({ error: 'Tool đang tạm dừng vì Flow cảnh báo. Hãy bấm “Tiếp tục chạy” trước.' });
    const out = await writeLock.run(async () => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      let targets;
      if (stage === 1 || stage === 2) targets = [null];
      else {
        targets = req.body.sceneIds?.length ? req.body.sceneIds : p.s3.scenes.map((s) => s.id);
        const missing = targets.filter((sid) => !p.s3.scenes.some((s) => s.id === sid));
        if (missing.length) return { code: 400, error: 'Một số cảnh không còn tồn tại. Hãy tải lại danh sách.' };
      }
      if (!targets.length) return { code: 400, error: 'Chưa có cảnh nào để chạy.' };
      const busy = targets.filter((sid) => stageBusy(p, stage, sid));
      if (busy.length) {
        const names = busy.map((sid) => (sid ? (p.s3.scenes.find((s) => s.id === sid)?.label || 'cảnh') : `bước ${stage}`));
        return { code: 409, error: `Đang có lượt chờ hoặc đang chạy: ${names.join(', ')}. Hãy đợi xong rồi chạy tiếp.` };
      }
      const jobs = [];
      // Tạo hết run trước; nếu một cảnh lỗi thì không lưu gì (tránh run "ma" trong danh sách).
      for (const sid of targets) jobs.push(await makeRun(p, stage, sid || undefined));
      pushProject(p);
      // Đưa vào hàng đợi ngay trong khoá để hai lần bấm "Chạy" liên tiếp không tạo lượt trùng.
      jobs.forEach((j) => enqueue(j));
      return { jobs };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ queued: out.jobs.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Chạy lại theo MỘT ảnh: tool tìm đúng ảnh đó trong Flow, bấm "Sử dụng lại câu lệnh", rồi bấm tạo.
// body: { stage, runId, imageId, sceneId? }
app.post('/api/projects/:id/rerun', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      const { stage, runId, imageId, sceneId } = req.body;
      const st = stageState(p, stage, sceneId);
      if (!st) return { code: 400, error: 'Không tìm thấy bước hoặc cảnh cần làm lại.' };
      if (!runId || !imageId) return { code: 400, error: 'Thiếu thông tin ảnh cần làm lại (runId, imageId).' };
      const sourceRun = st.runs.find((r) => r.id === runId);
      const src = sourceRun?.images.find((i) => i.id === imageId);
      if (!src) return { code: 400, error: 'Không tìm thấy ảnh trong lượt chạy này. Hãy tải lại dự án và thử lại.' };
      if (!st.flowUrl) return { code: 400, error: 'Ảnh này chưa có dự án Flow để chạy lại.' };
      const promptEn = String(sourceRun.promptEn || '').trim();
      if (!promptEn) return { code: 400, error: 'Lượt gốc không còn lưu prompt tiếng Anh. Tool dừng để tránh chạy lại bằng prompt khác.' };
      if (stageBusy(p, stage, sceneId)) return { code: 409, error: 'Bước này đang có lượt chờ hoặc đang chạy. Hãy đợi xong rồi làm lại.' };
      const run = { id: store.uid(4), status: 'queued', progress: 0, tiles: [], images: [], chosen: null, error: null, createdAt: Date.now(), rerunOf: imageId, promptEn };
      st.runs.unshift(run);
      pushProject(p);
      enqueue({ projectId: p.id, stage, sceneId, runId: run.id, files: [], promptEn, rerunRef: src.flowRef });
      return { ok: true };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ queued: 1 });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Tạo lượt mới cho một lượt lỗi; giữ lượt lỗi cũ để không mất ảnh đã tạo dở.
app.post('/api/projects/:id/retry-run', async (req, res) => {
  try {
    const out = await writeLock.run(async () => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      const { stage, runId, sceneId } = req.body;
      const st = stageState(p, stage, sceneId);
      const failed = st?.runs.find((r) => r.id === runId);
      if (!failed || failed.status !== 'error') return { code: 400, error: 'Chỉ có thể thử lại một lượt đang ở trạng thái lỗi.' };
      const retryPrompt = String(failed.promptEn || '').trim();
      if (!retryPrompt) return { code: 400, error: 'Lượt lỗi không còn lưu prompt gốc. Tool dừng để tránh thử lại bằng prompt khác.' };
      if (!failed.rerunOf && !Array.isArray(failed.inputHashes)) {
        return { code: 400, error: 'Lượt lỗi chưa lưu snapshot ảnh đầu vào. Tool dừng để tránh thử lại bằng ảnh khác.' };
      }
      if (paused) return { code: 409, error: 'Tool vẫn đang tạm dừng. Hãy kiểm tra Flow rồi bấm “Tiếp tục chạy” trước.' };
      if (st.runs.some((r) => r.status === 'queued' || r.status === 'running') || stageBusy(p, stage, sceneId)) {
        return { code: 409, error: 'Bước này đang có lượt chờ hoặc đang chạy.' };
      }
      let job;
      if (failed.rerunOf) {
        const source = st.runs.flatMap((r) => r.images).find((im) => im.id === failed.rerunOf);
        if (!source?.flowRef || !st.flowUrl) return { code: 400, error: 'Không tìm thấy ảnh tham chiếu của lượt chạy lại trong Flow.' };
        const retry = {
          id: store.uid(4), status: 'queued', progress: 0, tiles: [], images: [],
          chosen: null, error: null, createdAt: Date.now(), rerunOf: failed.rerunOf,
          retryOf: runId, promptEn: retryPrompt,
        };
        st.runs.unshift(retry);
        job = { projectId: p.id, stage, sceneId, runId: retry.id, files: [], promptEn: retryPrompt, rerunRef: source.flowRef };
      } else {
        job = await makeRun(p, stage, sceneId);
        const retry = st.runs.find((r) => r.id === job.runId);
        retry.promptEn = retryPrompt; job.promptEn = retryPrompt;
        retry.inputHashes = failed.inputHashes;
        job.inputSnapshot = failed.inputHashes;
        retry.retryOf = runId;
      }
      pushProject(p);
      enqueue(job);
      return { job };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ queued: 1, runId: out.job.runId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function stageState(p, stage, sceneId) {
  if (stage === 1) return p.s1;
  if (stage === 2) return p.s2;
  return p.s3.scenes.find((s) => s.id === sceneId);
}

// Danh sách ảnh gửi lên Flow cho mỗi bước (số thứ tự = "ảnh 1, ảnh 2…" trong prompt).
// ĐÂY LÀ NGUỒN DUY NHẤT: cả việc gửi Flow, băm snapshot và kiểm tra thay đổi đều dùng hàm này.
function assetFile(p, file, label) {
  if (!file) throw new Error(`${label} chưa có ảnh.`);
  const fp = store.assetPath(p.id, file);
  if (!fs.existsSync(fp)) throw new Error(`${label} không còn trên đĩa (${file}). Hãy thêm lại ảnh.`);
  return fp;
}
function kocFile(id, label) {
  if (!id) throw new Error(`${label} chưa chọn KOC.`);
  const fp = store.kocPath(id);
  if (!fs.existsSync(fp)) throw new Error(`${label} không còn trong thư viện KOC (${id}). Hãy chọn lại.`);
  return fp;
}
function buildFiles(p, stage, st) {
  if (stage === 1) {
    if (!p.s1.inputs.length) throw new Error('Bước 1 chưa có ảnh sản phẩm.');
    return p.s1.inputs.map((f, i) => assetFile(p, f, `Ảnh sản phẩm ${i + 1}`));
  }
  if (stage === 2) {
    if (!p.s2.kocId) throw new Error('Bước 2 chưa chọn KOC.');
    if (!p.s1.approved) throw new Error('Chưa duyệt ảnh trang phục ở bước 1.');
    return [kocFile(p.s2.kocId, 'Bước 2'), assetFile(p, p.s1.approved, 'Ảnh trang phục đã chọn'), ...p.s2.extras.map((f, i) => assetFile(p, f, `Ảnh phụ kiện ${i + 3}`))];
  }
  if (!st) throw new Error('Không tìm thấy cảnh cần chạy.');
  if (!p.s2.approved) throw new Error('Chưa duyệt ảnh KOC mặc đồ ở bước 2.');
  return [assetFile(p, p.s2.approved, 'Ảnh KOC đã chọn'), assetFile(p, st.file, 'Ảnh cảnh'), ...(p.s3.extras || []).map((f, i) => assetFile(p, f, `Ảnh phụ kiện ${i + 3}`))];
}

// Ảnh đã chọn thực tế đang dùng cho bước sau (có thể là bản 2K hoặc bản vừa cắt lại).
function approvedSourceFile(st) { return st?.approved || null; }

function inputSources(p, stage, st) { return buildFiles(p, stage, st); }

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}
async function snapshotInputs(p, stage, st) {
  return Promise.all(inputSources(p, stage, st).map(hashFile));
}

async function inputsMatch(snapshot, p, stage, st) {
  try { return JSON.stringify(snapshot) === JSON.stringify(await snapshotInputs(p, stage, st)); }
  catch (_) { return false; }
}

async function makeRun(p, stage, sceneId) {
  const st = stageState(p, stage, sceneId);
  if (!st) throw new Error('Không tìm thấy cảnh cần chạy.');
  const promptEn = (stage === 3 ? p.s3.promptEn : st.promptEn || '').trim();
  if (!promptEn) throw new Error('Chưa có prompt tiếng Anh (đợi tool dịch xong hoặc tự gõ ở ô tiếng Anh).');
  buildFiles(p, stage, st); // kiểm tra đủ ảnh trước khi xếp hàng
  const inputSnapshot = await snapshotInputs(p, stage, st);
  const run = { id: store.uid(4), status: 'queued', progress: 0, tiles: [], images: [], chosen: null, error: null, createdAt: Date.now(), promptEn, inputHashes: inputSnapshot };
  st.runs.unshift(run);
  return { projectId: p.id, stage, sceneId, runId: run.id, promptEn, inputSnapshot };
}

function is2kAsset(projectId, file) {
  if (!file) return false;
  return is2kDimensions(imageDimensions(store.assetPath(projectId, file)));
}

const queue = [];
let active = 0;
// Dự án đang thực sự có lượt chạy (đã ra khỏi hàng đợi) — để không xóa nhầm dự án đang chạy.
const busyProjects = new Map(); // projectId -> số lượt đang chạy
// Dự án vừa bị xóa: mọi việc còn chờ / đang chạy của nó bị hủy, không gửi thêm lệnh nào lên Flow.
const canceledProjects = new Set();
// Hủy việc đang chạy và đang chờ của một dự án (gọi ngay sau khi xóa dự án).
function cancelProjectWork(projectId) {
  canceledProjects.add(projectId);
  const timer = setTimeout(() => canceledProjects.delete(projectId), 60 * 60 * 1000);
  timer.unref?.();
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].projectId === projectId) queue.splice(i, 1);
  for (let i = logoRemoveQueue.length - 1; i >= 0; i--) if (logoRemoveQueue[i].projectId === projectId) logoRemoveQueue.splice(i, 1);
  flow.closeProjectTabs(projectId).catch(() => {});
  firefly.closeProjectTabs(projectId).catch(() => {});
  releaseLogoJobForProject(projectId); // dự án bị xóa: nhả khóa hàng đợi để ảnh khác vẫn chạy tiếp
}
// { at, message } khi Flow cảnh báo hoạt động bất thường. Lưu ra file để khởi động lại tool KHÔNG làm mất lệnh dừng an toàn này.
const pausedFile = path.join(cfg.dataDir, 'paused.json');
let paused = (() => { try { return JSON.parse(fs.readFileSync(pausedFile, 'utf8')); } catch (_) { return null; } })();
const autoFile = path.join(cfg.dataDir, 'auto.json');
let autoOn = (() => { try { return JSON.parse(fs.readFileSync(autoFile, 'utf8')).on !== false; } catch (_) { return true; } })();
function setAuto(v) { autoOn = v; try { fs.writeFileSync(autoFile, JSON.stringify({ on: v })); } catch (_) {} }
// Bật lại tự động: quét mọi sản phẩm, thấy ảnh đã chọn mà chưa có bản 2K thì làm tiếp đúng chỗ đang dở
function resumeAuto() {
  writeLock.run(() => {
    for (const meta of store.list()) {
      const p = store.load(meta.id); if (!p) continue;
      for (const [stage, key] of [[1, 's1'], [2, 's2']]) {
        const st = p[key]; if (st.approved && st.hq?.status === 'manual') {
          const img = st.runs.flatMap((r) => r.images).find((i) => i.file === st.hq.for);
          if (img) { st.hq = { status: 'loading', for: img.file }; pushProject(p); upgradeHq(p.id, stage, img); }
        }
      }
      for (const sc of p.s3.scenes) {
        if (sc.chosen?.status === 'manual') {
          const img = sc.runs.find((r) => r.id === sc.chosen.runId)?.images.find((i) => i.id === sc.chosen.imageId);
          if (img) { sc.chosen.status = 'saving'; pushProject(p); save2k(p.id, sc.id, img); }
        }
      }
    }
  }).catch((e) => appendLog('resumeAuto lỗi: ' + (e?.message || e)));
}
function setPaused(v) { paused = v; try { if (v) fs.writeFileSync(pausedFile, JSON.stringify(v)); else fs.rmSync(pausedFile, { force: true }); } catch (_) {} }
function enqueue(job) { queue.push(job); pump(); }
function pump() {
  if (paused) return;
  const max = cfg.get().maxParallelRuns;
  while (active < max && queue.length) {
    const job = queue.shift();
    active++;
    busyProjects.set(job.projectId, (busyProjects.get(job.projectId) || 0) + 1);
    execute(job).catch(() => {}).finally(() => {
      active--;
      const left = (busyProjects.get(job.projectId) || 1) - 1;
      if (left <= 0) busyProjects.delete(job.projectId); else busyProjects.set(job.projectId, left);
      pump();
    });
  }
}

async function execute(job) {
  const st = (p) => stageState(p, job.stage, job.sceneId);
  const find = (p) => st(p)?.runs.find((r) => r.id === job.runId);
  // Mọi thay đổi project đều đi qua writeLock: nhiều cảnh chạy song song không ghi đè lẫn nhau.
  const update = (fn) => writeLock.run(() => {
    const p = store.load(job.projectId); if (!p) return null;
    const r = find(p); if (r) fn(r, p);
    pushProject(p); return p;
  }).catch((e) => { appendLog(`update lỗi project=${job.projectId} run=${job.runId}: ${e?.message || e}`); return null; });
  const canceled = () => canceledProjects.has(job.projectId);
  let lastProgressAt = 0;
  // Ghi lại thời gian từng pha để tìm nguyên nhân treo/chậm (xem debug-flow-stall-delay.md).
  const startedAt = Date.now();
  let phaseAt = startedAt;
  let reopens = 0; // số lần đã đóng tab Flow / mở dự án mới vì Flow báo "hoạt động bất thường"
  const logPhase = (note) => {
    const now = Date.now();
    const line = `flow project=${job.projectId} stage=${job.stage}${job.sceneId ? ':' + job.sceneId : ''} run=${job.runId} phase="${note}" +${now - phaseAt}ms total=${now - startedAt}ms`;
    appendLog(line);
    appendProjectLog(job.projectId, line);
    phaseAt = now;
  };
  try {
    if (canceled()) return; // dự án đã bị xóa trước khi lượt này bắt đầu
    // Ảnh đầu vào lấy từ ảnh đã chọn ở bước trước: nếu bản 2K nét của nó đang được tải thì đợi xong rồi mới chạy
    // (bạn không phải đứng chờ ở màn hình, cứ sang bước tiếp và bấm chạy).
    const need = job.stage === 2 ? 's1' : job.stage === 3 ? 's2' : null;
    if (need && !job.rerunRef) {
      let waited = false; const t0 = Date.now();
      while (Date.now() - t0 < 180000) {
        const pp = store.load(job.projectId); if (!pp || pp[need].hq?.status !== 'loading') break;
        if (!waited) { waited = true; update((r) => { r.note = 'Đợi bản 2K nét của ảnh đã chọn…'; }); }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (waited) update((r) => { delete r.note; });
      const latest = store.load(job.projectId);
      const input = latest?.[need];
      const inputIs2k = input?.hq?.status === 'done' || is2kAsset(job.projectId, input?.approved);
      // Chỉ chặn khi chế độ tự động đang bật; người dùng tắt tự động thì chủ động dùng ảnh 1K.
      if (autoOn && cfg.get().hqIntermediate !== false && !inputIs2k) {
        const note = 'Đã dừng trước khi gửi Flow vì ảnh tham chiếu chưa có bản 2K. Chọn lại ảnh nguồn hoặc thử lấy 2K rồi chạy tiếp.';
        update((r) => { r.inputNote = 'Chưa có bản 2K; lượt đã dừng để không dùng ảnh 1K.'; });
        throw new Error(note);
      }
      update((r) => {
        if (inputIs2k) delete r.inputNote;
        else r.inputNote = 'Ảnh đầu vào dùng bản 1K (chế độ tự động đang tắt hoặc đã tắt lấy 2K trong cài đặt).';
      });
    }
    const proj = store.load(job.projectId);
    if (!proj) throw new Error('Không còn tìm thấy dự án của lượt đang chạy.');
    const currentStage = st(proj);
    if (!job.rerunRef && job.inputSnapshot && !(await inputsMatch(job.inputSnapshot, proj, job.stage, currentStage))) {
      throw new Error('Ảnh đầu vào đã thay đổi sau khi xếp hàng. Tool dừng để không ghép nhầm prompt với ảnh; hãy kiểm tra đầu vào rồi chạy lại.');
    }
    const files = job.rerunRef ? [] : buildFiles(proj, job.stage, currentStage);
    logPhase('start');
    update((r) => { r.status = 'running'; r.startedAt = Date.now(); });
    const flowKey = `${job.projectId}:${job.stage}${job.sceneId ? ':' + job.sceneId : ''}`;
    let result;
    for (;;) {
      // Mỗi lần lặp đọc lại dự án: flowUrl đã bị xóa ở lần trước → getTab bấm "Dự án mới".
      const fresh = store.load(job.projectId);
      const flowUrl = fresh && st(fresh)?.flowUrl ? st(fresh).flowUrl : null;
      try {
        result = await flow.generate({
          key: flowKey,
          url: flowUrl,
          files,
          prompt: job.promptEn,
          rerunRef: job.rerunRef,
          isCanceled: canceled,
          onUrl: (url) => update((r, p) => { st(p).flowUrl = url; }),
          onPhase: (note) => { logPhase(note); return update((r) => { r.note = note; }); },
          // Giới hạn tần suất ghi tiến độ (200ms) để nhiều luồng chạy vẫn mượt, không ghi đĩa liên tục.
          onProgress: (pct, tiles) => {
            const now = Date.now();
            if (pct < 100 && now - lastProgressAt < 200) return;
            lastProgressAt = now;
            update((r) => { r.progress = pct; r.tiles = tiles; if (pct > 0) delete r.note; });
          },
          // từng ảnh về tới đâu, hiện ở tool tới đó
          onTile: async (ix, img) => {
            const saved = await update((r, p) => { r.images.push({ id: store.uid(3), file: store.saveAsset(p.id, img.buffer, img.ext || 'png'), flowRef: img.flowRef, slot: ix }); r.images.sort((x, y) => x.slot - y.slot); });
            // Không ghi được ảnh (đầy đĩa / mất quyền) thì phải báo lỗi, không được coi như đã lấy xong.
            if (!saved) throw new Error('Không lưu được ảnh Flow về dự án. Kiểm tra dung lượng ổ đĩa và quyền ghi.');
          },
        });
        break;
      } catch (e) {
        if (!shouldReopenFlow({ code: e.code, stage: job.stage, sceneId: job.sceneId, reopens }) || canceled()) throw e;
        reopens++;
        const waitMs = flowReopenDelayMs(reopens);
        await flow.closeSceneTab(job.projectId, job.stage, job.sceneId);
        update((r, p) => {
          const s = st(p); if (s) delete s.flowUrl; // lần sau chắc chắn tạo dự án Flow mới
          r.images = []; r.tiles = []; r.progress = 0; // bỏ ảnh dở của lượt bị chặn
          r.abuseReopens = reopens;
          r.note = `Flow báo hoạt động bất thường — mở dự án Flow mới (lần ${reopens}/${MAX_FLOW_REOPEN})…`;
        });
        appendLog(`flow blocked project=${job.projectId} scene=${job.sceneId} — mở lại Flow lần ${reopens}/${MAX_FLOW_REOPEN}; chờ ${waitMs}ms`);
        await new Promise((res) => setTimeout(res, waitMs));
      }
    }
    logPhase(`done ${result.count} ảnh`);
    update((r, p) => {
      if (result.url) st(p).flowUrl = result.url;
      r.status = 'done'; r.progress = 100; r.tiles = []; r.finishedAt = Date.now(); delete r.note;
    });
    // Lượt chạy xong: tự lấy bản NÉT cho ảnh xem trước (không chặn hàng đợi, chạy nền).
    // Khoá tuần tự 1 lượt một để không mở quá nhiều tab nền cùng lúc.
    sharpUpgrade(job.projectId, job.stage, job.runId, job.sceneId).catch(() => {});
  } catch (e) {
    // Lượt bị hủy vì dự án đã bị xóa: không báo lỗi, không tạm dừng.
    if (e.code === 'CANCELED') return;
    appendLog(`flow error project=${job.projectId} stage=${job.stage}${job.sceneId ? ':' + job.sceneId : ''} run=${job.runId} +${Date.now() - startedAt}ms: ${e?.message || e}`);
    // Bước 3 đã mở lại Flow đủ 5 lần mà vẫn bị chặn: chỉ báo riêng cho cảnh này,
    // không tạm dừng toàn tool để các cảnh khác vẫn chạy bình thường.
    if (e.code === 'FLOW_BLOCKED' && job.stage === 3 && job.sceneId && reopens >= MAX_FLOW_REOPEN) {
      const pp = store.load(job.projectId);
      const order = pp ? store.sceneOrder(pp, job.sceneId) : 0;
      const message = flowBlockedMessage(order);
      update((r) => {
        r.status = 'error'; r.error = message; r.errorCode = 'FLOW_BLOCKED_GIVE_UP';
        r.abuseReopens = reopens; r.tiles = []; delete r.note;
      });
      appendLog(`flow blocked exhausted project=${job.projectId} scene=${job.sceneId}: ${message}`);
      return;
    }
    if (e.code === 'FLOW_BLOCKED') setPaused({ at: Date.now(), message: e.message });
    update((r) => { r.status = 'error'; r.error = e.message; delete r.note; });
  }
}

// ---------- tự nâng ảnh xem trước lên bản 2K nét ----------
// Chạy nền. Nhiều cảnh / cả bộ ảnh tải SONG SONG (giới hạn toàn cục bởi dlLock = cài đặt "concurrent2k"),
// nhưng MỌI thao tác ghi dữ liệu project đều đi qua writeLock để không ghi đè lẫn nhau.
const writeLock = { p: Promise.resolve(), run(fn) { const r = this.p.then(fn, fn); this.p = r.catch(() => {}); return r; } };
const activeSharpUpgrades = new Set();
// Đọc–sửa–ghi một lượt (run) trong project. Không tự khoá: hãy gọi bên trong writeLock.run.
function withRun(projectId, stage, sceneId, runId, fn) {
  const p = store.load(projectId); if (!p) return;
  const st = stageState(p, stage, sceneId);
  const run = st?.runs.find((r) => r.id === runId);
  if (!run) return;
  fn(run, st, p);
  pushProject(p);
}
async function sharpUpgrade(projectId, stage, runId, sceneId, retryRefs = null, retryRound = 0) {
  const key = `${projectId}:${stage}:${sceneId || ''}:${runId}`;
  if (activeSharpUpgrades.has(key)) return;
  activeSharpUpgrades.add(key);
  let retryJob = null;
  try {
  // 1) Chuẩn bị (ghi dữ liệu dưới khoá): đọc trạng thái + đánh dấu đang lấy 2K.
  const prep = await writeLock.run(() => {
    const p0 = store.load(projectId); if (!p0) return null;
    const st0 = stageState(p0, stage, sceneId);
    const run0 = st0?.runs.find((r) => r.id === runId);
    if (!run0 || !st0.flowUrl || !run0.images.length) return null;
    const wanted = retryRefs ? new Set(retryRefs) : null;
    const images = run0.images.filter((im) => !wanted || wanted.has(im.flowRef));
    const missingWithoutRef = run0.images.filter((im) => !im.flowRef && !is2kAsset(projectId, im.file)).length;
    if (!images.length) return null;
    if (paused) {
      withRun(projectId, stage, sceneId, runId, (run) => {
        run.upgrading = false;
        run.preview2kPending = images.map((im) => im.flowRef).filter(Boolean);
        run.sharpRetryRound = retryRound;
        run.upgradeError = 'Đang tạm hoãn việc lấy 2K vì Flow đã tạm dừng. Sẽ tự tiếp tục sau khi bạn bấm “Tiếp tục chạy”.';
      });
      return null;
    }
    withRun(projectId, stage, sceneId, runId, (run) => {
      run.upgrading = true;
      run.sharpRetryRound = retryRound;
      run.preview2kPending = images.map((im) => im.flowRef).filter(Boolean);
      run.upgradeProgress = { done: 0, total: images.length };
      delete run.upgradeError;
    });
    return { outputDir: store.outputDirFor(p0), flowUrl: st0.flowUrl, images, missingWithoutRef };
  });
  if (!prep) return;
  const { outputDir, flowUrl, images, missingWithoutRef } = prep;
  const tmp = path.join(outputDir, '_tam');
  try { fs.mkdirSync(tmp, { recursive: true }); }
  catch (e) {
    await writeLock.run(() => withRun(projectId, stage, sceneId, runId, (run) => {
      run.upgrading = false;
      run.upgradeError = 'Không ghi được ảnh 2K vào thư mục lưu tạm. Kiểm tra ổ đĩa và quyền ghi.';
    }));
    return;
  }
  // 2) Tải ảnh 2K SONG SONG (mỗi ảnh tự xếp hàng ở dlLock). KHÔNG giữ khoá ở đây để nhiều cảnh chạy cùng lúc.
  const failedRefs = [];
  let completed = 0;
  const results = await Promise.all(images.map(async (im) => {
    try {
      if (paused || !im.flowRef) throw new Error(paused ? 'Flow đang tạm dừng.' : 'Ảnh không còn liên kết Flow nguồn.');
      const cached = findHq(projectId, im.flowRef);
      if (cached && is2kAsset(projectId, cached)) return { im, final: store.assetPath(projectId, cached), cached: true };
      const final = await flow.download2k({ url: flowUrl, flowRef: im.flowRef, target: path.join(tmp, `prev-${im.flowRef}.png`), projectId, isCanceled: () => canceledProjects.has(projectId) });
      if (!final || !fs.existsSync(final)) throw new Error('Flow không trả về file 2K.');
      return { im, final, cached: false };
    } catch (error) {
      return { im, error };
    } finally {
      completed++;
      const done = completed;
      await writeLock.run(() => withRun(projectId, stage, sceneId, runId, (run) => { run.upgradeProgress = { done, total: images.length }; }));
    }
  }));
  // 3) Ghi kết quả lần lượt (một khoá) để từng ảnh hiện đúng slot và không mất trạng thái.
  await writeLock.run(() => {
    for (const item of results) {
      const im = item.im;
      if (item.error) { if (im.flowRef) failedRefs.push(im.flowRef); continue; }
      if (!item.final) continue;
      try {
        const ext = path.extname(item.final).slice(1) || 'jpg';
        const ref = String(im.flowRef).replace(/[^a-z0-9_-]/gi, '');
        const nf = item.cached ? path.basename(item.final) : `hq-${ref}.${ext}`;
        const dest = store.assetPath(projectId, nf);
        if (!item.cached && (!fs.existsSync(dest) || !is2kAsset(projectId, nf))) fs.copyFileSync(item.final, dest);
        if (!is2kAsset(projectId, nf)) throw new Error('File lưu về chưa đạt độ phân giải 2K.');
        withRun(projectId, stage, sceneId, runId, (run, st) => {
          const img = run.images.find((x) => x.id === im.id);
          if (!img) return;
          const old = img.file;
          img.file = nf;
          // Bước 3: KHÔNG xóa chosen.target. Nếu ảnh đang chờ lưu, save2k vẫn dùng target đó;
          // nếu đã lưu xong thì file kết quả vẫn còn nguyên.
          if (stage !== 3 && st.approved === old) {
            st.approved = nf;
            if (st.hq?.for === old) st.hq = { status: 'done', for: old };
          }
          run.preview2kPending = (run.preview2kPending || []).filter((r) => r !== im.flowRef);
        });
      } catch (_) { if (im.flowRef) failedRefs.push(im.flowRef); /* giữ ảnh cũ nếu lưu bản 2K lỗi */ }
    }
  });
  // 4) Chốt trạng thái và hẹn tự thử lại nếu còn ảnh lỗi.
  await writeLock.run(() => withRun(projectId, stage, sceneId, runId, (run) => {
    retryJob = finishHqBatch(run, { failedRefs, failedWithoutRef: missingWithoutRef, paused, retryRound });
  }));
  if (retryJob) {
    const timer = setTimeout(() => sharpUpgrade(projectId, stage, runId, sceneId, retryJob.refs, retryJob.round), 15000 * retryJob.round);
    timer.unref?.();
  }
  } finally {
    activeSharpUpgrades.delete(key);
  }
}

function resumePendingSharpUpgrades(includeLegacy = false) {
  if (paused) return;
  writeLock.run(() => {
    for (const meta of store.list()) {
      const p = store.load(meta.id); if (!p) continue;
      const groups = [[1, null, p.s1], [2, null, p.s2], ...p.s3.scenes.map((s) => [3, s.id, s])];
      for (const [stage, sceneId, st] of groups) {
        for (const run of st?.runs || []) {
          const pending = run.preview2kPending || [];
          const shouldCheck = includeLegacy
            ? run.status === 'done' && run.images?.length
            : pending.length > 0 || !!run.upgradeError || !!run.upgrading;
          if (!shouldCheck) continue;

          const missing = (run.images || []).filter((im) => !is2kAsset(p.id, im.file));
          const refs = [...new Set(missing.map((im) => im.flowRef).filter(Boolean))];
          const missingWithoutRef = missing.filter((im) => !im.flowRef).length;
          if (!refs.length) {
            const hadState = pending.length > 0 || run.upgrading || !!run.upgradeError || !!run.upgradeProgress || !run.preview2kDoneAt;
            run.preview2kPending = [];
            run.upgrading = false;
            delete run.upgradeProgress;
            if (missingWithoutRef) {
              delete run.preview2kDoneAt;
              run.upgradeError = `${missingWithoutRef} ảnh thiếu liên kết Flow nên không thể tự lấy bản 2K.`;
            }
            else {
              delete run.upgradeError;
              run.preview2kDoneAt ||= Date.now();
            }
            if (hadState) pushProject(p);
            continue;
          }

          const upgradeKey = `${p.id}:${stage}:${sceneId || ''}:${run.id}`;
          if (activeSharpUpgrades.has(upgradeKey)) continue;
          run.preview2kPending = refs;
          run.upgrading = true;
          run.upgradeProgress = { done: 0, total: refs.length };
          run.sharpRetryRound = 0;
          delete run.preview2kDoneAt;
          pushProject(p);
          sharpUpgrade(p.id, stage, run.id, sceneId, refs, 0).catch(() => {});
        }
      }
    }
  }).catch((e) => appendLog('resumePendingSharpUpgrades lỗi: ' + (e?.message || e)));
}

// ---------- duyệt ảnh ----------
// body: { stage, runId, imageId, sceneId? }
// sceneNo / sceneFileBase / logoSceneDone / nextLogoScene ở src/logo-order.js:
// Bước 3 và Bước 4 dùng chung số thứ tự ảnh (01, 02, 03, …).
function sceneTargetPath(p, sceneId) {
  const outDir = store.outputDirFor(p);
  const base = sceneFileBase(p, sceneId);
  let target = path.join(outDir, `${base}.png`);
  const lower = target.toLowerCase();
  if (p.s3.scenes.some((s) => s.id !== sceneId && s.chosen?.target && path.resolve(s.chosen.target).toLowerCase() === lower)) {
    target = path.join(outDir, `${base}-${sceneId}.png`);
  }
  return target;
}

function logoRemovalDirFor(p) {
  const dir = path.join(store.outputDirFor(p), LOGO_OUTPUT_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function logoCleanTargetPath(p, sceneId) {
  return path.join(logoRemovalDirFor(p), `${sceneFileBase(p, sceneId)}.png`);
}
function logoRemovalEnabled() { return !!cfg.get().removeLogoEnabled; }
function sceneWantsLogoRemoval(sc) {
  return !!(sc?.chosen?.status === 'saved' && sc?.chosen?.target);
}
function allStep3Saved(p) {
  return p.s3.scenes.length > 0 && p.s3.scenes.every((s) => s.chosen?.status === 'saved');
}
function shouldStartLogoRemoval(p) {
  // p.cleaned: người dùng đã bấm “Tải hết ảnh về & Dọn dẹp” → Bước 3 thật sự xong.
  return logoRemovalEnabled() && step3ReadyForLogo(p);
}
function cleanupLogoOriginalsIfComplete(p) {
  const approved = logoCleanupTargets(p);
  if (!approved.length) return false;
  let changed = false;
  for (const s of approved) {
    const t = s.chosen?.target;
    // Chỉ xóa ảnh gốc khi file ảnh sạch tương ứng vẫn còn trên đĩa.
    if (t && fs.existsSync(t) && fs.existsSync(s.logoRemoval.cleanFile)) {
      try { fs.rmSync(t, { force: true }); changed = true; } catch (_) {}
    }
  }
  if (changed) p.cleanedLogosAt = Date.now();
  return changed;
}
function ensureLogoRemovalState(p) {
  if (!shouldStartLogoRemoval(p)) return false;
  let changed = false;
  for (const sc of p.s3.scenes) {
    if (!sceneWantsLogoRemoval(sc)) continue;
    if (!sc.logoRemoval) {
      sc.logoRemoval = {
        status: 'queued',
        code: '',
        error: '',
        note: 'Chờ xóa logo sau khi đã tải hết ảnh Bước 3',
        sourceTarget: sc.chosen.target,
        cleanFile: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      changed = true;
    }
    // error/quota_blocked/approved/skipped là trạng thái cuối do người dùng quản lý:
    // không tự chạy lại ở đây (chỉ “Làm lại” / “Đã kết nối Gmail khác” mới reset).
  }
  return changed;
}

function findLogoRemovalScene(p, sceneId) {
  return p?.s3?.scenes?.find((s) => s.id === sceneId) || null;
}
// Thứ tự xử lý (1 ảnh một lần): dùng trong nhật ký để biết ảnh nào đang làm / còn chờ.
function logoQueuePosition(p, sceneId) {
  const pending = (p?.s3?.scenes || []).filter((s) => !['approved', 'skipped'].includes(s.logoRemoval?.status));
  const at = pending.findIndex((s) => s.id === sceneId) + 1;
  return at ? `${at}/${pending.length}` : '';
}
app.post('/api/projects/:id/approve', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      if (!p) return { code: 404 };
      const { stage, runId, imageId, sceneId } = req.body;
      const st = stageState(p, stage, sceneId);
      if (!st) return { code: 400, error: 'Không tìm thấy bước hoặc cảnh cần chọn ảnh.' };
      if (!runId || !imageId) return { code: 400, error: 'Thiếu thông tin ảnh cần chọn (runId, imageId).' };
      const run = st.runs.find((r) => r.id === runId);
      const img = run?.images.find((i) => i.id === imageId);
      if (!img) return { code: 400, error: 'Không tìm thấy ảnh trong lượt chạy này. Hãy tải lại dự án và thử lại.' };
      for (const r of st.runs) r.chosen = null; // mỗi bước / cảnh chỉ có đúng 1 ảnh được chọn
      run.chosen = imageId;
      let startUpgrade = false;
      let completeNow = false;
      if (stage === 1 || stage === 2) {
        const already2k = is2kAsset(p.id, img.file);
        st.approved = img.file;
        st.hq = already2k
          ? { status: 'done', for: img.file, manual: true }
          : (cfg.get().hqIntermediate && img.flowRef && st.flowUrl)
            ? { status: autoOn ? 'loading' : 'manual', for: img.file }
            : null;
        startUpgrade = st.hq?.status === 'loading';
        completeNow = !startUpgrade && autoOn;
      } else {
        const prev = st.chosen;
        st.chosen = { runId, imageId, status: autoOn ? 'saving' : 'manual' };
        st.chosen.target = sceneTargetPath(p, sceneId);
        // Đổi ảnh Bước 3 → mốc "đã tải hết" không còn đúng, phải tải/dọn lại trước Bước 4.
        delete p.cleaned;
        if (prev && (prev.runId !== runId || prev.imageId !== imageId)) {
          // Chọn ảnh khác thì kết quả xóa logo cũ không còn đại diện cho cảnh này.
          if (st.logoRemoval) firefly.discardScene({ projectId: p.id, sceneId }).catch(() => {});
          st.logoRemoval = null;
        }
      }
      pushProject(p);
      return { p, img, stage, sceneId, startUpgrade, completeNow };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ ok: true });
    if (out.stage === 3) { if (autoOn) save2k(out.p.id, out.sceneId, out.img); }
    else if (out.startUpgrade) upgradeHq(out.p.id, out.stage, out.img);
    else if (out.completeNow) { await writeLock.run(() => { const p2 = store.load(out.p.id); if (!p2) return; completeHqStage(p2, out.stage, autoOn); pushProject(p2); }); }
  } catch (e) { res.status(400).json({ error: e.message }); }
});

function findHq(projectId, flowRef) {
  try { return fs.readdirSync(path.join(store.pdir(projectId), 'assets')).find((f) => f.startsWith('hq-' + flowRef + '.') && !f.endsWith('.part') && is2kAsset(projectId, f)) || null; } catch (_) { return null; }
}
// Bỏ chọn ảnh (bấm lần nữa vào nút "Đã chọn"). Ảnh 2K đã lưu ở thư mục kết quả (bước 3) KHÔNG bị xóa.
// body: { stage, sceneId? }
app.post('/api/projects/:id/unapprove', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      const { stage, sceneId } = req.body;
      const st = stageState(p, stage, sceneId);
      if (!st) return { code: 400, error: 'Không tìm thấy.' };
      const keptFile = stage === 3 ? (st.chosen?.target || null) : null;
      for (const r of st.runs) r.chosen = null;
      if (stage === 1 || stage === 2) { st.approved = null; st.hq = null; }
      else {
        st.chosen = null;
        delete p.cleaned; // bỏ chọn ảnh Bước 3 → khóa lại Bước 4 cho đến khi tải/dọn lại
        // Bỏ chọn ảnh thì mọi kết quả xóa logo của ảnh cũ cũng không còn đại diện cho cảnh này.
        if (st.logoRemoval) firefly.discardScene({ projectId: p.id, sceneId }).catch(() => {});
        st.logoRemoval = null;
      }
      pushProject(p);
      return { keptFile };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ ok: true, keptFile: out.keptFile });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Ảnh đã chọn ở bước 1, 2: tải bản 2K (nét hơn bản xem trước 1K) rồi thay vào để các bước sau dùng ảnh nét.
async function upgradeHq(projectId, stage, img) {
  const key = stage === 1 ? 's1' : 's2';
  // Ghi kết quả 2K phải đi qua writeLock: nhiều cảnh / nhiều bước có thể xong cùng lúc.
  const patch = (fn) => writeLock.run(() => {
    const p = store.load(projectId); if (!p) return;
    if (p[key].hq?.for !== img.file) return;
    fn(p[key], p); pushProject(p);
  });
  try {
    if (paused) throw new Error('Tool đang tạm dừng vì Flow cảnh báo.');
    const p = store.load(projectId);
    if (!p) return; // dự án đã bị xóa trong lúc chờ
    // đã có bản 2K của ảnh này (duyệt lại cùng ảnh) thì dùng luôn, không tải lại
    const tam = path.join(store.outputDirFor(p), '_tam');
    fs.mkdirSync(tam, { recursive: true });
    const base = `buoc${stage}-${String(img.flowRef).slice(0, 8)}`;
    const have = () => fs.readdirSync(tam).find((f) => f.startsWith(base + '.') && !f.endsWith('.part'));
    let name = findHq(projectId, img.flowRef);
    let file = have();
    if (!file) {
      const dl = name ? path.join(store.pdir(projectId), 'assets', name) : await flow.download2k({ url: p[key].flowUrl, flowRef: img.flowRef, target: path.join(tam, base + '.png'), projectId, isCanceled: () => canceledProjects.has(projectId) });
      if (name) fs.copyFileSync(dl, path.join(tam, base + path.extname(dl))); else file = path.basename(dl);
    }
    if (!name) { file = file || have(); name = 'hq-' + img.flowRef + path.extname(file); fs.copyFileSync(path.join(tam, file), store.assetPath(projectId, name)); }
    await patch((st, pp) => {
      if (st.approved === img.file) {
        st.approved = name;
        st.hq = { status: 'done', for: img.file };
        completeHqStage(pp, stage, autoOn);
      } else if (st.hq?.status === 'done' && st.hq?.for === img.file) {
        // Việc lấy 2K nền của cả lượt đã thay approved bằng đúng bản 2K của ảnh này → coi như xong.
        completeHqStage(pp, stage, autoOn);
      }
      // ảnh đã chọn đã bị cắt từ bản 1K trước khi có 2K: không thay lặng lẽ, báo rõ để người dùng chọn lại
      else st.hq = { status: 'error', code: 'cropped', for: img.file, error: 'Ảnh đã được cắt từ bản 1K trước khi có bản 2K. Hãy bấm “Chọn ảnh này” lại ở ảnh bên dưới để lấy 2K, rồi cắt trên bản 2K.' };
    });
  } catch (e) { await patch((st) => { st.hq = { status: 'error', for: img.file, error: friendlyHqError(e), detail: e.message }; }).catch(() => {}); }
}
// Lý do lỗi lấy 2K nói bằng lời dễ hiểu (chi tiết kỹ thuật vẫn lưu ở "detail").
function friendlyHqError(e) {
  const m = String(e?.message || e);
  if (/ENOENT|saveAs|artifact/i.test(m)) return 'Chrome của tool bị gián đoạn khi nhận file (thường do có chương trình khác cùng điều khiển Chrome). Bấm “Thử lại”.';
  if (/Timeout|timeout/.test(m)) return 'Flow xử lý quá lâu hoặc mạng chậm. Bấm “Thử lại”.';
  if (/tạm dừng/.test(m)) return m;
  if (/đăng nhập|login/i.test(m)) return 'Chưa đăng nhập Flow. Bấm “Đăng nhập Flow” rồi thử lại.';
  return 'Không lấy được file 2K từ Flow (' + m.slice(0, 80) + '). Bấm “Thử lại”.';
}
app.post('/api/projects/:id/retry-hq', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); const stage = req.body.stage;
      const st = p && (stage === 1 ? p.s1 : stage === 2 ? p.s2 : null);
      if (!p || !st) return { code: 400, error: 'Không tìm thấy bước cần lấy 2K.' };
      const wanted = st.hq?.for || st.approved;
      const img = st.runs.flatMap((r) => r.images).find((i) => i.flowRef && (i.file === wanted || i.file === st.approved));
      if (!img) return { code: 400, error: 'Không tìm thấy ảnh gốc để lấy bản 2K.' };
      st.hq = { status: 'loading', for: img.file };
      pushProject(p);
      return { p, stage, img };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ ok: true });
    upgradeHq(out.p.id, out.stage, out.img);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Người dùng tự tải ảnh 2K bằng tay rồi đưa vào tool: nhận làm ảnh 2K của ảnh đã chọn (lưu vào _tam, bước sau dùng ảnh này)
app.post('/api/projects/:id/manual-hq', express.raw({ type: () => true, limit: '60mb' }), async (req, res) => {
  try {
    const stage = +req.query.stage;
    if (!req.body || req.body.length < 1000) return res.status(400).json({ error: 'File ảnh không hợp lệ.' });
    const size = imageDimensionsFromBuffer(req.body);
    if (!size) return res.status(400).json({ error: 'File không phải ảnh JPEG, PNG hoặc WebP hợp lệ.' });
    if (!is2kDimensions(size)) {
      return res.status(400).json({ error: `Ảnh ${size.width}×${size.height} chưa đạt 2K (cạnh dài ≥ 2048 px và cạnh ngắn ≥ 1024 px).` });
    }
    const ext = imageExtFromBuffer(req.body) || 'png';
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      const st = stage === 1 ? p.s1 : stage === 2 ? p.s2 : null;
      if (!st || !st.approved) return { code: 400, error: 'Hãy chọn một ảnh trước.' };
      // Giữ liên kết tới ảnh gốc (đang chờ 2K) để "Thử lại"/tự động vẫn tìm đúng ảnh về sau.
      const forFile = st.hq?.for || st.approved;
      const name = store.saveAsset(p.id, req.body, ext);
      const tam = path.join(store.outputDirFor(p), '_tam'); fs.mkdirSync(tam, { recursive: true });
      fs.writeFileSync(path.join(tam, `buoc${stage}-tay.${ext}`), req.body);
      st.approved = name; st.hq = { status: 'done', for: forFile, manual: true };
      completeHqStage(p, stage, autoOn);
      delete p.cleaned;
      pushProject(p);
      return { ok: true };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
function isInside(dir, file) {
  if (!file) return false;
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function discardOldCleanFile(p, oldFile, newFile) {
  if (!oldFile || oldFile === newFile) return;
  const dir = path.join(store.outputDirFor(p), LOGO_OUTPUT_DIRNAME);
  if (isInside(dir, oldFile)) fs.rmSync(oldFile, { force: true });
}

// Hoàn tất Bước 3: xóa _tam, chỉ giữ ảnh 2K đã chọn — rồi MỚI bắt đầu Bước 4 (nếu bật).
app.post('/api/projects/:id/finish', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      if (!allStep3Saved(p)) return { code: 400, error: 'Cần chọn và lưu xong ảnh 2K cho tất cả các cảnh ở bước 3 trước.' };
      if (projectHasActiveWork(p)) return { code: 409, error: 'Dự án còn đang chạy hoặc đang tải ảnh 2K. Hãy đợi xong rồi dọn dẹp.' };
      const outDir = projectOutputDir(p);
      if (!outDir) return { code: 400, error: 'Đường dẫn thư mục kết quả không hợp lệ.' };
      fs.rmSync(path.join(outDir, '_tam'), { recursive: true, force: true });
      removeStaleTemp(outDir);
      removeStaleTemp(path.join(outDir, LOGO_OUTPUT_DIRNAME));
      p.cleaned = Date.now();
      p.maxStage = Math.max(p.maxStage || p.stage || 1, 4);
      p.stage = 4;
      p.autoGo = { to: 4, at: Date.now() };
      const startedLogo = ensureLogoRemovalState(p);
      pushProject(p);
      return { ok: true, startedLogo };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    if (out.startedLogo) queueLogoRemoval(req.params.id).catch((e) => appendLog('logo remove queue err: ' + (e?.message || e)));
    res.json({ ok: true, startedLogo: !!out.startedLogo });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// xem ảnh 2K đã lưu của một cảnh ngay trong tool
app.get('/files/saved/:id/:sid', (req, res) => {
  const p = store.load(req.params.id);
  const sc = p?.s3.scenes.find((x) => x.id === req.params.sid);
  const clean = req.query.clean === '1';
  const t = clean ? sc?.logoRemoval?.cleanFile : sc?.chosen?.target;
  if (!t || !fs.existsSync(t)) return res.sendStatus(404);
  res.set('Cache-Control', 'no-store'); res.sendFile(t);
});

const logoRemoveQueue = [];
let logoRemoveActive = false;
let logoRemoveActiveKey = '';
let logoRemovePausedQuota = null; // { at, message }
const logoJobKey = (projectId, sceneId) => `${projectId}:${sceneId}`;

// Firefly free hiện chỉ 3 ảnh/ngày cho mỗi mail. Đạt giới hạn thì dừng hàng chờ,
// không mở ảnh kế và báo đúng lý do để người dùng đổi Gmail.
const fireflyDailyMessage = () => `Firefly đang dùng lượt free hàng ngày (tối đa ${cfg.fireflyDailyFree().limit} ảnh). Vui lòng đổi mail khác để tiếp tục.`;
function pauseForDailyFreeLimit() {
  logoRemovePausedQuota = { at: Date.now(), message: fireflyDailyMessage(), kind: 'daily' };
}
function setDailyQuotaOn(lr) {
  if (!lr) return false;
  lr.status = 'quota_blocked';
  lr.code = '';
  lr.error = fireflyDailyMessage();
  lr.note = lr.error;
  lr.updatedAt = Date.now();
  appendLogoPhase(lr, lr.note);
  return true;
}
function markSceneDailyQuota(projectId, sceneId) {
  return writeLock.run(() => {
    const p = store.load(projectId); const sc = p?.s3?.scenes?.find((s) => s.id === sceneId);
    if (!sc?.logoRemoval || !setDailyQuotaOn(sc.logoRemoval)) return;
    pushProject(p);
  });
}
// Đạt 3 ảnh thì đánh dấu ảnh kế tiếp (nếu có) để banner đổi mail hiện ngay trên giao diện.
function blockNextQueuedForDaily(p, doneSceneId) {
  const next = (p?.s3?.scenes || [])
    .filter((s) => s.id !== doneSceneId && s.logoRemoval?.status === 'queued')
    .sort((a, b) => sceneNo(p, a.id) - sceneNo(p, b.id))[0];
  return setDailyQuotaOn(next?.logoRemoval);
}

// Một thời điểm chỉ có ĐÚNG 1 cảnh được mở trên Firefly. Ảnh đang chờ bấm Ổn / đang tải
// vẫn giữ khóa: không được mở ảnh kế tiếp làm cùng lúc 3 tab Firefly.
function anyLogoJobWaiting() {
  for (const meta of store.list()) {
    const p = store.load(meta.id);
    if (p?.s3?.scenes?.some((s) => ['preparing', 'downloading', 'waiting_ok'].includes(s.logoRemoval?.status))) return true;
  }
  return false;
}
function releaseLogoJob(projectId, sceneId, pump = true) {
  const key = logoJobKey(projectId, sceneId);
  if (logoRemoveActiveKey === key || (!logoRemoveActiveKey && logoRemoveActive)) {
    logoRemoveActiveKey = '';
    logoRemoveActive = false;
  }
  if (pump) setImmediate(logoQueuePump);
}
function releaseLogoJobForProject(projectId) {
  if (!logoRemoveActiveKey.startsWith(projectId + ':')) return;
  releaseLogoJob(projectId, logoRemoveActiveKey.slice(projectId.length + 1));
}
function logoQueuePump() {
  if (logoRemoveActive || logoRemovePausedQuota || anyLogoJobWaiting()) return;
  while (logoRemoveQueue.length) {
    const next = logoRemoveQueue.shift();
    const p = store.load(next.projectId);
    const sc = p?.s3?.scenes?.find((s) => s.id === next.sceneId);
    // Bỏ job cũ nếu người dùng đã duyệt/bỏ qua/lỗi cảnh này từ trước.
    if (!p || sc?.logoRemoval?.status !== 'queued') continue;
    logoRemoveActive = true;
    logoRemoveActiveKey = logoJobKey(next.projectId, next.sceneId);
    // prepareLogoRemoval() chỉ nhả khóa khi lỗi / hết lượt. Khi ảnh đã tạo xong nó đứng ở
    // waiting_ok và GIỮ khóa cho đến khi người dùng bấm Ổn (hoặc Bỏ qua / Làm lại).
    prepareLogoRemoval(next.projectId, next.sceneId)
      .catch((e) => appendLog('logo remove prepare err: ' + (e?.message || e)));
    return;
  }
}
function enqueueLogoRemoval(projectId, sceneId) {
  if (logoRemoveQueue.some((j) => j.projectId === projectId && j.sceneId === sceneId)) return;
  logoRemoveQueue.push({ projectId, sceneId });
  logoQueuePump();
}
async function queueLogoRemoval(projectId) {
  await writeLock.run(() => {
    const p = store.load(projectId);
    if (!p || !shouldStartLogoRemoval(p)) return;
    ensureLogoRemovalState(p);
    // Xếp hàng theo đúng thứ tự ảnh 1, 2, 3, … chứ không theo thứ tự mảng (có thể bị xóa/chèn).
    for (const sc of p.s3.scenes.slice().sort((a, b) => sceneNo(p, a.id) - sceneNo(p, b.id))) {
      if (sc.logoRemoval?.status === 'queued') enqueueLogoRemoval(projectId, sc.id);
    }
    pushProject(p);
  });
}

async function prepareLogoRemoval(projectId, sceneId) {
  const dailyBefore = cfg.fireflyDailyFree();
  // Qua nửa đêm bộ đếm tự reset: không giữ cờ tạm dừng của ngày hôm trước.
  if (logoRemovePausedQuota?.kind === 'daily' && dailyBefore.count < dailyBefore.limit) logoRemovePausedQuota = null;
  if (logoRemovePausedQuota) return;
  if (dailyBefore.count >= dailyBefore.limit) {
    pauseForDailyFreeLimit();
    await markSceneDailyQuota(projectId, sceneId);
    releaseLogoJob(projectId, sceneId);
    return;
  }
  const prep = await writeLock.run(() => {
    const p = store.load(projectId);
    if (!p || !shouldStartLogoRemoval(p)) return null;
    const sc = p.s3.scenes.find((s) => s.id === sceneId);
    if (!sc?.chosen?.target || !fs.existsSync(sc.chosen.target)) {
      if (sc?.logoRemoval) { sc.logoRemoval.status = 'error'; sc.logoRemoval.error = 'Không tìm thấy ảnh 2K Bước 3 để xóa logo.'; sc.logoRemoval.updatedAt = Date.now(); pushProject(p); }
      return null;
    }
    if (!sc.logoRemoval) sc.logoRemoval = normalizeLogoRemoval({ status: 'queued', sourceTarget: sc.chosen.target, createdAt: Date.now() });
    if (['waiting_ok', 'downloading', 'approved', 'skipped', 'error', 'quota_blocked'].includes(sc.logoRemoval.status)) return null;
    sc.logoRemoval.status = 'preparing';
    sc.logoRemoval.generated = false; // mỗi lần tạo mới là một lượt Firefly mới
    sc.logoRemoval.code = '';
    sc.logoRemoval.error = '';
    const pos = logoQueuePosition(p, sceneId);
    sc.logoRemoval.note = `Đang chuẩn bị xóa logo trên Firefly${pos ? ` (ảnh ${pos})` : ''}…`;
    appendLogoPhase(sc.logoRemoval, sc.logoRemoval.note);
    sc.logoRemoval.sourceTarget = sc.chosen.target;
    sc.logoRemoval.updatedAt = Date.now();
    pushProject(p);
    return { imagePath: sc.chosen.target };
  });
  if (!prep) { releaseLogoJob(projectId, sceneId); return; }
  try {
    await firefly.prepareScene({
      projectId, sceneId, imagePath: prep.imagePath,
      isCanceled: () => canceledProjects.has(projectId) || !logoRemovalEnabled() || !!paused,
      onPhase: (note) => writeLock.run(() => {
        const p = store.load(projectId); const sc = p?.s3.scenes.find((s) => s.id === sceneId);
        if (!sc?.logoRemoval || sc.logoRemoval.status !== 'preparing') return;
        sc.logoRemoval.note = note; appendLogoPhase(sc.logoRemoval, note);
        sc.logoRemoval.updatedAt = Date.now(); pushProject(p);
      }).catch(() => {}),
    });
    await writeLock.run(() => {
      const p = store.load(projectId); const sc = p?.s3.scenes.find((s) => s.id === sceneId);
      if (!sc?.logoRemoval || sc.logoRemoval.status !== 'preparing') return;
      sc.logoRemoval.status = 'waiting_ok';
      // Mốc ảnh ĐÃ tạo xong: nếu tải bị hết lượt thì đổi Gmail chỉ tải lại, không tạo lại.
      sc.logoRemoval.generated = true;
      sc.logoRemoval.note = 'Đã xóa logo trên Firefly. Hãy kiểm tra rồi bấm “Ổn” để tải xuống.';
      appendLogoPhase(sc.logoRemoval, sc.logoRemoval.note);
      sc.logoRemoval.code = '';
      sc.logoRemoval.error = '';
      sc.logoRemoval.updatedAt = Date.now();
      // Mỗi ảnh tạo thành công tiêu 1 lượt free của ngày hôm nay; làm lại cùng ảnh không tính thêm.
      const today = cfg.todayKey();
      if (sc.logoRemoval.fireflyCountedOn !== today) {
        cfg.consumeFireflyDailyFree();
        sc.logoRemoval.fireflyCountedOn = today;
      }
      const usedNow = cfg.fireflyDailyFree();
      if (usedNow.count >= usedNow.limit) {
        pauseForDailyFreeLimit();
        blockNextQueuedForDaily(p, sceneId);
      }
      pushProject(p);
    });
  } catch (e) {
    const quota = e?.code === 'FIREFLY_QUOTA' || /hết lượt|quota|generative credits|limit reached|nâng cấp.*(?:trả phí|premium|paid)|upgrade.*paid plan/i.test(String(e?.message || ''));
    await writeLock.run(() => {
      const p = store.load(projectId); const sc = p?.s3.scenes.find((s) => s.id === sceneId);
      if (!sc?.logoRemoval || sc.logoRemoval.status !== 'preparing') return;
      sc.logoRemoval.status = quota ? 'quota_blocked' : 'error';
      sc.logoRemoval.code = e?.code || '';
      sc.logoRemoval.error = quota ? 'Firefly đang dùng lượt free hàng ngày và đã hết. Vui lòng đổi mail khác rồi tiếp tục.' : (e?.message || 'Lỗi xóa logo.');
      sc.logoRemoval.note = sc.logoRemoval.error;
      appendLogoPhase(sc.logoRemoval, sc.logoRemoval.note);
      sc.logoRemoval.updatedAt = Date.now();
      pushProject(p);
    });
    if (quota) {
      // Giữ hàng đợi lại, không bỏ cảnh của dự án khác; chỉ tạm dừng cho đến khi user đổi tài khoản.
      logoRemovePausedQuota = { at: Date.now(), message: 'Firefly đang dùng lượt free hàng ngày và đã hết. Vui lòng đổi mail khác rồi tiếp tục.' };
    }
    // Lỗi/hết lượt là trạng thái cuối của ảnh này: nhả khóa để không chặn vĩnh viễn hàng đợi.
    releaseLogoJob(projectId, sceneId);
  }
}

async function downloadLogoRemoval(projectId, sceneId) {
  const prep = await writeLock.run(() => {
    const p = store.load(projectId); if (!p) return { code: 404 };
    const sc = p.s3.scenes.find((s) => s.id === sceneId);
    if (!sc?.logoRemoval) return { code: 400, error: 'Cảnh này chưa có trạng thái xóa logo.' };
    if (sc.logoRemoval.status !== 'waiting_ok') return { code: 400, error: 'Chỉ có thể tải xuống khi cảnh đang chờ bạn bấm “Ổn”.' };
    const target = logoCleanTargetPath(p, sceneId);
    const oldClean = sc.logoRemoval.cleanFile;
    sc.logoRemoval.status = 'downloading';
    sc.logoRemoval.code = '';
    sc.logoRemoval.error = '';
    sc.logoRemoval.note = 'Đang tải ảnh sạch từ Firefly…';
    appendLogoPhase(sc.logoRemoval, sc.logoRemoval.note);
    sc.logoRemoval.updatedAt = Date.now();
    pushProject(p);
    return { target, source: sc.chosen?.target, oldClean };
  });
  if (prep.code) return prep;
  try {
    const result = await firefly.downloadPrepared({
      projectId, sceneId, targetPath: prep.target,
      // Lỗi/hết lượt/tạm dừng: Firefly đóng tab ngay, không giữ Chrome ăn RAM.
      isCanceled: () => canceledProjects.has(projectId) || !logoRemovalEnabled() || !!paused,
      onPhase: (note) => writeLock.run(() => {
        const p = store.load(projectId); const sc = p?.s3.scenes.find((s) => s.id === sceneId);
        if (!sc?.logoRemoval || sc.logoRemoval.status !== 'downloading') return;
        sc.logoRemoval.note = note; appendLogoPhase(sc.logoRemoval, note);
        sc.logoRemoval.updatedAt = Date.now(); pushProject(p);
      }).catch(() => {}),
    });
    await writeLock.run(() => {
      const p = store.load(projectId); const sc = p?.s3.scenes.find((s) => s.id === sceneId);
      if (!sc?.logoRemoval) return;
      // Validate dimensions roughly match source if available.
      const srcSize = prep.source && fs.existsSync(prep.source) ? imageDimensions(prep.source) : null;
      // Firefly cắt 9:16 nên chiều cao ảnh sạch có thể nhỏ hơn ảnh 2K gốc vài px.
      // Chỉ chấp nhận cùng chiều rộng và đúng tỷ lệ 9:16, không báo lỗi sai như so sánh bằng nhau cũ.
      const is916 = Math.abs(result.width / result.height - 9 / 16) < 0.01;
      const okSize = !srcSize
        || (result.width === srcSize.width && result.height === srcSize.height)
        || (result.width <= srcSize.width && result.height <= srcSize.height && is916);
      if (!okSize) {
        sc.logoRemoval.status = 'error';
        sc.logoRemoval.error = `Ảnh tải về ${result.width}×${result.height} khác kích thước gốc ${srcSize.width}×${srcSize.height}.`;
        sc.logoRemoval.note = sc.logoRemoval.error;
        try { fs.rmSync(result.file, { force: true }); } catch (_) {}
        sc.logoRemoval.updatedAt = Date.now();
        pushProject(p);
        return;
      }
      discardOldCleanFile(p, prep.oldClean, result.file);
      sc.logoRemoval.status = 'approved';
      sc.logoRemoval.cleanFile = result.file;
      sc.logoRemoval.code = '';
      sc.logoRemoval.error = '';
      sc.logoRemoval.note = 'Đã lưu ảnh sạch vào thư mục anhdaxoalogo.';
      appendLogoPhase(sc.logoRemoval, sc.logoRemoval.note);
      sc.logoRemoval.updatedAt = Date.now();
      cleanupLogoOriginalsIfComplete(p);
      pushProject(p);
    });
    await firefly.discardScene({ projectId, sceneId }).catch(() => {});
    // Ảnh này đã xong: mới được mở ảnh kế tiếp trong hàng đợi.
    releaseLogoJob(projectId, sceneId);
    return { ok: true };
  } catch (e) {
    const quota = e?.code === 'FIREFLY_QUOTA' || /hết lượt|quota|generative credits|limit reached|nâng cấp.*(?:trả phí|premium|paid)|upgrade.*paid plan/i.test(String(e?.message || ''));
    await writeLock.run(() => {
      const p = store.load(projectId); const sc = p?.s3.scenes.find((s) => s.id === sceneId);
      if (!sc?.logoRemoval) return;
      sc.logoRemoval.status = quota ? 'quota_blocked' : 'error';
      // Tab Firefly đã đóng ngay: không còn ảnh để tải lại, sẽ tạo lại đúng ảnh này bằng Gmail mới.
      sc.logoRemoval.generated = false;
      sc.logoRemoval.code = e?.code || '';
      sc.logoRemoval.error = quota ? 'Firefly đang dùng lượt free hàng ngày và đã hết. Vui lòng đổi mail khác rồi tiếp tục.' : (e?.message || 'Lỗi tải ảnh sạch.');
      sc.logoRemoval.note = quota
        ? 'Firefly đã đóng tab để nhẹ RAM. Đăng nhập Gmail khác rồi bấm “Đã đổi Gmail khác, tiếp tục”; tool tạo lại đúng ảnh này, không làm lại ảnh cũ.'
        : sc.logoRemoval.error;
      appendLogoPhase(sc.logoRemoval, sc.logoRemoval.note);
      sc.logoRemoval.updatedAt = Date.now();
      pushProject(p);
    });
    if (quota) logoRemovePausedQuota = { at: Date.now(), message: 'Firefly đang dùng lượt free hàng ngày và đã hết. Vui lòng đổi mail khác rồi tiếp tục.' };
    releaseLogoJob(projectId, sceneId);
    return { code: 400, error: e?.message || 'Lỗi tải ảnh sạch.' };
  }
}

async function save2k(projectId, sceneId, img) {
  const initial = store.load(projectId);
  const selected = initial?.s3.scenes.find((x) => x.id === sceneId)?.chosen;
  if (!selected || selected.imageId !== img.id || !selected.target) return;
  const identity = { runId: selected.runId, imageId: selected.imageId, target: selected.target };
  const isCurrent = (requireSaving = false) => {
    const p = store.load(projectId);
    const choice = p?.s3.scenes.find((x) => x.id === sceneId)?.chosen;
    return choice && choice.runId === identity.runId && choice.imageId === identity.imageId
      && choice.target === identity.target && (!requireSaving || choice.status === 'saving') ? p : null;
  };
  const ext = path.extname(identity.target) || '.png';
  const stem = identity.target.slice(0, -ext.length);
  const tempTarget = `${stem}.pending-${identity.runId}-${identity.imageId}-${store.uid(3)}${ext}`;
  let downloaded = null;
  try {
    const p = isCurrent();
    if (!p) return;
    const sc = p.s3.scenes.find((x) => x.id === sceneId);
    // Ảnh xem trước đã được nâng 2K ở bước 3 → dùng lại file đó, không tải lại từ Flow.
    const cached = img.flowRef ? findHq(projectId, img.flowRef) : null;
    if (cached) {
      const src = store.assetPath(projectId, cached);
      downloaded = `${tempTarget}.cached${path.extname(src) || ext}`;
      fs.copyFileSync(src, downloaded);
    } else {
      downloaded = await flow.download2k({ url: sc.flowUrl, flowRef: img.flowRef, target: tempTarget, projectId, isCanceled: () => canceledProjects.has(projectId) });
    }
    if (!downloaded || !fs.existsSync(downloaded)) throw new Error('Flow không trả về file 2K.');
    const size = imageDimensions(downloaded);
    if (!is2kDimensions(size)) throw new Error(`File tải về ${size ? size.width + '×' + size.height : 'không đọc được'} chưa đạt 2K.`);
    if (!isCurrent()) return;
    const finalTarget = `${stem}${path.extname(downloaded) || ext}`;
    // Ghi ra file tạm rồi đổi tên: không bao giờ để lại file kết quả cụt khi mất điện/đầy đĩa.
    const tmpFinal = `${finalTarget}.part-${store.uid(3)}`;
    fs.copyFileSync(downloaded, tmpFinal);
    fs.renameSync(tmpFinal, finalTarget);
    await writeLock.run(() => {
      const latest = isCurrent();
      if (!latest) { fs.rmSync(finalTarget, { force: true }); return; }
      const current = latest.s3.scenes.find((x) => x.id === sceneId).chosen;
      current.status = 'saved';
      current.target = finalTarget;
      delete current.error;
      // Không tự sang Bước 4 tại đây: chỉ bắt đầu sau khi bấm “Tải hết ảnh về & Dọn dẹp”.
      pushProject(latest);
    });
  } catch (e) {
    await writeLock.run(() => {
      const latest = isCurrent(true);
      if (!latest) return;
      const current = latest.s3.scenes.find((x) => x.id === sceneId).chosen;
      current.status = 'error';
      current.error = e.message;
      pushProject(latest);
    });
  } finally {
    if (downloaded) fs.rmSync(downloaded, { force: true });
    fs.rmSync(tempTarget + '.part', { force: true });
  }
}
app.post('/api/projects/:id/retry-save', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id);
      const s = p?.s3.scenes.find((x) => x.id === req.body.sceneId);
      const img = s?.runs.find((r) => r.id === s.chosen?.runId)?.images.find((i) => i.id === s.chosen?.imageId);
      if (!img) return { code: 400, error: 'Không tìm thấy ảnh đã chọn để lưu lại.' };
      if (!s.chosen.target) s.chosen.target = sceneTargetPath(p, s.id);
      s.chosen.status = 'saving'; delete s.chosen.error;
      delete p.cleaned; // ảnh 2K sắp đổi → phải tải/dọn lại mới sang Bước 4
      // Reset logo removal for this scene because source 2K will change.
      if (s.logoRemoval && s.logoRemoval.status !== 'approved') s.logoRemoval = null;
      pushProject(p);
      return { p, s, img };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ ok: true });
    save2k(out.p.id, out.s.id, out.img);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/projects/:id/logo-remove/ok', async (req, res) => {
  try {
    const { sceneId } = req.body || {};
    const result = await downloadLogoRemoval(req.params.id, sceneId);
    if (result?.code) return res.status(result.code).json({ error: result.error });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// “Chạy tất cả” Bước 4: đưa MỌI ảnh chưa xong vào hàng chờ theo đúng số 01, 02, 03…
// Tool vẫn mở từng ảnh một; đạt 3 ảnh/mail thì dừng và báo đổi Gmail (không tự tăng lượt).
// Ảnh đã có ảnh sạch (approved/skipped) KHÔNG bao giờ bị đưa lại vào hàng đợi.
app.post('/api/projects/:id/logo-remove/run-all', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      if (!shouldStartLogoRemoval(p)) return { code: 400, error: 'Hãy hoàn tất Bước 3: bấm “Tải hết ảnh về & Dọn dẹp” rồi mới xóa logo.' };
      ensureLogoRemovalState(p);
      const daily = cfg.fireflyDailyFree();
      // Qua ngày mới thì cờ tạm dừng của hôm trước không còn ý nghĩa.
      if (logoRemovePausedQuota?.kind === 'daily' && daily.count < daily.limit) logoRemovePausedQuota = null;
      let queued = 0;
      const ordered = p.s3.scenes.slice().sort((a, b) => sceneNo(p, a.id) - sceneNo(p, b.id));
      for (const sc of ordered) {
        const st = sc.logoRemoval?.status;
        if (['approved', 'skipped', 'waiting_ok', 'preparing', 'downloading', 'quota_blocked'].includes(st)) continue;
        if (st === 'error' || !st) {
          sc.logoRemoval = normalizeLogoRemoval({ status: 'queued', note: 'Đã bấm “Chạy tất cả” — chờ đến lượt', sourceTarget: sc.chosen?.target, createdAt: Date.now(), updatedAt: Date.now() });
        }
        queued++;
      }
      pushProject(p);
      return { queued };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    await queueLogoRemoval(req.params.id);
    res.json({ ok: true, queued: out.queued });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/projects/:id/logo-remove/retry', async (req, res) => {
  try {
    const { sceneId } = req.body || {};
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      if (!shouldStartLogoRemoval(p)) return { code: 400, error: 'Hãy hoàn tất Bước 3: bấm “Tải hết ảnh về & Dọn dẹp” rồi mới xóa logo.' };
      const sc = findLogoRemovalScene(p, sceneId); if (!sc) return { code: 404, error: 'Không tìm thấy cảnh.' };
      if (!sc.chosen?.target || !fs.existsSync(sc.chosen.target)) return { code: 400, error: 'Không tìm thấy ảnh 2K Bước 3 để xóa logo.' };
      if (sc.logoRemoval?.status === 'approved') return { code: 400, error: 'Cảnh này đã có ảnh sạch được xác nhận.' };
      sc.logoRemoval = { status: 'queued', code: '', error: '', note: 'Chờ xóa logo sau Bước 3', sourceTarget: sc.chosen.target, cleanFile: '', createdAt: Date.now(), updatedAt: Date.now() };
      logoRemovePausedQuota = null;
      pushProject(p);
      return { ok: true };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    // Làm lại từ waiting_ok: nhả khóa cũ trước khi xếp lại hàng đợi.
    releaseLogoJob(req.params.id, sceneId, false);
    firefly.discardScene({ projectId: req.params.id, sceneId }).catch(() => {});
    enqueueLogoRemoval(req.params.id, sceneId);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/projects/:id/logo-remove/skip', async (req, res) => {
  try {
    const { sceneId } = req.body || {};
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      const sc = findLogoRemovalScene(p, sceneId); if (!sc) return { code: 404, error: 'Không tìm thấy cảnh.' };
      if (!sc.logoRemoval || !LOGO_PENDING_STATUSES.includes(sc.logoRemoval.status)) return { code: 400, error: 'Chỉ có thể bỏ qua cảnh đang chờ xử lý logo.' };
      firefly.discardScene({ projectId: p.id, sceneId }).catch(() => {});
      sc.logoRemoval.status = 'skipped';
      sc.logoRemoval.code = '';
      sc.logoRemoval.error = '';
      sc.logoRemoval.note = 'Bạn đã bỏ qua xóa logo; ảnh gốc có logo được giữ lại.';
      sc.logoRemoval.updatedAt = Date.now();
      cleanupLogoOriginalsIfComplete(p);
      pushProject(p);
      return { ok: true };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    // Bỏ qua ảnh đang chờ Ổn thì mới được mở ảnh kế tiếp.
    releaseLogoJob(req.params.id, sceneId);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/projects/:id/logo-remove/resume', async (req, res) => {
  try {
    // Người dùng xác nhận đã đổi Gmail: mở một lượt free mới (3 ảnh) cho tài khoản mới.
    cfg.resetFireflyDailyFree();
    logoRemovePausedQuota = null;
    const allowed = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return false;
      if (!shouldStartLogoRemoval(p)) return false;
      // Đổi Gmail chỉ mở lại ĐÚNG ảnh số kế tiếp chưa có ảnh sạch (01 → 02 → 03 → 04…).
      // Ảnh đã xong / đang chờ Ổn bị bỏ qua, nên 3 ảnh đầu không bao giờ bị làm lại.
      const resumeScene = nextLogoScene(p, true);
      let changed = false;
      for (const sc of p.s3.scenes) {
        const lr = sc.logoRemoval;
        // Có file ảnh sạch theo số thứ tự thì coi như đã xong, dù trạng thái cũ còn sót lại.
        if (logoSceneDone(p, sc)) continue;
        // Không đụng ảnh đang chạy / chờ bấm Ổn; chỉ xét đúng ảnh kế tiếp.
        if (sc.id !== resumeScene?.id) continue;
        // Chỉ xử lý cảnh bị hết lượt. Ảnh đã xóa xong / đang chờ Ổn giữ nguyên,
        // không đưa lại vào hàng đợi (không làm lại ảnh đã làm).
        if (lr?.status !== 'quota_blocked') continue;
        // Ảnh đã tạo xong mà chỉ tải bị chặn → về waiting_ok để bấm Ổn tải lại.
        // Ảnh chưa tạo được → về queued để tạo tiếp (ảnh kế tiếp, không làm lại ảnh cũ).
        const next = logoResumeStatus(lr, firefly.hasSceneTab(req.params.id, sc.id));
        lr.status = next;
        // Ảnh này sẽ tạo lại bằng Gmail mới → phải được tính vào lượt free mới.
        lr.fireflyCountedOn = '';
        lr.code = '';
        lr.error = '';
        lr.note = next === 'waiting_ok'
          ? 'Ảnh đã tạo trên Firefly. Bấm “Ổn” để tải lại; tool không tạo lại ảnh.'
          : 'Firefly đã đóng tab lỗi để nhẹ RAM. Ảnh này sẽ được tạo lại bằng Gmail mới; ảnh cũ không bị làm lại.';
        lr.updatedAt = Date.now();
        changed = true;
      }
      if (changed) pushProject(p);
      return true;
    });
    if (!allowed) return res.status(400).json({ error: 'Hãy hoàn tất Bước 3: bấm “Tải hết ảnh về & Dọn dẹp” rồi mới xóa logo.' });
    await queueLogoRemoval(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/projects/:id/open-logo-output', (req, res) => {
  const p = store.load(req.params.id);
  if (!p) return res.sendStatus(404);
  const dir = logoRemovalDirFor(p);
  require('child_process').spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true });
});

// Lấy lại bản ảnh NÉT (2K) cho 1 lượt cũ (ảnh xem trước đã lưu là bản nhỏ).
app.post('/api/projects/:id/upgrade-run', async (req, res) => {
  try {
    const out = await writeLock.run(() => {
      const p = store.load(req.params.id); if (!p) return { code: 404 };
      const { stage, runId, sceneId } = req.body;
      const selectedIds = Array.isArray(req.body.imageIds) ? new Set(req.body.imageIds) : null;
      const st = stageState(p, stage, sceneId); const run = st?.runs.find((r) => r.id === runId);
      if (!run || !run.images.length) return { code: 400, error: 'Không tìm thấy lượt này.' };
      if (!st.flowUrl) return { code: 400, error: 'Lượt này chưa có dự án Flow.' };
      if (paused) return { code: 400, error: 'Tool đang tạm dừng vì Flow cảnh báo.' };
      // Bấm hai lần (hoặc bấm trong lúc đang tự lấy 2K) không được mở hai luồng ghi cùng file.
      if (run.upgrading) return { code: 409, error: 'Lượt này đang lấy bản 2K. Đợi xong rồi thử lại.' };
      const imagesToUpgrade = selectedIds ? run.images.filter((im) => selectedIds.has(im.id)) : run.images;
      if (!imagesToUpgrade.length) return { code: 400, error: 'Không tìm thấy ảnh cần lấy bản nét trong lượt này.' };
      run.upgrading = true; run.upgradeProgress = { done: 0, total: imagesToUpgrade.length };
      delete run.upgradeError; pushProject(p);
      return { projectId: p.id, stage, runId, sceneId, flowUrl: st.flowUrl, imagesToUpgrade, outputDir: store.outputDirFor(p) };
    });
    if (out.code) return res.status(out.code).json({ error: out.error });
    res.json({ ok: true });
    const { projectId, stage, runId, sceneId, flowUrl, imagesToUpgrade, outputDir } = out;
    const tmp = path.join(outputDir, '_tam');
    try { fs.mkdirSync(tmp, { recursive: true }); }
    catch (e) {
      await writeLock.run(() => withRun(projectId, stage, sceneId, runId, (run2) => { run2.upgrading = false; run2.upgradeError = 'Không ghi được thư mục tạm: ' + e.message; }));
      return;
    }
    const finish = (fn) => writeLock.run(() => { const p2 = store.load(projectId); if (!p2) return; const st2 = stageState(p2, stage, sceneId); const run2 = st2?.runs.find((r) => r.id === runId); if (run2) fn(run2, st2, p2); pushProject(p2); });
    try {
      let okCount = 0;
      let failedCount = 0;
      for (const im of imagesToUpgrade) {
        if (paused) break;
        if (!im.flowRef) continue;
        try {
          const final = await flow.download2k({ url: flowUrl, flowRef: im.flowRef, target: path.join(tmp, `up-${im.flowRef}.png`), projectId, isCanceled: () => canceledProjects.has(projectId) });
          if (!final || !fs.existsSync(final)) continue;
          const size = imageDimensions(final);
          if (!is2kDimensions(size)) continue;
          const nf = store.saveAsset(projectId, fs.readFileSync(final), path.extname(final).slice(1) || 'jpg');
          await finish((run2, st2) => {
            const img = run2.images.find((x) => x.id === im.id); if (!img) return;
            const old = img.file; img.file = nf;
            if (st2.approved === old) { st2.approved = nf; if (st2.hq?.for === old) st2.hq = { status: 'done', for: old }; }
            okCount++;
          });
          fs.rmSync(final, { force: true });
        } catch (_) { failedCount++; /* ảnh lỗi thì giữ nguyên */ }
      }
      await finish((run2) => {
        run2.upgrading = false;
        delete run2.upgradeProgress;
        if (!okCount) run2.upgradeError = 'Không lấy được bản 2K (có thể ảnh đã bị xóa khỏi Flow).';
        else if (failedCount) run2.upgradeError = `Đã lấy nét ${okCount}/${imagesToUpgrade.length} ảnh; còn ${failedCount} ảnh chưa lên 2K. Bạn có thể thử lại.`;
        else delete run2.upgradeError;
      });
    } catch (e) {
      await finish((run2) => { run2.upgrading = false; delete run2.upgradeProgress; run2.upgradeError = e.message; });
    }
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// mở thư mục kết quả trong Explorer
app.post('/api/projects/:id/open-output', (req, res) => {
  const p = store.load(req.params.id);
  if (!p) return res.sendStatus(404);
  require('child_process').spawn('explorer.exe', [store.outputDirFor(p)], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true });
});

// Dọn prompt 35mm còn lưu trong project.json của các dự án CŨ. Đổi mẫu mặc định chỉ có tác dụng
// với dự án mới — nếu không migrate, user cập nhật app vẫn thấy đoạn đã bỏ trong dự án cũ.
try { store.migrateProjects(appendLog); } catch (e) { appendLog('prompt migrate lỗi: ' + e.message); }

let interruptedCount = 0;
// Khi máy chủ khởi động lại, các lượt đang chạy dở không còn ai theo dõi: đánh dấu lỗi để giao diện không treo.
function recoverInterruptedRuns() {
  for (const p of store.list()) {
    let n = 0;
    for (const runs of [p.s1.runs, p.s2.runs, ...p.s3.scenes.map((s) => s.runs)]) {
      for (const r of runs) if (r.status === 'running' || r.status === 'queued') { r.status = 'error'; r.error = 'Bị gián đoạn vì tool khởi động lại. Bấm chạy lại.'; n++; }
      for (const r of runs) if (r.upgrading) {
        r.upgrading = false;
        r.preview2kPending ||= r.images.map((im) => im.flowRef).filter(Boolean);
        n++;
      }
    }
    for (const sc of p.s3.scenes) if (sc.chosen?.status === 'saving') { sc.chosen.status = 'error'; sc.chosen.error = 'Bị gián đoạn khi lưu 2K. Bấm “Lưu lại”.'; n++; }
    // waiting_ok cũng phải đưa về error: tool mất bộ nhớ tab Firefly sau khi khởi động lại,
    // nếu cứ giữ trạng thái chờ Ổn thì hàng đợi Bước 4 bị kẹt vĩnh viễn (kể cả dự án khác).
    for (const sc of p.s3.scenes) if (['queued', 'preparing', 'waiting_ok', 'downloading'].includes(sc.logoRemoval?.status)) { sc.logoRemoval.status = 'error'; sc.logoRemoval.error = 'Bị gián đoạn vì tool khởi động lại. Bấm “Làm lại xóa logo”.'; sc.logoRemoval.updatedAt = Date.now(); n++; }
    if (n) { store.save(p); removeStaleTemp(store.outputDirFor(p)); interruptedCount += n; }
  }
}
recoverInterruptedRuns();
// Dọn backup cũ hơn 2 ngày khi khởi động.
try {
  const backupRoot = path.join(cfg.dataDir, 'backups');
  if (fs.existsSync(backupRoot)) {
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(backupRoot)) {
      if (name.startsWith('.tmp-')) continue; // thư mục tạm không bị dọn, dù để lại từ lần trước
      const full = path.join(backupRoot, name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory() && st.mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
      } catch (_) {}
    }
  }
} catch (_) {}
// Tự sao lưu nếu đã hơn 7 ngày chưa backup (chạy nền, không chặn khởi động).
try {
  const c = cfg.get();
  if (!c.lastBackupAt || Date.now() - c.lastBackupAt > 7 * 24 * 60 * 60 * 1000) {
    setTimeout(() => {
      doBackup()
        .then(() => appendLog('Tự sao lưu dữ liệu (định kỳ 7 ngày).'))
        .catch((e) => appendLog('Tự sao lưu lỗi: ' + e.message));
    }, 10000);
  }
} catch (_) {}
// Dọn tab Flow còn sót từ lần chạy trước (dự án có thể đã bị xóa nhưng tab vẫn mở khiến Flow chạy tiếp).
// Phải xong việc dọn rồi mới bắt đầu lấy lại 2K, tránh đóng nhầm tab vừa mở.
flow.closeStrayTabs().catch(() => {}).finally(() => {
  if (!paused) resumePendingSharpUpgrades(true);
  if (logoRemovalEnabled()) {
    for (const meta of store.list()) queueLogoRemoval(meta.id).catch((e) => appendLog('logo remove resume startup err: ' + (e?.message || e)));
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Flow Lookbook đang chạy: http://localhost:${PORT}\n`);
});
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`\n  Cổng ${PORT} đang được chương trình khác sử dụng. Hãy đóng app Flow Lookbook cũ rồi mở lại.\n`);
  } else {
    console.error('\n  Không khởi động được máy chủ Flow Lookbook:', err);
  }
  if (!process.versions.electron) process.exit(1);
});

