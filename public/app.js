/* Flow Lookbook — giao diện. JS thuần, không cần build. */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Link manifest cập nhật do server cung cấp (đặt trong server.js, không cần người dùng điền).
let UPDATE_MANIFEST_URL = '';
let CURRENT_VERSION = '';
const compareVer = (a, b) => {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
};
const S = { projects: [], selectedProjectIds: new Set(), projectDeleteApi: false, id: null, p: null, cfg: {}, koc: [], flow: {}, stage: 1, open: new Set(), dismissed: new Set(), hidePause: null };
const projectNameOrder = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
const sortedProjects = () => [...S.projects].sort((a, b) => projectNameOrder.compare(a.name || '', b.name || ''));
const normName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const duplicateName = (name, excludeId) => S.projects.some((p) => p.id !== excludeId && normName(p.name) === normName(name));
const WELCOME = document.querySelector('#main').innerHTML; // màn hình chính (hướng dẫn 3 bước)
function showWelcome() {
  S.id = null; S.p = null; document.title = 'Flow Lookbook — Tạo ảnh lookbook thời trang hàng loạt với Google Flow';
  try { localStorage.removeItem('lastProject'); } catch (_) {}
  document.querySelector('#main').innerHTML = WELCOME; renderSidebar();
}

// Mỗi lượt luôn ra đúng 4 ảnh, 9:16: lưới kết quả luôn là 4 cột để thấy đủ 4 ảnh trên một hàng, ở mọi bước.
document.documentElement.style.setProperty('--cols', '4');

// ---------- biểu tượng ----------
const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const I = {
  zoom: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
  redo: ic('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'),
  reload: ic('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'),
  crop: ic('<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>'),
  trash: ic('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>'),
  check: ic('<path d="M20 6L9 17l-5-5"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  menu: ic('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  swap: ic('<path d="M7 7h13l-3-3M17 17H4l3 3"/>'),
  x: ic('<path d="M18 6L6 18M6 6l12 12"/>'),
  left: ic('<path d="M15 18l-6-6 6-6"/>'),
  right: ic('<path d="M9 18l6-6-6-6"/>'),
  fit: ic('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  folder: ic('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  circle: ic('<circle cx="12" cy="12" r="8.5"/>'),
  checkFill: ic('<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><path d="M7.8 12.4l3 3 5.5-6" stroke="#fff" stroke-width="2.4"/>'),
  chevL: ic('<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>'),
  chevR: ic('<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>'),
  image: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  play: ic('<path d="M6 4l14 8-14 8z"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};

async function api(method, url, body, raw) {
  const opt = { method, headers: {} };
  if (raw) opt.body = raw; else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Lỗi ${r.status}`);
  return data;
}
function toast(msg, kind = '', opts = {}) {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const tx = document.createElement('span'); tx.className = 'ttxt'; tx.textContent = msg; el.append(tx);
  const btns = document.createElement('div'); btns.className = 'tbtns';
  if (kind === 'err' && /flow/i.test(msg)) { const o = document.createElement('button'); o.className = 'btn sm'; o.textContent = 'Mở Flow'; o.title = 'Mở Flow để xem và xử lý trực tiếp'; o.onclick = () => { api('POST', '/api/flow/reveal', S.id ? { projectId: S.id, stage: S.stage } : {}).catch(fail); }; btns.append(o); }
  if (opts.action) { const o = document.createElement('button'); o.className = 'btn sm primary'; o.textContent = opts.action.label; o.title = opts.action.title || ''; o.onclick = () => { try { opts.action.onClick(); } catch (er) { fail(er); } }; btns.append(o); }
  const x = document.createElement('button'); x.className = 'tclose'; x.type = 'button'; x.setAttribute('aria-label', 'Tắt thông báo'); x.title = 'Tắt'; x.textContent = '×'; btns.append(x);
  el.append(btns);
  const duration = opts.duration || 8000;
  const dismiss = setTimeout(() => el.remove(), duration);
  x.onclick = () => { clearTimeout(dismiss); el.remove(); };
  const container = $('#toasts');
  container.append(el);
  while (container.children.length > 5) container.firstElementChild.remove();
  return el;
}
const fail = (e) => toast(e.message || String(e), 'err');
const imgUrl = (f) => `/files/p/${S.id}/${f}`;
const kocUrl = (id) => `/files/koc/${encodeURIComponent(id)}`;
const PK = { 1: 's1', 2: 's2', 3: 's3' };

// ---------- giao diện sáng / tối ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch (_) {}
  $('#btnTheme').innerHTML = t === 'dark' ? I.sun : I.moon;
}
function curTheme() { return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }
$('#btnTheme').onclick = () => applyTheme(curTheme() === 'dark' ? 'light' : 'dark');
applyTheme(curTheme());

// ---------- tải lại giao diện (giữ nguyên dữ liệu và việc đang chạy) ----------
// Chỉ nạp lại PHẦN GIAO DIỆN. Máy chủ, hàng đợi và mọi lượt đang chạy vẫn tiếp tục;
// giao diện mới tự nối lại và hiển thị đúng trạng thái hiện tại — không mất gì.
async function reloadUI() {
  try {
    // Lưu ngay chữ đang gõ trong ô prompt (nếu có) để nạp lại không mất chữ.
    const vi = $('#vi'), en = $('#en');
    if (S.p && vi && en) {
      const k = PK[S.stage];
      if (tr[k]) clearTimeout(tr[k].timer);
      await api('PATCH', `/api/projects/${S.p.id}`, { [k]: { promptVi: vi.value, promptEn: en.value, enFrom: (tr[k] && tr[k].enFrom) || vi.value } }).catch(() => {});
    }
    clearTimeout(saveTimer);
  } catch (_) {}
  location.reload();
}
$('#btnReload').onclick = () => reloadUI();

// ---------- menu chuột phải: nút "Tải lại giao diện" ----------
const ctxEl = $('#ctxmenu');
const hideCtx = () => ctxEl.classList.add('hidden');
function showCtx(x, y) {
  ctxEl.innerHTML = `<button class="ctxitem" type="button" role="menuitem">${I.reload}<span>Tải lại giao diện</span></button>`;
  ctxEl.querySelector('.ctxitem').onclick = () => { hideCtx(); reloadUI(); };
  ctxEl.classList.remove('hidden');
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 8)) + 'px';
  ctxEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
document.addEventListener('contextmenu', (e) => { e.preventDefault(); showCtx(e.clientX, e.clientY); });
document.addEventListener('pointerdown', (e) => { if (!ctxEl.contains(e.target)) hideCtx(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); });
window.addEventListener('blur', hideCtx);
document.addEventListener('scroll', hideCtx, true);

// Máy khác lần đầu mở app mà chưa từng chọn thư mục lưu ảnh → hiện thông báo, có nút chọn ngay.
function promptOutputFolder() {
  if (S.cfg.fixedOutputRoot || S.cfg.outputRootChosen) return;
  const action = window.flowBridge?.pickFolder
    ? {
        label: 'Chọn thư mục…', title: 'Chọn nơi lưu ảnh 2K',
        onClick: async () => {
          try {
            const dir = await window.flowBridge.pickFolder(S.cfg.outputRoot || '');
            if (!dir) return;
            await api('POST', '/api/config', { outputRoot: dir });
            S.cfg.outputRoot = dir; S.cfg.outputRootChosen = true;
            toast('Đã lưu thư mục lưu ảnh: ' + dir, 'ok', { duration: 10000 });
          } catch (er) { fail(er); }
        },
      }
    : { label: 'Mở Cài đặt', title: 'Gõ hoặc dán đường dẫn thư mục trong Cài đặt', onClick: () => $('#btnSettings').click() };
  toast('Chưa chọn thư mục lưu ảnh 2K. Bấm “Chọn thư mục…” để tool lưu ảnh đúng chỗ (hoặc vào Cài đặt).', 'warn', { duration: 60000, action });
}

// ---------- khởi động ----------
async function init() {
  S.cfg = await api('GET', '/api/config');
  try {
    const v = await api('GET', '/api/version');
    CURRENT_VERSION = v.version || '';
    UPDATE_MANIFEST_URL = v.updateUrl || '';
    const el = $('#appVer'); if (el && CURRENT_VERSION) el.textContent = 'v' + CURRENT_VERSION;
  } catch (_) {}
  // Bản mới vừa cài xong và mở lại: chỉ báo thành công nếu đúng phiên bản đang chạy.
  try {
    const done = await window.flowBridge?.consumeUpdateSuccess?.();
    if (done && (!CURRENT_VERSION || compareVer(done, CURRENT_VERSION) === 0)) {
      toast('Cập nhật phiên bản v' + done + ' thành công!', 'ok', { duration: 15000 });
    }
  } catch (_) {}
  S.koc = await api('GET', '/api/koc');
  S.projects = await api('GET', '/api/projects');
  try { S.projectDeleteApi = (await api('GET', '/api/projects/delete-capabilities')).safeDelete === true; } catch (_) { S.projectDeleteApi = false; }
  // Tự kiểm tra cập nhật khi mở app (chạy ngầm, không chặn giao diện).
  setTimeout(() => { checkUpdate(false).catch(() => {}); }, 1200);
  renderSidebar(); refreshFlow(); setInterval(refreshFlow, 6000);
  const last = localStorage.getItem('lastProject');
  if (last && S.projects.find((p) => p.id === last)) await selectProject(last);
  const es = new EventSource('/api/events');
  es.onopen = async () => {
    const id = S.id;
    if (!id) return;
    try {
      const data = await api('GET', `/api/projects/${id}`);
      if (S.id !== id) return;
      const previousStage = S.stage;
      S.p = data;
      if (data.stage > previousStage) {
        S.stage = data.stage;
        renderMain();
        const g = data.autoGo;
        if (g && g.to === data.stage && g.at !== S.lastGo) {
          S.lastGo = g.at;
          toast(`${data.name}: đã tự động chuyển sang Bước ${g.to}.`, 'ok');
        }
      } else refresh();
    } catch (_) {}
  };
  es.onmessage = (e) => {
    const { type, data } = JSON.parse(e.data);
    if (type !== 'project') return;
    const i = S.projects.findIndex((p) => p.id === data.id);
    if (i >= 0) {
      announceProjectCompletions(S.projects[i], data);
      S.projects[i] = data;
    } else S.projects.unshift(data);
    if (data.id === S.id) {
      S.p = data; refresh();
      const g = data.autoGo;
      if (g && g.at !== S.lastGo && Date.now() - g.at < 30000) {
        S.lastGo = g.at;
        if (S.stage === g.to - 1 && data.stage >= g.to) {
          S.stage = g.to;
          renderMain();
          toast(`${data.name}: đã tự động chuyển sang Bước ${g.to}.`, 'ok');
        }
      }
    }
    renderSidebar();
  };
  promptOutputFolder();
}
function projectWorkItems(project) {
  return [
    { key: '1', stage: 1, state: project.s1 },
    { key: '2', stage: 2, state: project.s2 },
    ...(project.s3?.scenes || []).map((scene) => ({ key: `3:${scene.id}`, stage: 3, scene, state: scene })),
  ];
}
function announceProjectCompletions(previous, current) {
  const oldItems = new Map(projectWorkItems(previous).map((item) => [item.key, item]));
  const label = current.name || 'Dự án';
  for (const item of projectWorkItems(current)) {
    const old = oldItems.get(item.key);
    const oldRuns = new Map((old?.state?.runs || []).map((run) => [run.id, run]));
    for (const run of item.state?.runs || []) {
      const oldRun = oldRuns.get(run.id);
      const oldStatus = oldRun?.status;
      const step = `Bước ${item.stage}${item.scene ? ` · ${item.scene.label}` : ''}`;
      // Chỉ báo "đã tạo xong" KHI tất cả ảnh đã lên 2K (preview2kDoneAt đã set)
      if (run.status === 'done' && run.preview2kDoneAt && !oldRun?.preview2kDoneAt) {
        const count = run.images?.length || S.cfg.imagesPerRun || 4;
        toast(`${label}: đã tạo xong ${count} ảnh 2K ở ${step}.`, 'ok');
      } else if (run.status === 'error' && oldStatus !== 'error') {
        toast(`${label}: lượt chạy ${step} bị lỗi. ${run.error || 'Hãy mở dự án để kiểm tra.'}`, 'err');
      }
    }
    if (item.stage < 3 && item.state?.hq?.status === 'done' && old?.state?.hq?.status !== 'done') {
      toast(`${label}: đã hoàn tất Bước ${item.stage}, ảnh 2K đã sẵn sàng.`, 'ok');
    }
    if (item.stage === 3 && item.state?.chosen?.status === 'saved' && old?.state?.chosen?.status !== 'saved') {
      toast(`${label}: đã lưu xong ảnh 2K cho ${item.scene.label}.`, 'ok');
    }
  }
}
async function refreshFlow() {
  const was = !!S.flow.paused;
  const wasAuto = S.flow.auto;
  try { S.flow = await api('GET', '/api/flow/status'); } catch (_) { S.flow = {}; }
  if (was !== !!S.flow.paused && S.p) refresh();
  { const ba = $('#btnAuto'); if (ba) { const on = S.flow.auto !== false; ba.textContent = on ? 'Tự động: Bật' : 'Tự động: Tắt (làm tay)'; ba.setAttribute('aria-pressed', String(on)); ba.classList.toggle('primary', on); } }
  if (wasAuto !== undefined && wasAuto !== S.flow.auto && S.p) refresh();
  const bn = $('#pauseBanner');
  if (S.flow.paused && S.hidePause !== S.flow.paused.at) { bn.classList.remove('hidden'); bn.innerHTML = `<button class="tclose" data-act="dismisspause" aria-label="Tắt thông báo" title="Tắt">×</button><b>Đã tạm dừng.</b><span>${esc(S.flow.paused.message)} Hãy mở Flow bằng tay xem tài khoản có ổn không, nghỉ một lúc (vài giờ nếu có thể), rồi mới tiếp tục. “Tiếp tục chạy” chỉ gỡ tạm dừng; với lượt đã lỗi, bấm “Thử lại lượt” ngay trong thông báo lỗi.</span><span class="grow"></span><button class="btn sm" data-act="revealflow" data-tip="Mở Flow để xem tài khoản trực tiếp">Mở Flow</button><button class="btn sm" data-act="clearqueue">Hủy các lượt đang chờ</button><button class="btn sm primary" data-act="resume">Tiếp tục chạy</button>`; } else bn.classList.add('hidden');
  const el = $('#flowStatus');
  if (!S.flow.browser) { el.className = 'chip warn'; el.textContent = 'Flow: hãy kết nối với Flow'; }
  else if (S.flow.loggedIn) { el.className = 'chip ok'; el.textContent = 'Flow: đã kết nối · chạy nền'; }
  else { el.className = 'chip warn'; el.textContent = 'Flow: chưa đăng nhập'; }
  const ob = $('#btnOpenFlow');
  if (ob) {
    const logged = !!S.flow.loggedIn;
    ob.textContent = logged ? 'Xem cửa sổ Flow' : 'Đăng nhập Flow';
    ob.dataset.tip = logged ? 'Tool đang chạy ngầm. Bấm để hiện cửa sổ Flow khi cần kiểm tra (tự ẩn lại ở lượt chạy sau)' : 'Mở cửa sổ Chrome để đăng nhập Google / Flow lần đầu. Sau đó tool tự chạy ngầm, không cần mở lại';
  }
  const db = $('#btnDisconnectFlow');
  if (db) db.disabled = !S.flow.browser;
}
$('#btnAuto').onclick = async () => { try { const on = S.flow.auto === false; await api('POST', '/api/auto', { on }); toast(on ? 'Đã bật tự động. Tool kiểm tra các ảnh đã chọn và làm tiếp phần còn dở.' : 'Đã tắt tự động. Bạn thao tác bằng tay; bật lại thì tool tự làm tiếp.', 'ok'); refreshFlow(); } catch (e) { fail(e); } };
$('#btnOpenFlow').onclick = () => api('POST', '/api/flow/open').then(() => { toast(S.flow.loggedIn ? 'Đã hiện cửa sổ Flow. Lượt chạy sau tool tự ẩn lại.' : 'Đã mở cửa sổ Chrome. Đăng nhập Google rồi tool tự ẩn đi và chạy ngầm.', 'ok'); refreshFlow(); }).catch(fail);
$('#btnDisconnectFlow').onclick = async () => {
  try {
    await api('POST', '/api/flow/close');
    toast('Đã đóng toàn bộ cửa sổ Chrome của tool và xóa hàng đợi. Không tạo ảnh nữa.', 'ok');
    refreshFlow();
  } catch (e) { fail(e); }
};
$('#newProjectForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#newProjectName').value.trim(); if (!name) return;
  if (duplicateName(name)) { toast(`Tên sản phẩm "${name}" đã tồn tại. Vui lòng đặt tên khác.`, 'err'); return; }
  try { const p = await api('POST', '/api/projects', { name }); $('#newProjectName').value = ''; S.projects.unshift(p); selectProject(p.id); } catch (er) { fail(er); }
};

// ---------- cột trái: danh sách sản phẩm ----------
function projectSummary(p) {
  const saved = p.s3.scenes.filter((s) => s.chosen?.status === 'saved').length;
  const busy = projectHasActiveWork(p);
  return `${busy ? '⏳ đang xử lý · ' : ''}Bước ${p.stage} · ${saved}/${p.s3.scenes.length} cảnh đã lưu`;
}
function projectHasActiveWork(p) {
  // Khớp với server: chỉ tính là đang bận khi thực sự có tác vụ chạy/đang chờ tự thử lại.
  // Ảnh 2K lỗi (còn trong danh sách chờ nhưng không còn tác vụ) không được khoá xóa/dọn.
  return [p.s1, p.s2, ...p.s3.scenes].some((state) =>
    state.hq?.status === 'loading' ||
    state.chosen?.status === 'saving' ||
    state.runs?.some((r) => r.status === 'running' || r.status === 'queued' || r.upgrading === true)
  );
}
function renderProjectActions() {
  const selected = [...S.selectedProjectIds].filter((id) => S.projects.some((p) => p.id === id));
  const selectedBusy = S.projects.some((p) => S.selectedProjectIds.has(p.id) && projectHasActiveWork(p));
  const anyBusy = S.projects.some(projectHasActiveWork);
  const count = $('#projectSelectionCount');
  const deleteSelected = $('#btnDeleteSelected');
  const deleteAll = $('#btnDeleteAll');
  if (!count || !deleteSelected || !deleteAll) return;
  count.textContent = selected.length ? `Đã chọn ${selected.length} dự án` : 'Chưa chọn dự án';
  deleteSelected.disabled = !selected.length || selected.every((id) => {
    const p = S.projects.find((project) => project.id === id);
    return !p || projectHasActiveWork(p);
  });
  deleteAll.disabled = !S.projects.some((p) => !projectHasActiveWork(p));
  deleteSelected.title = selectedBusy ? 'Các dự án đang chạy sẽ được bỏ qua' : 'Xóa các dự án đã chọn';
  deleteAll.title = anyBusy ? 'Xóa dự án đang rảnh; tự động bỏ qua dự án đang chạy hoặc tải 2K' : 'Xóa tất cả dự án';
}
function renderSidebar() {
  const projectIds = new Set(S.projects.map((p) => p.id));
  for (const id of S.selectedProjectIds) if (!projectIds.has(id)) S.selectedProjectIds.delete(id);
  morph($('#projectList'), sortedProjects().map((p) => {
    const busy = projectHasActiveWork(p);
    const checked = S.selectedProjectIds.has(p.id);
    return `<div class="pitem ${p.id === S.id ? 'active' : ''}" data-pid="${p.id}" role="listitem" tabindex="0" data-tip="${esc(p.name)}">
      <input class="project-select" type="checkbox" data-pid="${p.id}" ${checked ? 'checked' : ''} ${busy ? 'disabled' : ''} aria-label="Chọn dự án ${esc(p.name)} để xóa" title="${busy ? 'Đang xử lý; chưa thể xóa' : 'Chọn để xóa nhiều dự án cùng lúc'}">
      <div class="pav" aria-hidden="true">${esc((p.name.trim()[0] || '?').toUpperCase())}</div>
      <div class="ptxt"><div class="nm">${esc(p.name)}</div><div class="sub">${projectSummary(p)}</div></div>
      <button class="project-delete" type="button" data-pid="${p.id}" aria-label="Xóa dự án ${esc(p.name)}" title="${busy ? 'Đang xử lý; chưa thể xóa' : `Xóa dự án ${esc(p.name)}`}" ${busy ? 'disabled' : ''}>${I.trash}</button>
    </div>`;
  }).join('') || '<div class="hint" style="padding:12px">Chưa có sản phẩm nào.</div>');
  renderProjectActions();
}
async function deleteProjects(ids, all = false) {
  const candidates = all ? S.projects : S.projects.filter((p) => ids.includes(p.id));
  if (!candidates.length) return;
  const busy = candidates.filter(projectHasActiveWork);
  const targets = candidates.filter((p) => !projectHasActiveWork(p));
  if (!targets.length) return toast('Các dự án đang chạy hoặc tải 2K được giữ nguyên; chưa có dự án nào rảnh để xóa.', 'err');

  const names = targets.map((p) => p.name);
  const label = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} và ${names.length - 3} dự án khác`;
  const skipped = busy.length ? `\n\n${busy.length} dự án đang chạy/tải 2K sẽ được giữ nguyên, các dự án còn lại vẫn xóa ngay.` : '';
  const question = all
    ? `Xóa ${targets.length} dự án đang rảnh khỏi tool? Dữ liệu dự án không thể khôi phục; ảnh 2K đã lưu trong thư mục kết quả vẫn được giữ.${skipped}`
    : `Xóa ${targets.length === 1 ? 'dự án' : `${targets.length} dự án`} ${targets.length === 1 ? `"${label}"` : `(${label})`} khỏi tool? Dữ liệu dự án không thể khôi phục; ảnh 2K đã lưu trong thư mục kết quả vẫn được giữ.${skipped}`;
  if (!confirm(question)) return;

  let deletedIds = [];
  if (S.projectDeleteApi) {
    const result = await api('POST', '/api/projects/bulk-delete', { ids: targets.map((p) => p.id) });
    deletedIds = result.deleted || targets.map((p) => p.id);
  } else {
    for (const p of targets) {
      let latest;
      try { latest = await api('GET', `/api/projects/${p.id}`); }
      catch (_) { continue; }
      if (projectHasActiveWork(latest)) { busy.push(latest); continue; }
      await api('DELETE', `/api/projects/${p.id}`);
      deletedIds.push(p.id);
    }
  }
  const removed = new Set(deletedIds);
  const currentDeleted = removed.has(S.id);
  S.projects = S.projects.filter((p) => !removed.has(p.id));
  for (const id of removed) S.selectedProjectIds.delete(id);
  const skippedIds = new Set(busy.map((p) => p.id));
  const skippedText = skippedIds.size ? ` Bỏ qua ${skippedIds.size} dự án đang chạy.` : '';
  if (removed.size) toast(`Đã xóa ${removed.size} dự án khỏi tool. Ảnh trong thư mục kết quả được giữ nguyên.${skippedText}`, 'ok');
  else if (skippedIds.size) toast(`Không xóa dự án đang chạy.${skippedText}`, 'err');
  if (currentDeleted) {
    if (S.projects.length) await selectProject(sortedProjects()[0].id);
    else showWelcome();
  } else renderSidebar();
}
// Thu gọn / mở rộng thanh bên trái (nút ở dưới cùng). Thu gọn: chỉ còn cột chữ cái đầu của từng sản phẩm.
function applyRail(on) {
  $('#layout').classList.toggle('rail', on);
  const b = $('#btnCollapse'); if (!b) return;
  b.innerHTML = (on ? I.chevR : I.chevL) + '<span>Thu gọn</span>';
  b.dataset.tip = on ? 'Mở rộng danh sách sản phẩm' : 'Thu gọn danh sách sản phẩm cho rộng chỗ làm việc';
  b.setAttribute('aria-label', on ? 'Mở rộng danh sách sản phẩm' : 'Thu gọn danh sách sản phẩm');
  try { localStorage.setItem('rail', on ? '1' : '0'); } catch (_) {}
}
$('#btnCollapse').onclick = () => applyRail(!$('#layout').classList.contains('rail'));
try { applyRail(localStorage.getItem('rail') === '1'); } catch (_) { applyRail(false); }
$('#projectList').onclick = (e) => {
  if (e.target.closest('.project-select')) return;
  const del = e.target.closest('.project-delete');
  if (del) { e.preventDefault(); e.stopPropagation(); deleteProjects([del.dataset.pid]).catch(fail); return; }
  const el = e.target.closest('.pitem'); if (el) selectProject(el.dataset.pid);
};
$('#projectList').onchange = (e) => {
  const checkbox = e.target.closest('.project-select');
  if (!checkbox) return;
  checkbox.checked ? S.selectedProjectIds.add(checkbox.dataset.pid) : S.selectedProjectIds.delete(checkbox.dataset.pid);
  renderProjectActions();
};
$('#btnDeleteSelected').onclick = () => deleteProjects([...S.selectedProjectIds]).catch(fail);
$('#btnDeleteAll').onclick = () => deleteProjects([], true).catch(fail);
// bàn phím: Enter / Space kích hoạt mục sản phẩm, bước, hoặc ô có role=button
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
  const el = e.target.closest?.('.pitem, .step, [role=button]'); if (!el) return;
  e.preventDefault(); el.click();
});
async function selectProject(id) {
  S.id = id; S.p = await api('GET', `/api/projects/${id}`); S.stage = S.p.stage || 1; S.lastGo = S.p.autoGo?.at;
  localStorage.setItem('lastProject', id); renderSidebar(); renderMain();
}

// ---------- khung chính ----------
const STEPS = [
  { n: 1, t: 'Tách trang phục', tip: 'Bước 1: tách trang phục khỏi người, đặt trên nền trắng' },
  { n: 2, t: 'Ghép KOC', tip: 'Bước 2: cho KOC mặc trang phục đã tách' },
  { n: 3, t: 'Ghép cảnh thật', tip: 'Bước 3: ghép KOC vào nhiều cảnh người thật cùng lúc' },
];
function stageDone(n) { const p = S.p; return n === 1 ? !!p.s1.approved : n === 2 ? !!p.s2.approved : p.s3.scenes.length > 0 && p.s3.scenes.every((s) => s.chosen); }

function renderMain() {
  const p = S.p;
  document.title = `${p.name} — Flow Lookbook`;
  $('#main').innerHTML = `
    <div class="phead">
      <input class="pname" id="pname" value="${esc(p.name)}" aria-label="Tên sản phẩm" data-tip="Tên hiển thị của sản phẩm. Thư mục lưu ảnh 2K: ${esc(p.outputFolder || p.name)} (giữ nguyên khi đổi tên để không mất liên kết ảnh).">
      <div class="steps" id="steps" role="tablist" aria-label="Các bước"></div>
      <div class="grow"></div>
      <button class="btn sm" data-act="openout" data-tip="Mở thư mục chứa ảnh 2K của sản phẩm này">${I.folder} Mở thư mục kết quả</button>
    </div>
    <div class="ws"><section class="pane" id="ctl"></section><section class="pane" id="resPane"></section></div>`;
  $('#pname').onchange = async (e) => {
    const name = e.target.value.trim();
    if (!name || name === p.name) return;
    if (duplicateName(name, p.id)) { toast(`Tên sản phẩm "${name}" đã tồn tại. Vui lòng đặt tên khác.`, 'err'); e.target.value = p.name; return; }
    try { await api('PATCH', `/api/projects/${p.id}`, { name }); }
    catch (er) { e.target.value = p.name; fail(er); }
  };
  buildCtl(); refresh();
}

function refresh() {
  if (!S.p) return;
  hideTip();
  const maxStage = S.p.maxStage || S.p.stage || 1;
  morph($('#steps'), STEPS.map((s) => {
    const locked = s.n > maxStage, done = stageDone(s.n);
    const tip = locked ? `Chưa mở: hoàn tất bước ${s.n - 1} rồi bấm “Sang bước ${s.n}” để mở bước này` : s.tip;
    const cls = ['step', S.stage === s.n ? 'active' : '', done ? 'done' : '', locked ? 'locked' : ''].join(' ');
    const go = locked ? 'aria-disabled="true"' : `data-act="goto" data-stage="${s.n}"`;
    return `<div class="${cls}" ${go} data-tip="${esc(tip)}" role="tab" tabindex="${locked ? -1 : 0}" aria-selected="${S.stage === s.n}"><span class="n">${locked ? I.lock : done ? '✓' : s.n}</span><span class="t">${s.t}</span></div>`;
  }).join(''));
  renderSlots(); renderResults();
}

// ---------- khung ảnh tham chiếu ----------
// badge: ['2K','ok'] — nhãn chất lượng nhỏ ở góc ảnh (ảnh lấy từ bước trước: 2K hay 1K)
function slot({ label, sub, src, acts = '', cls = '', badge = null }) {
  const qb = badge ? `<span class="qbadge ${badge[1]}" data-tip="${badge[1] === 'ok' ? 'Ảnh đầu vào là bản 2K nét' : badge[1] === 'warn' ? 'Đang lấy bản 2K…' : 'Chưa có bản 2K: bước này dùng ảnh 1K'}">${badge[0]}</span>` : '';
  return `<div class="slot ${cls}"><div class="lab">${label}<small>${esc(sub || '')}</small></div>${qb}<img src="${src}" data-zoom="${src}" alt="${esc(label)} — ${esc(sub || 'ảnh tham chiếu')} (bấm để phóng to)"><div class="acts">${acts}</div></div>`;
}
const hqBadgeOf = (st) => (st?.hq?.status === 'done' ? ['2K', 'ok'] : st?.hq?.status === 'loading' ? ['2K…', 'warn'] : st?.hq?.status === 'error' ? ['1K', 'err'] : null);
// off = true: tạm khóa (đang lấy bản 2K nét, đợi xong rồi cắt để cắt trên ảnh nét)
const btnCrop = (group, file, sid, off) => `<button class="btn sm xs" ${off ? 'disabled' : ''} data-tip="${off ? 'Đợi lấy xong bản 2K rồi hãy cắt, để cắt trên ảnh nét' : 'Cắt sát'}" aria-label="Cắt sát" data-act="recrop" data-group="${group}" data-file="${esc(file)}" ${sid ? `data-sid="${sid}"` : ''}>${I.crop}<span>Cắt</span></button>`;
const btnRm = (group, file) => `<button class="btn sm xs danger" data-tip="Bỏ ảnh này khỏi danh sách" aria-label="Bỏ ảnh này" data-act="rm" data-group="${group}" data-file="${esc(file)}">${I.trash}<span>Xóa</span></button>`;
const addSlot = (group, text) => `<div class="slot add" data-act="addimg" data-group="${group}" data-tip="Bấm để chọn ảnh, hoặc kéo thả / dán Ctrl+V" role="button" tabindex="0">${I.plus}<span>${text}</span></div>`;

function renderSlots() {
  const p = S.p; const el = $('#slots'); if (!el) return;
  let h = '';
  if (S.stage === 1) {
    p.s1.inputs.forEach((f, i) => (h += slot({ label: `Ảnh ${i + 1}`, sub: 'sản phẩm', src: imgUrl(f), acts: btnCrop('s1in', f) + btnRm('s1in', f) })));
    h += addSlot('s1in', 'Thêm ảnh sản phẩm<br>(hoặc dán Ctrl+V)');
  } else if (S.stage === 2) {
    h += p.s2.kocId ? slot({ label: 'Ảnh 1', sub: 'KOC', src: kocUrl(p.s2.kocId), cls: 'kocslot', acts: `<button class="btn sm" data-act="changekoc" data-tip="Chọn KOC khác cho ảnh 1">${I.swap} Đổi</button>` }) : `<div class="slot add" data-act="changekoc" data-tip="Chọn KOC từ thư viện làm ảnh 1" role="button" tabindex="0">${I.plus}<span>Chọn KOC<br>(Ảnh 1)</span></div>`;
    h += p.s1.approved ? slot({ label: 'Ảnh 2', sub: 'trang phục', src: imgUrl(p.s1.approved), cls: 'natural', badge: hqBadgeOf(p.s1), acts: btnCrop('s1ap', p.s1.approved, undefined, p.s1.hq?.status === 'loading') }) : `<div class="slot ph">Ảnh 2: chưa duyệt ảnh trang phục ở bước 1</div>`;
    p.s2.extras.forEach((f, i) => (h += slot({ label: `Ảnh ${i + 3}`, sub: 'phụ kiện', src: imgUrl(f), acts: btnCrop('s2ex', f) + btnRm('s2ex', f) })));
    h += addSlot('s2ex', `Thêm phụ kiện<br>(túi, giày… → Ảnh ${p.s2.extras.length + 3})`);
  } else {
    h += p.s2.approved ? slot({ label: 'Ảnh 1', sub: 'KOC mặc đồ', src: imgUrl(p.s2.approved), cls: 'r916', badge: hqBadgeOf(p.s2), acts: btnCrop('s2ap', p.s2.approved, undefined, p.s2.hq?.status === 'loading') }) : `<div class="slot ph">Ảnh 1: chưa duyệt KOC ở bước 2</div>`;
    h += `<div class="slot ph">Ảnh 2<br>= ảnh cảnh<br>(mỗi cảnh một ảnh)</div>`;
    (p.s3.extras || []).forEach((f, i) => (h += slot({ label: `Ảnh ${i + 3}`, sub: 'phụ kiện', src: imgUrl(f), acts: btnCrop('s3ex', f) + btnRm('s3ex', f) })));
    h += addSlot('s3ex', `Thêm phụ kiện<br>(→ Ảnh ${(p.s3.extras || []).length + 3})`);
  }
  morph(el, h);
}

// ---------- ô điều khiển bên trái ----------
const STAGE_TEXT = {
  1: { title: 'Ảnh sản phẩm cần tách', hint: 'Cắt sát đúng phần cần lấy (cả bộ, hoặc chỉ áo / quần). Dán ảnh bằng Ctrl+V ở bất cứ đâu, kể cả khi đang ở ô chữ.', prompt: 'Prompt tách trang phục', run: 'Chạy bước 1', tip: 'Gửi ảnh sản phẩm lên Flow, tạo 4 ảnh trang phục tách nền để bạn chọn' },
  2: { title: 'Ảnh đầu vào (số thứ tự = “ảnh 1, ảnh 2…” trong prompt)', hint: 'Muốn nhân vật đi giày / mang túi: thêm ảnh rồi sửa prompt, ví dụ “nhân vật ảnh 1 đi giày ảnh 4”.', prompt: 'Prompt ghép KOC mặc trang phục', run: 'Chạy bước 2', tip: 'Gửi KOC + trang phục lên Flow, tạo 4 ảnh KOC mặc trang phục để bạn chọn' },
  3: { title: 'Ảnh đầu vào dùng chung cho mọi cảnh', hint: 'Mỗi cảnh = 1 dự án Flow mới riêng, cùng một prompt. Có thể thêm phụ kiện (ảnh 3, 4…).', prompt: 'Prompt ghép vào cảnh thật (dùng chung)', run: 'Chạy tất cả cảnh', tip: 'Chạy mọi cảnh: mỗi cảnh một dự án Flow mới, dùng chung một prompt, mỗi cảnh ra 4 ảnh' },
};
const tr = { s1: {}, s2: {}, s3: {} }; // trạng thái tự dịch từng ô

function buildCtl() {
  const p = S.p; const k = PK[S.stage]; const T = STAGE_TEXT[S.stage]; const st = p[k];
  $('#ctl').innerHTML = `
    <div class="sec"><h3>${T.title}</h3><div class="slots" id="slots"></div><div class="hint" style="margin-top:8px">${T.hint}</div></div>
    <div class="sec pbox">
      <h3>${T.prompt}</h3>
      <label for="vi">Tiếng Việt — bạn chỉnh ở đây</label>
      <textarea id="vi" spellcheck="false">${esc(st.promptVi)}</textarea>
      <label for="en">Tiếng Anh — gửi cho Flow<span class="grow"></span><span class="stat" id="stat"></span><button class="btn sm" data-act="retranslate" data-tip="Dịch lại ngay prompt tiếng Việt sang tiếng Anh (bỏ bản sửa tay)">Dịch lại</button></label>
      <textarea id="en" class="en" spellcheck="false">${esc(st.promptEn)}</textarea>
      <div class="hint" style="margin-top:5px">Tự cập nhật mỗi khi bạn sửa tiếng Việt. Bạn sửa tay ô tiếng Anh thì tool giữ nguyên bản sửa của bạn.</div>
    </div>
    <div class="runbar"><span class="mchip" data-tip="Cố định: mỗi lượt luôn tạo ${S.cfg.imagesPerRun || 4} ảnh, tỉ lệ ${S.cfg.aspect || '9:16'}, model Nano Banana 2.1">🍌 Nano Banana 2.1<span class="sep"></span><svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2"/></svg>${S.cfg.aspect || '9:16'}<span class="sep"></span>x${S.cfg.imagesPerRun || 4}</span><span class="grow"></span><button class="btn primary big" data-act="run" data-stage="${S.stage}" data-tip="${esc(T.tip)}">${T.run} ${I.right}</button></div>`;
  const vi = $('#vi'), en = $('#en'); const t = (tr[k] = { seq: 0, manual: false, timer: null, pending: null, enFrom: st.enFrom || '' });
  vi.oninput = () => { t.manual = false; setStat('Sẽ tự dịch…'); clearTimeout(t.timer); t.timer = setTimeout(() => doTranslate(k), 1200); saveLater(k); };
  en.oninput = () => { t.manual = true; clearTimeout(t.timer); t.seq++; setStat('Đã sửa tay', 'acc'); saveLater(k, true); };
  if (vi.value.trim() && (!en.value.trim())) doTranslate(k);
  else setStat(en.value.trim() ? 'Đã có bản dịch' : '');
}
function setStat(text, kind = '') { const el = $('#stat'); if (el) el.innerHTML = text ? `<span class="badge ${kind}">${text}</span>` : ''; }

let saveTimer;
function saveLater(k, enEdited) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const vi = $('#vi'), en = $('#en'); if (!vi || !S.p) return;
    api('PATCH', `/api/projects/${S.p.id}`, { [k]: { promptVi: vi.value, promptEn: en.value, enFrom: vi.value } }).catch(() => {});
  }, 600);
}
async function doTranslate(k) {
  const vi = $('#vi'), en = $('#en'); if (!vi || !vi.value.trim()) return;
  const t = tr[k]; const my = ++t.seq; const text = vi.value;
  setStat('Đang dịch…', 'warn');
  t.pending = (async () => {
    try {
      const r = await api('POST', '/api/translate', { text });
      if (my !== t.seq || t.manual || !$('#en')) return;
      en.value = r.en;
      t.enFrom = text; // bản tiếng Anh này đúng là bản dịch của ô tiếng Việt hiện tại
      setStat('Đã dịch · Google Dịch', 'ok');
      await api('PATCH', `/api/projects/${S.p.id}`, { [k]: { promptVi: text, promptEn: r.en, enFrom: text } });
    } catch (e) { if (my === t.seq) setStat('Lỗi dịch', 'err'); fail(e); }
  })();
  return t.pending;
}
async function ensureTranslated(k) {
  const vi = $('#vi'), en = $('#en'), t = tr[k];
  if (t.timer) { clearTimeout(t.timer); t.timer = null; if (!t.manual) await doTranslate(k); }
  else if (t.pending) await t.pending.catch(() => {});
  // Ô tiếng Anh (bản gửi Flow) PHẢI khớp bản dịch của ô tiếng Việt hiện tại — trừ khi bạn sửa tay ô tiếng Anh.
  // Bản dịch thiếu/cũ (ví dụ vừa sửa tiếng Việt mà dịch lỗi) thì dịch lại; vẫn không được thì DỪNG, không gửi prompt cũ.
  if (!t.manual && t.enFrom !== vi.value) {
    await doTranslate(k);
    if (t.enFrom !== vi.value) throw new Error('Chưa có bản dịch tiếng Anh khớp với prompt tiếng Việt hiện tại nên tool dừng để không gửi sai prompt. Kiểm tra mạng rồi thử lại, hoặc gõ trực tiếp vào ô Tiếng Anh.');
  }
  if (!en.value.trim()) throw new Error('Prompt tiếng Anh đang trống. Hãy nhập prompt (tool tự dịch) hoặc bấm “Dịch lại”.');
  clearTimeout(saveTimer);
  await api('PATCH', `/api/projects/${S.p.id}`, { [k]: { promptVi: vi.value, promptEn: en.value, enFrom: vi.value } });
}

// ---------- kết quả bên phải ----------
function runsHtml(runs, ctx) {
  if (!runs?.length) return '<div class="hint">Chưa chạy lượt nào.</div>';
  const N = S.cfg.imagesPerRun || 4;
  const tile = (r, im, ix) => `
        <div class="rc ${r.chosen === im.id ? 'chosen' : ''}" data-stage="${ctx.stage}" ${ctx.sceneId ? `data-sid="${ctx.sceneId}"` : ''} data-run="${r.id}" data-img="${im.id}">
          <img src="${imgUrl(im.file)}" data-zoom="${imgUrl(im.file)}" loading="lazy" decoding="async" alt="Kết quả ${ix + 1} trong ${N} ảnh (bấm để phóng to)">
          ${r.chosen === im.id ? `<span class="tag">${I.check}Đã chọn</span>` : ''}
          <div class="rc-act">
            <button class="tb" data-tip="Làm lại: tạo thêm ảnh giống ảnh này (Flow lấy mẫu tương tự)" aria-label="Làm lại từ ảnh này" data-act="rerun">${I.redo}<span>Làm lại</span></button>
            ${r.chosen === im.id
    ? `<button class="tb ok on" aria-pressed="true" data-act="unapprove" data-tip="Đang chọn ảnh này. Bấm lần nữa để bỏ chọn" aria-label="Bỏ chọn ảnh này">${I.checkFill}<span>Đã chọn</span></button>`
    : `<button class="tb ok" aria-pressed="false" data-tip="Chọn ảnh này để dùng cho bước tiếp theo" aria-label="Chọn ảnh này" data-act="approve">${I.circle}<span>Chọn</span></button>`}
          </div>
        </div>`;
  // ô đang tạo: nền mờ chuyển động + phần trăm, giống Flow
  const ph = (r, i) => {
    const queued = r.status === 'queued'; const snip = (r.promptEn || '').trim().slice(0, 18);
    return `<div class="rc ph" data-run="${r.id}" data-i="${i}" aria-label="Đang tạo ảnh ${i + 1}">
        <div class="phimg">
          <div class="phbg"></div>
          <div class="phtop">${I.image}<span class="phpct">${queued ? '' : (r.tiles?.[i] ?? 0) + '%'}</span></div>
          ${queued ? `<div class="phq">${esc(S.flow.paused ? 'Tool đang TẠM DỪNG vì Flow cảnh báo. Lượt này chưa chạy. Bấm “Tiếp tục chạy” ở thanh phía trên khi bạn thấy tài khoản ổn.' : (r.note || 'Đang xếp hàng…'))}</div>` : ''}
          <div class="phbot"><span class="phtxt">${esc(snip)}${snip ? '…' : ''}</span>${I.redo}</div>
        </div>
        <div class="rc-act"></div>
      </div>`;
  };
  const one = (r, i) => {
    const active = r.status === 'running' || r.status === 'queued';
    let cells = '';
    if (active) for (let k = 0; k < N; k++) { const im = r.images.find((x) => x.slot === k); cells += im ? tile(r, im, k) : ph(r, k); }
    else cells = r.images.map((im, ix) => tile(r, im, ix)).join('');
    const sharpStatus = !active && r.images.length
      ? (r.upgrading ? `<span class="badge warn">đang lấy bản 2K${r.upgradeProgress ? ` · ${r.upgradeProgress.done}/${r.upgradeProgress.total}` : '…'}</span>`
        : r.upgradeError ? `<span class="badge err" data-tip="${esc(r.upgradeError)}">chưa lấy đủ bản 2K</span>` : '')
      : '';
    return `
    <div class="run" data-run="${r.id}">
      <div class="head"><b>${i === 0 ? 'Mới nhất' : 'Trước đó'}</b>${r.rerunOf ? '<span class="badge acc">chạy lại từ 1 ảnh</span>' : ''}${r.retryOf ? '<span class="badge acc">thử lại lượt lỗi</span>' : ''}${r.inputNote ? '<span class="badge warn" data-tip="Chưa lấy được bản 2K của ảnh đã chọn nên lượt này dùng bản 1K (kém nét hơn)">ảnh vào: 1K</span>' : ''}
        ${active ? `<span class="badge acc" data-prog>${esc(r.note || (r.status === 'queued' ? 'đang xếp hàng…' : 'đang tạo · ' + (r.progress || 0) + '%'))}</span>` : ''}
        ${r.status === 'done' ? `<span class="badge ok">xong · ${Math.round(((r.finishedAt || 0) - (r.startedAt || 0)) / 1000)} giây</span>` : ''}
        ${r.status === 'error' ? '<span class="badge err">lỗi</span>' : ''}${sharpStatus}</div>
      ${r.status === 'error' && !S.dismissed.has(r.id) ? `<div class="err-text"><span>${esc(r.error)}</span><span class="errbtns"><button class="btn sm primary" data-act="retryrun" data-stage="${ctx.stage}" ${ctx.sceneId ? `data-sid="${ctx.sceneId}"` : ''} data-run="${r.id}" ${S.flow.paused ? 'disabled title="Hãy kiểm tra Flow và bấm Tiếp tục chạy trước"' : 'data-tip="Tạo lượt mới cho bước/cảnh này; lượt lỗi cũ vẫn được giữ lại"'}>Thử lại lượt</button><button class="btn sm" data-act="revealflow" data-stage="${ctx.stage}" ${ctx.sceneId ? `data-sid="${ctx.sceneId}"` : ''} data-tip="Mở Flow ở đúng dự án này để xem lỗi">Mở Flow</button><button class="tclose" data-act="dismisserr" data-run="${r.id}" aria-label="Tắt thông báo lỗi" data-tip="Tắt">×</button></span></div>` : ''}
      ${cells ? `<div class="grid4">${cells}</div>` : ''}
    </div>`;
  };
  const first = one(runs[0], 0);
  const rest = runs.slice(1, 6);
  const key = 'old:' + runs[0].id.slice(0, 2) + (ctx.sceneId || ctx.stage);
  return first + (rest.length ? `<details class="old" data-key="${key}" ${S.open.has(key) ? 'open' : ''}><summary>Lượt trước đó (${rest.length})</summary>${rest.map((r, i) => one(r, i + 1)).join('')}</details>` : '');
}

function sceneHtml(s, i) {
  const c = s.chosen;
  const badge = c ? (c.status === 'saved' ? `<span class="badge ok">đã lưu ảnh 2K</span> <button class="btn sm" data-act="opensaved" data-sid="${s.id}" data-tip="Xem ảnh 2K đã lưu trong thư mục kết quả">Xem ảnh 2K</button>` : c.status === 'error' ? `<span class="badge err" data-tip="${esc(c.error)}">lưu 2K lỗi</span> <button class="btn sm" data-act="retrysave" data-sid="${s.id}" data-tip="Thử lưu lại ảnh 2K của cảnh này">Lưu lại</button>` : c.status === 'manual' ? `<span class="badge warn" data-tip="Tự động đang tắt: bạn tự tải 2K, hoặc bật lại Tự động để tool tải">chờ tự động (đang tắt)</span> <button class="btn sm" data-act="retrysave" data-sid="${s.id}" data-tip="Tải và lưu bản 2K của cảnh này ngay">Lưu 2K ngay</button>` : '<span class="badge warn">đang lưu 2K…</span>') : '';
  const busy = s.runs[0] && (s.runs[0].status === 'running' || s.runs[0].status === 'queued');
  return `
    <div class="scene" data-sid="${s.id}">
      <div class="src"><img src="${imgUrl(s.file)}" data-zoom="${imgUrl(s.file)}" alt="Ảnh gốc của ${esc(s.label)}"><div class="acts">${btnCrop('scene', s.file, s.id)}<button class="btn sm xs danger" data-tip="Bỏ cảnh này" aria-label="Bỏ cảnh này" data-act="rmscene" data-sid="${s.id}">${I.trash}<span>Xóa</span></button></div></div>
      <div style="min-width:0">
        <div class="meta"><b>${esc(s.label)}</b>${badge}<span class="grow"></span>
          <button class="btn sm" data-act="runscene" data-sid="${s.id}" data-tip="${s.runs.length ? 'Tạo lại 4 ảnh mới cho riêng cảnh này' : 'Tạo 4 ảnh cho riêng cảnh này'}" ${busy ? 'disabled' : ''}>${I.play} ${s.runs.length ? 'Làm lại cả cảnh' : 'Chạy cảnh này'}</button></div>
        ${runsHtml(s.runs, { stage: 3, sceneId: s.id })}
      </div>
    </div>`;
}

const runSig = (r) => [r.note, r.inputNote, r.id, r.status, r.images.map((i) => i.file).join(), r.chosen, r.error, !!S.flow.paused, S.dismissed.has(r.id), r.rerunOf, r.upgrading, JSON.stringify(r.upgradeProgress || null), r.upgradeError];
function resultsSig(p) {
  if (S.stage === 3) return JSON.stringify(p.s3.scenes.map((s) => [s.id, s.file, s.label, s.chosen, s.runs.slice(0, 6).map(runSig)]));
  const st = p[PK[S.stage]];
  return JSON.stringify([st.approved, st.hq, p.s1.approved, st.runs.slice(0, 6).map(runSig)]);
}
function patchProgress() {
  const p = S.p; const runs = S.stage === 3 ? p.s3.scenes.flatMap((s) => s.runs) : p[PK[S.stage]].runs;
  for (const r of runs) {
    if (r.status !== 'running') continue;
    const root = document.querySelector('.run[data-run="' + r.id + '"]'); if (!root) continue;
    root.querySelectorAll('.rc.ph').forEach((el) => { const v = r.tiles?.[+el.dataset.i]; const t = el.querySelector('.phpct'); if (t) t.textContent = (v ?? 0) + '%'; });
    const b = root.querySelector('[data-prog]'); if (b) b.textContent = r.note || ('đang tạo · ' + (r.progress || 0) + '%');
  }
}
function renderResults() {
  const p = S.p; const pane = $('#resPane'); if (!pane) return;
  const key = p.id + ':' + S.stage + ':' + resultsSig(p);
  if (pane.dataset.key === key) { patchProgress(); return; }
  pane.dataset.key = key;
  const top = pane.scrollTop; let h = '';
  if (S.stage === 1 || S.stage === 2) {
    const k = PK[S.stage]; const st = p[k]; const ap = st.approved;
    h += `<div class="rhead"><h3>Kết quả bước ${S.stage}</h3><span class="hint">Mỗi ảnh có nút <b>Xem</b> (phóng to) · <b>Làm lại</b> (tạo thêm ảnh giống ảnh đó) · <b>Chọn</b></span></div>`;
    // Khung "Ảnh đang dùng" LUÔN có mặt và cao cố định (chưa chọn thì là khung trống cùng cỡ): chọn / bỏ chọn
    // không làm các ảnh bên dưới bị đẩy lên xuống.
    if (!ap) {
      h += `<div class="approved none"><div class="aimg" aria-hidden="true"></div><div class="atxt"><b>Chưa chọn ảnh nào</b><div class="hint">Bấm <b>Chọn</b> dưới ảnh bạn ưng nhất. Ảnh được chọn sẽ dùng cho bước ${S.stage + 1}.</div></div><button class="btn sm" disabled data-tip="Chọn một ảnh trước, rồi mới sang bước tiếp">Sang bước ${S.stage + 1} →</button></div>`;
    } else {
      const hq = st.hq, busy = hq?.status === 'loading', failed = hq?.status === 'error';
      const manual = hq?.status === 'manual';
      const hqBadge = manual ? '<span class="badge warn">Tự động đang tắt</span> <button class="btn sm" data-act="retryhq" data-tip="Tải bản 2K của ảnh đang chọn về thư mục ngay">Tải 2K ngay</button>' : busy ? '<span class="badge warn">Đang tải ảnh 2K về thư mục…</span>' : hq?.status === 'done' ? '<span class="badge ok">Đã có bản 2K nét</span>' : failed ? '<span class="badge err">Chưa có bản 2K</span>' + (hq.code === 'cropped' ? '' : ' <button class="btn sm" data-act="retryhq" data-tip="Thử lấy lại bản 2K nét">Thử lại</button>') : '';
      const note = manual ? 'Tự động đang tắt: bạn tự tải ảnh 2K bằng tay. Bật lại “Tự động” ở góc trên thì tool sẽ tải ảnh này về thư mục và làm tiếp.'
        : busy ? 'Đang vào Flow tải ảnh 2K về thư mục dự án (khoảng 15–20 giây). Xong sẽ tự chuyển sang bước ' + (S.stage + 1) + '.'
        : failed ? `<span style="color:var(--err)">${esc(hq.error)}</span>`
        : hq?.status === 'done' ? 'Ảnh 2K đã nằm trong thư mục dự án. Cắt sát lại nếu cần rồi sang bước ' + (S.stage + 1) + '.' : `Cắt sát lại nếu cần rồi sang bước ${S.stage + 1}.`;
      // chưa có 2K thì nút sang bước nói rõ "ảnh 1K", không để người dùng đi tiếp mà không biết
      const useMine = (manual || failed) && hq?.code !== 'cropped' ? `<button class="btn sm" data-act="usemine" data-tip="Chọn file ảnh 2K bạn đã tự tải từ Flow. Tool dùng ảnh đó cho bước sau">Dùng ảnh 2K tôi tải</button>` : '';
      const nextBtn = useMine + ((busy || failed)
        ? `<button class="btn sm" disabled data-tip="${busy ? 'Đang tải ảnh 2K, xong nút này mới sáng lên' : 'Chưa tải được ảnh 2K. Bấm “Thử lại” ở bên cạnh.'}">Sang bước ${S.stage + 1} →</button>`
        : `<button class="btn primary sm" data-act="goto" data-stage="${S.stage + 1}" data-tip="Chuyển sang bước kế tiếp với ảnh đã chọn">Sang bước ${S.stage + 1} →</button>`);
      h += `<div class="approved"><img src="${imgUrl(ap)}" data-zoom="${imgUrl(ap)}" alt="Ảnh đã chọn"><div class="atxt"><b>Ảnh đang dùng cho bước sau</b> ${hqBadge}<div class="hint" ${failed ? `data-tip="${esc(hq.error)}"` : ''}>${note}</div></div>${btnCrop(S.stage === 1 ? 's1ap' : 's2ap', ap, undefined, busy)}${nextBtn}</div>`;
    }
    h += runsHtml(st.runs, { stage: S.stage });
  } else {
    // Tính trạng thái các cảnh đã chọn
    const allSaved = p.s3.scenes.length > 0 && p.s3.scenes.every((s) => s.chosen?.status === 'saved');
    const finishArea = allSaved ? (p.cleaned
      ? '<span class="badge ok">Đã dọn dẹp, chỉ còn ảnh cuối</span>'
      : '<button class="btn sm primary" data-act="cleanall" data-tip="Xóa thư mục _tam trong TẤT CẢ dự án, dọn sạch ảnh trung gian bước 1 và 2">🧹 Hoàn thành & Dọn dẹp tất cả</button>') : '';
    h += `<div class="rhead"><h3>Các cảnh người thật (${p.s3.scenes.length})</h3><button class="btn sm" data-act="addimg" data-group="scene" data-tip="Thêm ảnh cảnh người thật (chọn được nhiều ảnh một lúc)">${I.plus} Thêm cảnh</button><span class="hint">Kéo thả nhiều ảnh vào đây hoặc dán Ctrl+V</span>${finishArea}</div>`;
    h += p.s3.scenes.map(sceneHtml).join('') || `<div class="drop" data-act="addimg" data-group="scene" data-tip="Bấm để chọn ảnh, hoặc kéo thả / dán Ctrl+V" role="button" tabindex="0">Chưa có cảnh nào. Bấm hoặc kéo ảnh cảnh người thật vào đây (chọn được nhiều ảnh một lúc).</div>`;
  }
  // Cùng sản phẩm + cùng bước: chỉ cập nhật phần thay đổi (ảnh không tải lại, không nhấp nháy, giữ nguyên vị trí cuộn).
  // Đổi sản phẩm / đổi bước: vẽ mới và cuộn lên đầu.
  const ctxKey = p.id + ':' + S.stage;
  if (pane.dataset.ctx !== ctxKey) { pane.innerHTML = h; pane.scrollTop = 0; pane.dataset.ctx = ctxKey; }
  else { morph(pane, h); pane.scrollTop = top; }
}

// Cập nhật DOM theo HTML mới mà KHÔNG tạo lại những phần không đổi: ảnh không tải lại, nút giữ nguyên focus,
// vị trí cuộn không đổi => không bị nhấp nháy hay nhảy khi bấm.
function morph(root, html) {
  const next = document.createElement(root.tagName);
  next.innerHTML = html;
  patchChildren(root, next);
}
function patchChildren(a, b) {
  const aKids = [...a.childNodes], bKids = [...b.childNodes];
  for (let i = 0; i < bKids.length; i++) {
    const x = aKids[i], y = bKids[i];
    if (!x) a.appendChild(y); else patchNode(a, x, y);
  }
  for (let i = aKids.length - 1; i >= bKids.length; i--) a.removeChild(aKids[i]);
}
function patchNode(parent, x, y) {
  if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { parent.replaceChild(y, x); return; }
  if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
  if (x.isEqualNode(y)) return;
  for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
  for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
  patchChildren(x, y);
}
document.addEventListener('toggle', (e) => { const d = e.target; if (d.matches?.('details.old')) { d.open ? S.open.add(d.dataset.key) : S.open.delete(d.dataset.key); } }, true);

// ---------- hành động (ủy quyền sự kiện) ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) { const z = e.target.closest('[data-zoom]'); if (z) openLightbox(z); return; }
  e.stopPropagation();
  try { await act(b); } catch (er) { fail(er); }
});

async function act(b) {
  const p = S.p; const a = b.dataset.act; const g = b.dataset.group; const f = b.dataset.file;
  if (a === 'usemine') return pickFiles(false, async ([f]) => {
    if (!f) return;
    await api('POST', `/api/projects/${p.id}/manual-hq?stage=${S.stage}`, undefined, await normalizedBlob(f));
    toast('Đã nhận ảnh 2K của bạn. Dùng ảnh này cho bước sau.', 'ok');
  });
  if (a === 'finish') { if (!confirm('Xóa VĨNH VIỄN ảnh trung gian của bước 1 và bước 2 trong thư mục dự án (không vào thùng rác)? Các ảnh cuối của bước 3 được giữ lại.')) return; await api('POST', `/api/projects/${p.id}/finish`); return toast('Đã dọn dẹp. Thư mục chỉ còn các ảnh cuối của bước 3.', 'ok'); }
  if (a === 'cleanall') { if (!confirm('Xóa VĨNH VIỄN thư mục _tam trong TẤT CẢ dự án (không vào thùng rác)?')) return; const r = await api('POST', '/api/projects/clean-all'); return toast(`Đã dọn dẹp ${r.cleaned} dự án.${r.skipped?.length ? ` Bỏ qua ${r.skipped.length} dự án đang chạy: ${r.skipped.join(', ')}.` : ''}`, 'ok'); }
  if (a === 'dismisspause') { S.hidePause = S.flow.paused?.at; return refreshFlow(); }
  if (a === 'dismisserr') { S.dismissed.add(b.dataset.run); refresh(); return void api('DELETE', `/api/projects/${p.id}/runs/${b.dataset.run}`).catch(() => {}); }
  if (a === 'revealflow') { const st = +b.dataset.stage || null; return void await api('POST', '/api/flow/reveal', p && st ? { projectId: p.id, stage: st, sceneId: b.dataset.sid } : {}); }
  if (a === 'resume') { await api('POST', '/api/flow/resume'); return refreshFlow(); }
  if (a === 'clearqueue') { const r = await api('POST', '/api/flow/clear-queue'); toast(`Đã hủy ${r.cleared} lượt đang chờ.`, 'ok'); return refreshFlow(); }
  if (a === 'retryrun') {
    const r = await api('POST', `/api/projects/${p.id}/retry-run`, { stage: +b.dataset.stage, runId: b.dataset.run, sceneId: b.dataset.sid });
    $('#resPane')?.scrollTo({ top: 0, behavior: 'smooth' });
    return toast('Đã đưa lượt thử lại vào hàng đợi. Lượt lỗi cũ vẫn được giữ lại.', 'ok');
  }
  const p0 = S.p; if (!p0 && a !== 'goto') return;
  if (a === 'retryhq') return api('POST', `/api/projects/${p.id}/retry-hq`, { stage: S.stage });
  if (a === 'goto') { const to = +b.dataset.stage; S.p = await api('PATCH', `/api/projects/${p.id}`, { stage: to }); S.stage = to; return renderMain(); }
  if (a === 'openout') return api('POST', `/api/projects/${p.id}/open-output`);
  if (a === 'retranslate') { tr[PK[S.stage]].manual = false; return doTranslate(PK[S.stage]); }
  if (a === 'run') { const k = PK[S.stage]; await ensureTranslated(k); const r = await api('POST', `/api/projects/${p.id}/run`, { stage: S.stage }); if (S.stage !== 3) $('#resPane')?.scrollTo({ top: 0, behavior: 'smooth' }); return toast(`Đã đưa ${r.queued} lượt vào hàng đợi.`, 'ok'); }
  if (a === 'runscene') { await ensureTranslated('s3'); await api('POST', `/api/projects/${p.id}/run`, { stage: 3, sceneIds: [b.dataset.sid] }); return toast('Đã đưa cảnh vào hàng đợi.', 'ok'); }
  if (a === 'unapprove') {
    const c = b.closest('.rc');
    const r = await api('POST', `/api/projects/${p.id}/unapprove`, { stage: +c.dataset.stage, sceneId: c.dataset.sid });
    return toast(r.keptFile ? 'Đã bỏ chọn. Ảnh 2K đã lưu trước đó vẫn còn trong thư mục kết quả.' : 'Đã bỏ chọn.', 'ok');
  }
  if (a === 'approve' || a === 'rerun') {
    const c = b.closest('.rc'); const body = { stage: +c.dataset.stage, runId: c.dataset.run, imageId: c.dataset.img, sceneId: c.dataset.sid };
    if (a === 'rerun') { await api('POST', `/api/projects/${p.id}/rerun`, body); $('#resPane')?.scrollTo({ top: 0, behavior: 'smooth' }); return toast('Đang chạy lại từ ảnh này trong Flow…', 'ok'); }
    await api('POST', `/api/projects/${p.id}/approve`, body);
    return toast(body.stage === 3 ? 'Đã chọn — đang lưu ảnh 2K vào thư mục.' : 'Đã chọn ảnh.', 'ok');
  }
  if (a === 'rm') {
    if (g === 's1in') await api('PATCH', `/api/projects/${p.id}`, { s1: { inputs: p.s1.inputs.filter((x) => x !== f) } });
    if (g === 's2ex') await api('PATCH', `/api/projects/${p.id}`, { s2: { extras: p.s2.extras.filter((x) => x !== f) } });
    if (g === 's3ex') await api('PATCH', `/api/projects/${p.id}`, { s3: { extras: (p.s3.extras || []).filter((x) => x !== f) } });
    return;
  }
  if (a === 'rmscene') return api('DELETE', `/api/projects/${p.id}/scenes/${b.dataset.sid}`);
  if (a === 'retrysave') return api('POST', `/api/projects/${p.id}/retry-save`, { sceneId: b.dataset.sid });
  if (a === 'opensaved') { const sid = b.dataset.sid; return openLightboxList([`/files/saved/${p.id}/${sid}?t=${Date.now()}`], 0); }
  if (a === 'recrop') return recrop(g, f, b.dataset.sid);
  if (a === 'addimg') return pickFiles(true, (files) => addImages(files, g));
  if (a === 'changekoc') return kocDialog(true);
}

// ---------- ảnh: chọn / kéo thả / dán ----------
function pickFiles(multiple, cb) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple;
  // Callback chạy sau khi người dùng chọn file (ngoài try/catch của act) → tự báo lỗi để không im lặng.
  i.onchange = () => { Promise.resolve().then(() => cb([...i.files])).catch(fail); };
  i.click();
}
const defaultGroup = () => (S.stage === 1 ? 's1in' : S.stage === 2 ? 's2ex' : 'scene');
const isImg = (f) => f.type && f.type.startsWith('image/');

document.addEventListener('paste', (e) => {
  if (!S.p || !$('#modal').classList.contains('hidden')) return;
  const files = [...(e.clipboardData?.files || [])].filter(isImg);
  if (!files.length) return; // dán chữ bình thường thì để yên
  e.preventDefault(); // có ảnh: nhận luôn, kể cả khi con trỏ đang ở ô chữ
  addImages(files, defaultGroup()).catch(fail);
});
document.addEventListener('dragover', (e) => { if (S.p && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!S.p) return; const files = [...(e.dataTransfer?.files || [])].filter(isImg); if (!files.length) return;
  e.preventDefault(); addImages(files, defaultGroup()).catch(fail);
});

// Ảnh GIF/BMP/AVIF… được chuyển sang PNG ngay trên máy để Flow và bộ đọc kích thước luôn hiểu.
async function normalizedBlob(blob) {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) return blob;
  let bmp;
  try { bmp = await createImageBitmap(blob); }
  catch (_) { throw new Error('Không đọc được ảnh này. Hãy dùng JPG, PNG hoặc WebP.'); }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Không chuyển được ảnh sang PNG.'))), 'image/png'));
}
async function uploadBlob(blob, projectId = S.p.id) {
  const out = await normalizedBlob(blob);
  return (await api('POST', `/api/projects/${projectId}/assets`, undefined, out)).file;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}
async function addImages(files, group) {
  const p = S.p; const added = [];
  added.push(...await mapLimit(files, 3, (f) => uploadBlob(f, p.id)));
  if (group === 's1in') await api('PATCH', `/api/projects/${p.id}`, { s1: { inputs: [...p.s1.inputs, ...added] } });
  else if (group === 's2ex') await api('PATCH', `/api/projects/${p.id}`, { s2: { extras: [...p.s2.extras, ...added] } });
  else if (group === 's3ex') await api('PATCH', `/api/projects/${p.id}`, { s3: { extras: [...(p.s3.extras || []), ...added] } });
  else if (group === 'scene') for (const file of added) await api('POST', `/api/projects/${p.id}/scenes`, { file });
  toast(`Đã thêm ${added.length} ảnh. Bấm nút “Cắt” trên ảnh nếu cần cắt sát.`, 'ok');
}
async function recrop(group, file, sid) {
  const src = await (await fetch(imgUrl(file))).blob();
  const blob = await cropDialog(src, 'Cắt sát ảnh'); if (!blob) return;
  const nf = await uploadBlob(blob); const p = S.p; const rep = (arr) => arr.map((x) => (x === file ? nf : x));
  if (group === 's1in') await api('PATCH', `/api/projects/${p.id}`, { s1: { inputs: rep(p.s1.inputs) } });
  else if (group === 's1ap') await api('PATCH', `/api/projects/${p.id}`, { s1: { approved: nf } });
  else if (group === 's2ap') await api('PATCH', `/api/projects/${p.id}`, { s2: { approved: nf } });
  else if (group === 's2ex') await api('PATCH', `/api/projects/${p.id}`, { s2: { extras: rep(p.s2.extras) } });
  else if (group === 's3ex') await api('PATCH', `/api/projects/${p.id}`, { s3: { extras: rep(p.s3.extras || []) } });
  else if (group === 'scene') await api('PATCH', `/api/projects/${p.id}/scenes/${sid}`, { file: nf });
}

// ---------- hộp thoại ----------
function modal(html, narrow) {
  const m = $('#modal'); m.innerHTML = `<div class="box ${narrow ? 'narrow' : ''}">${html}</div>`; m.classList.remove('hidden');
  const close = () => { m.classList.add('hidden'); m.innerHTML = ''; };
  m.onmousedown = (e) => { if (e.target === m) close(); };
  return { el: m, close };
}
// Công cụ cắt riêng (public/cropper.js): mượt, không mất chuột, có tỉ lệ, lưới, thu phóng
function cropDialog(blob, title) { return window.openCropper(blob, title); }

// ---------- phóng to ảnh ----------
// Hiện ảnh ở kích thước THẬT (vừa khung nhưng không phóng quá bản gốc) để nhìn rõ nét. Lăn chuột / Ctrl+lăn: zoom; kéo: di chuyển;
// "1:1" = từng điểm ảnh thật; nhấp đúp = vừa khung.
const LB = { list: [], i: 0, s: 1, fit: 1, x: 0, y: 0, nw: 0, nh: 0 };
function openLightbox(imgEl) {
  const scope = imgEl.closest('.grid4, .slots, .scene .src, .approved') || imgEl.parentElement;
  const list = [...scope.querySelectorAll('[data-zoom]')].map((e) => e.dataset.zoom);
  openLightboxList(list, Math.max(0, list.indexOf(imgEl.dataset.zoom)));
}
function openLightboxList(list, i) {
  LB.list = list; LB.i = i;
  const el = $('#lightbox'); el.classList.remove('hidden');
  el.innerHTML = `<div class="stage" id="lbStage"><img id="lbImg" draggable="false" alt="Ảnh phóng to"></div>
    <div class="tools"><button class="ib" data-lb="out" data-tip="Thu nhỏ (phím -)" aria-label="Thu nhỏ">${ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>')}</button><span class="zl" id="lbZ">100%</span><button class="ib" data-lb="in" data-tip="Phóng to (phím +)" aria-label="Phóng to">${I.zoom}</button><button class="ib" data-lb="fit" data-tip="Vừa khung (phím 0 hoặc nhấp đúp)" aria-label="Vừa khung">${I.fit}</button><button class="btn sm" data-lb="one" data-tip="Xem đúng từng điểm ảnh thật, 100% (phím 1)">1:1</button><span class="dim" id="lbDim" data-tip="Kích thước thật của ảnh">—</span><button class="ib" data-lb="close" data-tip="Đóng (Esc)" aria-label="Đóng">${I.x}</button></div>
    ${LB.list.length > 1 ? `<div class="nav l"><button class="ib" data-lb="prev" data-tip="Ảnh trước (←)" aria-label="Ảnh trước">${I.left}</button></div><div class="nav r"><button class="ib" data-lb="next" data-tip="Ảnh sau (→)" aria-label="Ảnh sau">${I.right}</button></div>` : ''}
    <div class="help">Lăn chuột hoặc Ctrl + lăn để phóng to / thu nhỏ · kéo để di chuyển · <b>1:1</b> xem điểm ảnh thật · nhấp đúp để vừa khung${LB.list.length > 1 ? ' · ← → đổi ảnh' : ''}</div>`;
  lbShow();
  const stage = $('#lbStage');
  stage.onwheel = (e) => { e.preventDefault(); lbZoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); };
  let drag = null;
  stage.onpointerdown = (e) => { drag = { sx: e.clientX, sy: e.clientY, x: LB.x, y: LB.y, moved: false }; stage.setPointerCapture(e.pointerId); stage.classList.add('drag'); };
  stage.onpointermove = (e) => { if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; LB.x = drag.x + dx; LB.y = drag.y + dy; lbApply(); };
  stage.onpointerup = (e) => { const moved = drag?.moved; drag = null; stage.classList.remove('drag'); if (!moved && e.target === stage && LB.s <= LB.fit + 0.001) lbClose(); };
  stage.ondblclick = lbFit;
}
function lbShow() {
  const im = $('#lbImg'); im.style.visibility = 'hidden';
  im.onload = () => {
    LB.nw = im.naturalWidth; LB.nh = im.naturalHeight;
    const st = $('#lbStage').getBoundingClientRect();
    LB.fit = Math.min(1, (st.width * 0.92) / LB.nw, (st.height - 100) / LB.nh); // không phóng to quá bản gốc
    LB.s = LB.fit; LB.x = 0; LB.y = 0;
    im.style.width = LB.nw + 'px'; im.style.height = LB.nh + 'px'; im.style.visibility = '';
    $('#lbDim').textContent = LB.nw + ' × ' + LB.nh + ' px'; lbApply();
  };
  im.src = LB.list[LB.i];
}
function lbApply() {
  const im = $('#lbImg'); if (!im) return;
  im.style.transform = 'translate(calc(-50% + ' + LB.x + 'px), calc(-50% + ' + LB.y + 'px)) scale(' + LB.s + ')';
  im.style.imageRendering = LB.s >= 2.5 ? 'pixelated' : 'auto'; // zoom sâu thì thấy rõ từng điểm ảnh
  $('#lbZ').textContent = Math.round(LB.s * 100) + '%';
}
function lbZoom(f, cx, cy) {
  const ns = Math.min(16, Math.max(LB.fit * 0.5, LB.s * f)); const r = ns / LB.s;
  const st = $('#lbStage').getBoundingClientRect(); const px = (cx ?? st.left + st.width / 2) - (st.left + st.width / 2); const py = (cy ?? st.top + st.height / 2) - (st.top + st.height / 2);
  LB.x = px - (px - LB.x) * r; LB.y = py - (py - LB.y) * r; LB.s = ns; lbApply();
}
function lbFit() { LB.s = LB.fit; LB.x = 0; LB.y = 0; lbApply(); }
function lbOne() { LB.s = 1; LB.x = 0; LB.y = 0; lbApply(); }
function lbClose() { $('#lightbox').classList.add('hidden'); $('#lightbox').innerHTML = ''; }
function lbStep(d) { LB.i = (LB.i + d + LB.list.length) % LB.list.length; lbShow(); }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lb]'); if (!b) return; const k = b.dataset.lb;
  if (k === 'close') lbClose(); else if (k === 'in') lbZoom(1.3); else if (k === 'out') lbZoom(1 / 1.3); else if (k === 'fit') lbFit(); else if (k === 'one') lbOne(); else if (k === 'prev') lbStep(-1); else if (k === 'next') lbStep(1);
});
document.addEventListener('keydown', (e) => {
  if ($('#lightbox').classList.contains('hidden')) { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) $('#modal').classList.add('hidden'); return; }
  if (e.key === 'Escape') lbClose(); else if (e.key === 'ArrowLeft') lbStep(-1); else if (e.key === 'ArrowRight') lbStep(1);
  else if (e.key === '+' || e.key === '=') lbZoom(1.25); else if (e.key === '-') lbZoom(1 / 1.25); else if (e.key === '0') lbFit(); else if (e.key === '1') lbOne();
});

// ---------- thư viện KOC ----------
$('#btnKoc').onclick = () => kocDialog(false);
async function kocDialog(selectMode) {
  S.koc = await api('GET', '/api/koc');
  const cur = S.p?.s2.kocId;
  const m = modal(`<h3>${selectMode ? 'Chọn KOC cho ảnh 1' : 'Thư viện KOC'}</h3>
    <div class="hint">Ảnh mặt KOC dùng xuyên suốt (rõ mặt, nhìn thẳng, đủ sáng). Lưu trên máy bạn.</div>
    <div class="kocgrid" style="margin:14px 0">${S.koc.map((k) => `<div class="koc ${k.id === cur ? 'sel' : ''}" data-koc="${esc(k.id)}"><img src="${kocUrl(k.id)}" alt="KOC ${esc(k.name)}" data-pick="${selectMode ? 1 : ''}"><span>${esc(k.name)}</span><button class="btn sm danger" data-tip="Xóa KOC này khỏi thư viện" data-kdel="${esc(k.id)}">Xóa</button></div>`).join('') || '<div class="hint">Chưa có KOC nào.</div>'}</div>
    <div class="foot"><button class="btn" id="kAdd">${I.plus} Thêm KOC</button><button class="btn primary" id="kClose">Xong</button></div>`);
  $('#kClose').onclick = () => { m.close(); if (S.p) refresh(); };
  $('#kAdd').onclick = () => pickFiles(false, async ([f]) => {
    if (!f) return; const name = prompt('Đặt tên cho KOC này:', f.name.replace(/\.[^.]+$/, '')) || 'koc';
    try { await api('POST', `/api/koc?name=${encodeURIComponent(name)}`, undefined, await normalizedBlob(f)); m.close(); kocDialog(selectMode); } catch (er) { fail(er); }
  });
  m.el.onclick = async (e) => {
    const d = e.target.closest('[data-kdel]');
    if (d) { e.stopPropagation(); if (!confirm('Xóa KOC này khỏi thư viện?')) return; await api('DELETE', `/api/koc/${encodeURIComponent(d.dataset.kdel)}`).catch(fail); m.close(); return kocDialog(selectMode); }
    const k = e.target.closest('.koc');
    if (k && selectMode && S.p) { await api('PATCH', `/api/projects/${S.p.id}`, { s2: { kocId: k.dataset.koc } }).catch(fail); m.close(); }
  };
}

// ---------- cài đặt ----------
$('#btnSettings').onclick = async () => {
  S.cfg = await api('GET', '/api/config');
  try { const v = await api('GET', '/api/version'); if (v.version) { const el = $('#appVer'); if (el) el.textContent = 'v' + v.version; } } catch (_) {} const c = S.cfg;
  const fixed = !!c.fixedOutputRoot;
  const m = modal(`<h3>Cài đặt</h3>
    <label class="lbl" for="cOut">Thư mục lưu ảnh 2K (mỗi sản phẩm tự tạo thư mục con)</label>
    <div style="display:flex;gap:8px">
      <input id="cOut" style="flex:1;min-width:0" value="${esc(c.outputRoot)}" spellcheck="false" ${fixed ? 'readonly' : ''}>
      ${fixed ? '' : `<button class="btn ghost sm" id="cOutPick" type="button" data-tip="Mở hộp chọn thư mục của Windows">Chọn thư mục…</button>
      <button class="btn ghost sm" id="cOutDef" type="button" data-tip="Trả về thư mục output mặc định nằm trong thư mục tool">Mặc định</button>`}
    </div>
    <div class="hint ${fixed ? '' : 'warn'}">${fixed
      ? 'Trên máy này thư mục ảnh được <b>cố định</b> ở <code>E:\\FlowLookbook\\output</code> — không đổi được từ Cài đặt.'
      : (c.outputRootChosen
        ? 'Nên để <b>mặc định</b> ở thư mục <b>output</b> trong thư mục tool. Chỉ đổi sang ổ khác khi bạn thật sự muốn (ví dụ ổ C sắp đầy). Tránh chọn ổ ngoài / USB vì rút ra giữa chừng có thể làm hỏng ảnh đang tải.'
        : '<b>Chưa chọn thư mục lưu ảnh.</b> Bấm “Chọn thư mục…” rồi Lưu để ảnh 2K đi đúng chỗ.')}</div>
    <label class="lbl" for="cPar">Số lượt Flow chạy cùng lúc</label><input id="cPar" type="number" min="1" max="8" value="${c.maxParallelRuns}">
    <div class="hint">Khuyên dùng 3–4. Chạy nhiều quá dễ bị Flow cảnh báo hoạt động bất thường; nếu gặp lỗi hãy giảm xuống.</div>
    <label class="lbl" for="c2k">Số ảnh 2K tải cùng lúc (các cảnh chạy song song)</label><input id="c2k" type="number" min="1" max="16" value="${c.concurrent2k ?? 8}">
    <div class="hint">Cho phép nhiều cảnh tải bản 2K cùng lúc nên xem nét nhanh hơn. Khuyên dùng 8; cao quá (12–16) dễ bị Flow cảnh báo và tốn RAM.</div>
    <label class="lbl" style="display:flex;gap:8px;align-items:flex-start;font-weight:500"><input id="cFast" type="checkbox" ${c.fastMode ? 'checked' : ''} style="margin-top:3px"><span><b>Chế độ nhanh</b>: giảm delay giữa thao tác và bỏ bước kiểm tra thứ tự ảnh trong Flow. Nhanh hơn ~10–20 s/lượt nhưng <b>tăng nguy cơ Flow cảnh báo spam</b>. Chỉ bật khi đã ổn định.</span></label>
    <label class="lbl" for="cTabs">Giới hạn tab Chrome đang mở cùng lúc</label><input id="cTabs" type="number" min="4" max="32" value="${c.maxChromeTabs ?? 12}">
    <div class="hint">Tránh hết RAM khi chạy nhiều cảnh + tải 2K song song. Khuyên dùng 12.</div>
    <label class="lbl" style="display:flex;gap:8px;align-items:flex-start;font-weight:500"><input id="cHq" type="checkbox" ${c.hqIntermediate !== false ? 'checked' : ''} style="margin-top:3px"><span>Lấy <b>bản 2K nét</b> cho ảnh đã chọn ở bước 1 và 2 trước khi dùng cho bước sau (ảnh đầu vào nét hơn, kết quả cuối nét hơn). Mỗi ảnh đã chọn tốn thêm vài giây.</span></label>
    <label class="lbl" style="display:flex;gap:8px;align-items:flex-start;font-weight:500"><input id="cAutoClean" type="checkbox" ${c.autoCleanOldInstallers !== false ? 'checked' : ''} style="margin-top:3px"><span><b>Tự dọn file cài đặt cũ</b>: sau khi bản mới mở lại, xóa file installer vừa tải và các installer cũ trong thư mục <code>dist</code> (chỉ giữ bản mới nhất). Không đụng vào dự án/ảnh của bạn.</span></label>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn ghost sm" id="cBackup" type="button" data-tip="Sao lưu toàn bộ dữ liệu (dự án + ảnh) vào thư mục backups trong data/">Sao lưu dữ liệu</button>
      <span class="hint" style="margin:0;align-self:center">${c.lastBackupAt ? 'Lần sao lưu gần nhất: ' + new Date(c.lastBackupAt).toLocaleString('vi-VN') : 'Chưa sao lưu lần nào.'}</span>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap">
      <span class="hint" style="margin:0">Phiên bản hiện tại: <b id="cVer">v${esc(CURRENT_VERSION || '...')}</b></span>
      <button class="btn ghost sm" id="cCheckUpdate" type="button" data-tip="Kiểm tra xem có phiên bản mới không">Kiểm tra cập nhật</button>
    </div>
    <details class="adv"><summary>Nâng cao</summary>
      <label class="lbl" for="cChrome">Đường dẫn Chrome</label><input id="cChrome" style="width:100%" value="${esc(c.chromePath)}" placeholder="Để trống — tool tự tìm Chrome">
      <div class="hint">Tool điều khiển Flow bằng một cửa sổ Chrome riêng. Bình thường bạn <b>để trống</b>. Chỉ điền khi Chrome cài ở chỗ không mặc định, ví dụ <code>D:&#92;Chrome&#92;chrome.exe</code>.</div>
    </details>
    <div class="foot"><button class="btn" id="sCancel">Đóng</button><button class="btn primary" id="sOk">Lưu</button></div>`, true);
  $('#sCancel').onclick = m.close;
  // Đổi thư mục: mở hộp chọn của Windows (chỉ có khi chạy trong app); bản web thì gõ/dán đường dẫn.
  // Máy có đường dẫn cố định thì ẩn hẳn 2 nút này.
  if (!fixed) {
    $('#cOutDef').onclick = () => { $('#cOut').value = c.defaultOutputRoot || c.outputRoot; };
    $('#cOutPick').onclick = async () => {
      if (!window.flowBridge?.pickFolder) { toast('Bản chạy trên trình duyệt không mở được hộp chọn thư mục. Bạn hãy gõ hoặc dán đường dẫn vào ô trên.', ''); return; }
      try { const dir = await window.flowBridge.pickFolder($('#cOut').value.trim()); if (dir) $('#cOut').value = dir; } catch (er) { fail(er); }
    };
  }
  $('#sOk').onclick = async () => {
    const payload = { hqIntermediate: $('#cHq').checked, fastMode: $('#cFast').checked, autoCleanOldInstallers: $('#cAutoClean').checked, maxParallelRuns: +$('#cPar').value, concurrent2k: +$('#c2k').value, maxChromeTabs: +$('#cTabs').value, chromePath: $('#cChrome').value };
    if (!fixed) payload.outputRoot = $('#cOut').value;
    try { await api('POST', '/api/config', payload); m.close(); S.cfg = await api('GET', '/api/config').catch(() => S.cfg); toast('Đã lưu cài đặt.', 'ok'); } catch (er) { fail(er); }
  };
  $('#cCheckUpdate').onclick = async () => {
    const btn = $('#cCheckUpdate'); const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
    try { await checkUpdate(true); } catch (er) { fail(er); } finally { btn.disabled = false; btn.textContent = orig; }
  };
  $('#cBackup').onclick = async () => { const btn = $('#cBackup'); const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Đang sao lưu…'; try { const r = await api('POST', '/api/backup'); toast('Đã sao lưu vào: ' + r.path, 'ok', { duration: 10000, action: { label: 'Mở thư mục sao lưu', title: 'Mở thư mục chứa các bản sao lưu', onClick: () => api('POST', '/api/backup/open') } }); } catch (er) { fail(er); } finally { btn.disabled = false; btn.textContent = orig; } };
};

// ---------- cập nhật ----------
// Đọc version.json từ link đặt sẵn trong server.js. Không cần người dùng cấu hình gì.
async function checkUpdate(manual) {
  if (!UPDATE_MANIFEST_URL) { if (manual) toast('Tính năng cập nhật tự động chưa được thiết lập. Vui lòng liên hệ người phát triển.', ''); return; }
  // Thêm tham số ngẫu nhiên để GitHub raw/CDN không trả nội dung cũ sau khi publish bản mới.
  const sep = UPDATE_MANIFEST_URL.includes('?') ? '&' : '?';
  const r = await fetch(UPDATE_MANIFEST_URL + sep + '_t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Không tải được thông tin cập nhật (HTTP ' + r.status + ').');
  const info = await r.json();
  if (!info || !info.version || !info.url) throw new Error('File thông tin cập nhật không đúng định dạng.');
  if (compareVer(info.version, CURRENT_VERSION || '0') <= 0) {
    if (manual) toast('Bạn đang dùng phiên bản mới nhất (v' + (CURRENT_VERSION || '?') + ').', 'ok');
    return;
  }
  showUpdateDialog(info);
}

function showUpdateDialog(info) {
  if (S.updateDialogOpen) return;
  S.updateDialogOpen = true;
  const m = modal(`<h3>Có phiên bản mới: v${esc(info.version)}</h3>
    <div class="hint" style="margin:0 0 6px">Phiên bản hiện tại: v${esc(CURRENT_VERSION || '?')}</div>
    <div class="update-notes">${esc(info.notes || 'Bản cập nhật mới.')}</div>
    <div id="uState" class="hint" style="margin-top:10px;min-height:20px"></div>
    <div class="foot"><button class="btn" id="uClose">Để sau</button><button class="btn primary" id="uInstall">Tải về và cập nhật</button></div>`, true);
  let installing = false;
  const close = () => { if (installing) return; S.updateDialogOpen = false; m.close(); };
  $('#uClose').onclick = close;
  m.el.onmousedown = (e) => { if (e.target === m.el) close(); };

  const showReloadRequired = (file) => {
    installing = true;
    const state = $('#uState');
    const btn = $('#uInstall');
    const closeBtn = $('#uClose');
    closeBtn.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Tải lại để cập nhật';
    btn.className = 'btn primary';
    state.innerHTML = `<span class="badge ok" style="display:inline-flex;margin-bottom:8px">Đã tải xong v${esc(info.version)} — app vẫn đang mở</span><div>Bấm nút bên dưới để <b>cài đặt</b> bản mới. App sẽ đếm ngược 3 giây rồi tắt để cài đặt.</div>`;
    btn.onclick = () => {
      btn.disabled = true;
      const tick = (n) => {
        btn.textContent = n > 0 ? `Tắt app sau ${n}s…` : 'Đang cài đặt…';
        state.innerHTML = n > 0
          ? `App sẽ tắt sau <b>${n} giây</b> để cài bản <b>v${esc(info.version)}</b>.<br>Sau khi cài xong (khoảng 30–60 giây), <b>mở lại app bằng shortcut trên Desktop</b> để dùng phiên bản mới.`
          : 'Đang cài đặt im lặng. Mở lại app bằng shortcut sau khoảng 30–60 giây.';
        if (n > 0) setTimeout(() => tick(n - 1), 1000);
        else window.flowBridge.installUpdate(file, info.version).catch((er) => {
          btn.disabled = false;
          btn.textContent = 'Tải lại để cập nhật';
          fail(er);
        });
      };
      tick(3);
    };
  };

  $('#uInstall').onclick = async () => {
    const btn = $('#uInstall'); btn.disabled = true; btn.textContent = 'Đang tải…';
    try {
      if (!window.flowBridge?.downloadUpdate) {
        window.open(info.url, '_blank'); close(); return;
      }
      const state = $('#uState');
      window.flowBridge.onUpdateProgress((pct) => {
        if (state) state.textContent = pct >= 0 ? `Đang tải bản cập nhật… ${pct}%` : 'Đang tải bản cập nhật…';
      });
      const file = await window.flowBridge.downloadUpdate(info.url);
      // App vẫn mở. Chỉ khi người dùng bấm nút bắt buộc bên dưới mới cài và tải lại.
      showReloadRequired(file);
    } catch (er) {
      btn.disabled = false; btn.textContent = 'Thử lại';
      fail(er);
    }
  };
}

init().catch(fail);

// ---------- chú thích nhỏ khi di chuột / dùng bàn phím ----------
const tipEl = $('#tip'); let tipTarget = null;
function hideTip() { tipEl.classList.remove('show'); tipTarget = null; }
function showTip(el) {
  const text = el.dataset.tip; if (!text) return;
  tipEl.textContent = text;
  const r = el.getBoundingClientRect(); const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
  let y = r.top - th - 9; if (y < 8) y = r.bottom + 9; // không đủ chỗ phía trên thì hiện phía dưới
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  tipEl.classList.add('show');
}
document.addEventListener('mouseover', (e) => { const el = e.target.closest?.('[data-tip]'); if (el === tipTarget) return; tipTarget = el; el ? showTip(el) : tipEl.classList.remove('show'); });
document.addEventListener('mousedown', hideTip);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) { tipTarget = el; showTip(el); } });
document.addEventListener('focusout', hideTip);

// chú thích không bị kẹt: ẩn khi chuột rời cửa sổ, khi cửa sổ mất focus, hoặc khi phần tử bị vẽ lại
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) hideTip(); });
window.addEventListener('blur', hideTip);
setInterval(() => { if (tipTarget && !document.contains(tipTarget)) hideTip(); }, 300);

// đổi cỡ cửa sổ khi đang xem ảnh: tính lại cho vừa khung và căn giữa
window.addEventListener('resize', () => {
  if ($('#lightbox').classList.contains('hidden') || !LB.nw) return;
  const was = Math.abs(LB.s - LB.fit) < 0.002; const st = $('#lbStage').getBoundingClientRect();
  LB.fit = Math.min(1, (st.width * 0.92) / LB.nw, (st.height - 100) / LB.nh);
  if (was) { LB.s = LB.fit; LB.x = 0; LB.y = 0; }
  lbApply();
});
