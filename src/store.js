// Lưu dự án dạng file JSON + thư mục ảnh. Đơn giản, không cần cài cơ sở dữ liệu.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');

const projectsDir = () => path.join(cfg.dataDir, 'projects');
const kocDir = () => path.join(cfg.dataDir, 'koc');
const templatesFile = () => path.join(cfg.dataDir, 'templates.json');

const uid = (n = 8) => crypto.randomBytes(n).toString('hex');

// Tên an toàn cho Windows: bỏ ký tự cấm, ký tự điều khiển, chấm/khoảng trắng cuối,
// và tránh tên thiết bị dành riêng (CON, PRN, AUX, NUL, COM1…9, LPT1…9).
function safeName(s) {
  let out = String(s ?? '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(out)) out = '_' + out;
  return out.slice(0, 80).replace(/[. ]+$/g, '') || 'du-an';
}

function suffixedFolder(base, suffix) {
  const tail = ` (${suffix})`;
  return `${base.slice(0, Math.max(1, 80 - tail.length)).trimEnd()}${tail}`;
}

const DEFAULT_TEMPLATES = {
  stage1: {
    vi: 'Yêu cầu: tách toàn bộ da thịt ra khỏi trang phục, trang phục đặt trên nền trắng, tư thế quần áo giống ảnh tham chiếu 100%, không đặt nằm, trang phục không bị mờ nhòe (làm nét trang phục, vẫn giữ nguyên chi tiết), rõ ràng và giống chi tiết ảnh tham chiếu 100%.\n\nPhong cách ảnh chụp đời thực: shot on 35mm lens, f/2.8, ánh sáng tự nhiên từ cửa sổ, slight film grain, không HDR, không làm mịn quá mức, không sharpen quá đà. Giữ nguyên texture vải và chi tiết.\n\nTránh: da nhựa, CGI, render 3D, hiệu ứng AI, mờ nhòe, biến dạng trang phục.',
    negative: 'plastic skin, CGI, 3D render, AI artifacts, blur, distortion, over-sharpening, over-smoothing',
  },
  stage2: {
    vi: `Yêu cầu: nhân vật ảnh 1 mặc trang phục ảnh 2 (cam kết giữ nguyên 100% toàn bộ chi tiết trang phục ảnh 2 và cam kết giữ 100% khuôn mặt nhân vật ảnh 1), biểu cảm tươi cười nhẹ nhàng, chụp toàn thân.

Phong cách ảnh chụp đời thực cực kỳ tự nhiên như một KOL/KOC ngoài đời được chụp ngẫu hứng bằng máy ảnh thật. Ảnh tông màu sáng, da người giữ nguyên texture tự nhiên, không làm mịn quá mức, không bóng da nhựa, không nét giả AI. Biểu cảm và dáng pose tự nhiên như ảnh đăng Instagram/TikTok hằng ngày, không tạo dáng cứng, không cảm giác render hay CGI. Màu sắc thật mắt, độ sâu ảnh và ánh sáng giống camera thật. Ảnh mang cảm giác người thật 100%, giống fashion/lifestyle street photography thực tế, không studio, không cinematic giả, không HDR mạnh, không hiệu ứng AI, không khuôn mặt vô hồn, không tỷ lệ cơ thể bất thường, không sharpen quá đà, giữ tổng thể mềm mại và chân thật như ảnh chụp trực tiếp ngoài đời.

Yêu cầu giữ nguyên 100% khuôn mặt nhân vật ảnh 1: không thay đổi khuôn mặt, không đổi danh tính, không làm đẹp quá mức. Ánh sáng: match lighting của ảnh tham chiếu, ánh sáng tự nhiên, không studio lighting. Shot on 35mm lens, f/2.8, slight film grain.

Tránh: da nhựa, CGI, render, mặt búp bê, ngón tay thừa, cơ thể biến dạng, HDR mạnh, studio lighting.`,
    negative: 'plastic skin, CGI, render, doll face, extra fingers, distorted body, strong HDR, studio lighting, AI artifacts, over-smoothing',
  },
  stage3: {
    vi: `Yêu cầu: nhân vật ảnh 1 chụp ở bối cảnh giống ảnh 2 (cam kết giữ nguyên 100% trang phục ảnh 1, cam kết giữ 100% khuôn mặt nhân vật ảnh 1, giữ nguyên toàn bộ chi tiết cảnh ảnh 2), giữ nguyên toàn bộ ngoại cảnh giống 100% ảnh 2 (không thay chi tiết ngoại cảnh), biểu cảm tươi cười nhẹ nhàng, góc máy chụp giống 100% ảnh 2, nhân vật ảnh 1 chụp tư thế giống tối đa ảnh 2.

Phong cách ảnh chụp đời thực cực kỳ tự nhiên như một KOL/KOC ngoài đời được chụp ngẫu hứng bằng máy ảnh thật. Ảnh tông màu sáng, da người giữ nguyên texture tự nhiên, không làm mịn quá mức, không bóng da nhựa, không nét giả AI. Biểu cảm và dáng pose tự nhiên như ảnh đăng Instagram/TikTok hằng ngày, không tạo dáng cứng, không cảm giác render hay CGI. Màu sắc thật mắt, độ sâu ảnh và ánh sáng giống camera thật. Ảnh mang cảm giác người thật 100%, giống fashion/lifestyle street photography thực tế, không studio, không cinematic giả, không HDR mạnh, không hiệu ứng AI, không khuôn mặt vô hồn, không tỷ lệ cơ thể bất thường, không sharpen quá đà, giữ tổng thể mềm mại và chân thật như ảnh chụp trực tiếp ngoài đời.

Yêu cầu giữ nguyên 100% khuôn mặt nhân vật ảnh 1: không thay đổi khuôn mặt, không đổi danh tính. Ánh sáng: match lighting của ảnh cảnh (ảnh 2) chính xác, ánh sáng tự nhiên, không studio lighting. Shot on 35mm lens, f/2.8, slight film grain, giữ nguyên texture da.

Tránh: da nhựa, CGI, render, mặt búp bê, ngón tay thừa, cơ thể biến dạng, HDR mạnh, studio lighting, thay đổi ngoại cảnh.`,
    negative: 'plastic skin, CGI, render, doll face, extra fingers, distorted body, strong HDR, studio lighting, AI artifacts, over-smoothing, changing background details',
  },
};

function templates() {
  try { return { ...DEFAULT_TEMPLATES, ...JSON.parse(fs.readFileSync(templatesFile(), 'utf8')) }; } catch (_) { return DEFAULT_TEMPLATES; }
}
function saveTemplates(t) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.writeFileSync(templatesFile(), JSON.stringify(t, null, 2));
}

// ---------- Dự án ----------
const pdir = (id) => path.join(projectsDir(), id);
const pfile = (id) => path.join(pdir(id), 'project.json');

function hasActiveWork(proj) {
  const states = [proj?.s1, proj?.s2, ...(proj?.s3?.scenes || [])].filter(Boolean);
  return states.some((state) =>
    state.hq?.status === 'loading' ||
    (state.runs || []).some((run) =>
      run.status === 'queued' ||
      run.status === 'running' ||
      run.upgrading === true
    ) ||
    state.chosen?.status === 'saving'
  );
}

function legacyOutputFolder(proj, projects) {
  const base = safeName(proj.name);
  const key = base.toLowerCase();
  const claimed = projects.some((other) => other.id !== proj.id && other.outputFolder && safeName(other.outputFolder).toLowerCase() === key);
  if (claimed) return suffixedFolder(base, proj.id);
  const peers = projects.filter((other) => other.id !== proj.id && !other.outputFolder && safeName(other.name).toLowerCase() === key);
  const owner = [...peers, proj].sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))[0];
  return owner.id === proj.id ? base : suffixedFolder(base, proj.id);
}

function outputFolderFor(proj) {
  if (proj.outputFolder) return safeName(proj.outputFolder);
  const projects = list();
  return legacyOutputFolder(proj, projects);
}

function allocateOutputFolder(name, id) {
  const projects = list();
  const occupied = new Set(projects.map((p) => p.outputFolder ? safeName(p.outputFolder) : legacyOutputFolder(p, projects)).map((x) => x.toLowerCase()));
  const base = safeName(name);
  const root = cfg.get().outputRoot;
  let candidate = base;
  if (occupied.has(candidate.toLowerCase()) || fs.existsSync(path.join(root, candidate))) candidate = suffixedFolder(base, id);
  let suffix = 1;
  while (occupied.has(candidate.toLowerCase()) || fs.existsSync(path.join(root, candidate))) {
    candidate = suffixedFolder(base, `${id}-${suffix++}`);
  }
  return candidate;
}

function newRuns() { return []; }

// So tên dự án không phân biệt hoa/thường, bỏ khoảng trắng thừa — dùng để chặn trùng tên.
function nameExists(name, excludeId) {
  const key = safeName(name).toLowerCase();
  return list().some((p) => p.id !== excludeId && safeName(p.name).toLowerCase() === key);
}

function createProject(name) {
  const id = uid(5);
  const t = templates();
  const proj = {
    id,
    name: safeName(name),
    outputFolder: allocateOutputFolder(name, id),
    createdAt: Date.now(),
    stage: 1, // bước đang mở
    maxStage: 1, // bước cao nhất đã mở (các bước sau còn khóa)
    // bước 1: tách trang phục
    s1: { inputs: [], promptVi: t.stage1.vi, promptEn: '', runs: newRuns(), approved: null, flowUrl: null },
    // bước 2: ghép KOC
    s2: { kocId: null, extras: [], promptVi: t.stage2.vi, promptEn: '', runs: newRuns(), approved: null, flowUrl: null },
    // bước 3: ghép cảnh thật; mỗi cảnh có runs riêng
    s3: { promptVi: t.stage3.vi, promptEn: '', extras: [], scenes: [], nextOrder: 1 },
  };
  fs.mkdirSync(path.join(pdir(id), 'assets'), { recursive: true });
  save(proj);
  return proj;
}

// Dữ liệu cũ có thể thiếu trường (hoặc bị sửa tay). Chuẩn hóa để server không crash và giao diện luôn có mảng/object.
function normalizeProject(p) {
  if (!p || typeof p !== 'object') return null;
  if (!Array.isArray(p.s1?.inputs)) p.s1 = { ...(p.s1 || {}), inputs: [] };
  if (!Array.isArray(p.s1.runs)) p.s1.runs = [];
  if (!Array.isArray(p.s2?.extras)) p.s2 = { ...(p.s2 || {}), extras: [] };
  if (!Array.isArray(p.s2.runs)) p.s2.runs = [];
  if (!p.s3 || typeof p.s3 !== 'object') p.s3 = {};
  if (!Array.isArray(p.s3.extras)) p.s3.extras = [];
  if (!Array.isArray(p.s3.scenes)) p.s3.scenes = [];
  p.s3.scenes = p.s3.scenes.filter((sc) => sc && typeof sc === 'object');
  for (const sc of p.s3.scenes) {
    if (!Array.isArray(sc.runs)) sc.runs = [];
    if (!Array.isArray(sc.extras)) sc.extras = [];
  }
  const allRuns = [p.s1, p.s2, ...p.s3.scenes].flatMap((st) => st.runs);
  for (const r of allRuns) {
    if (!r || typeof r !== 'object') continue;
    if (!Array.isArray(r.images)) r.images = [];
    if (!Array.isArray(r.tiles)) r.tiles = [];
    if (!Array.isArray(r.preview2kPending)) r.preview2kPending = [];
  }
  // Số thứ tự cảnh ổn định: dùng để đặt tên file output, không đổi khi xóa cảnh phía trước.
  const used = new Set(p.s3.scenes.filter((s) => s && Number.isInteger(s.order) && s.order > 0).map((s) => s.order));
  for (const sc of p.s3.scenes) {
    if (!sc || typeof sc !== 'object') continue;
    if (!Number.isInteger(sc.order) || sc.order < 1) {
      let n = 1; while (used.has(n)) n++;
      sc.order = n; used.add(n);
    }
  }
  // Bộ đếm chỉ tăng: xóa cảnh cuối rồi thêm cảnh mới KHÔNG được dùng lại số cũ (tránh ghi đè ảnh đã lưu).
  const maxOrder = p.s3.scenes.reduce((m, s) => Math.max(m, s.order || 0), 0);
  if (!Number.isInteger(p.s3.nextOrder) || p.s3.nextOrder <= maxOrder) p.s3.nextOrder = maxOrder + 1;
  p.stage = [1, 2, 3].includes(p.stage) ? p.stage : 1;
  p.maxStage = Math.max(p.maxStage || 1, p.stage);
  return p;
}

// Số thứ tự hiển thị/tên file của một cảnh (ổn định qua các lần xóa/thêm cảnh).
function sceneOrder(proj, sceneId) {
  const scenes = proj?.s3?.scenes || [];
  const sc = scenes.find((s) => s.id === sceneId);
  if (!sc) return 0;
  if (!Number.isInteger(sc.order) || sc.order < 1) {
    const used = new Set(scenes.filter((s) => s !== sc && Number.isInteger(s.order) && s.order > 0).map((s) => s.order));
    let n = 1; while (used.has(n)) n++;
    sc.order = n;
  }
  return sc.order;
}

function save(proj) {
  fs.mkdirSync(pdir(proj.id), { recursive: true });
  const json = JSON.stringify(proj, null, 2);
  const tmp = pfile(proj.id) + '.tmp';
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, pfile(proj.id));
  } catch (e) {
    // Windows/antivirus có thể khóa file tạm trong chốc lát: ghi thẳng để không mất dữ liệu.
    try { fs.writeFileSync(pfile(proj.id), json); } catch (e2) { throw e2; }
    try { fs.rmSync(tmp, { force: true }); } catch (_) {}
  }
}

function load(id) {
  try { return normalizeProject(JSON.parse(fs.readFileSync(pfile(id), 'utf8').replace(/^\uFEFF/, ''))); } catch (_) { return null; }
}

function list() {
  fs.mkdirSync(projectsDir(), { recursive: true });
  return fs.readdirSync(projectsDir())
    .map((id) => load(id))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function remove(id) {
  fs.rmSync(pdir(id), { recursive: true, force: true });
}

function assetPath(id, file) {
  return path.join(pdir(id), 'assets', path.basename(file));
}

function saveAsset(id, buffer, ext = 'png') {
  const file = `${uid(6)}.${ext}`;
  fs.mkdirSync(path.join(pdir(id), 'assets'), { recursive: true });
  fs.writeFileSync(assetPath(id, file), buffer);
  return file;
}

// ---------- Thư viện KOC ----------
function listKoc() {
  fs.mkdirSync(kocDir(), { recursive: true });
  return fs.readdirSync(kocDir()).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => ({ id: f, name: f.replace(/\.[^.]+$/, '') }));
}
function saveKoc(name, buffer, ext) {
  fs.mkdirSync(kocDir(), { recursive: true });
  const base = safeName(name);
  const e = String(ext || 'jpg').replace(/[^a-z]/gi, '').toLowerCase() || 'jpg';
  let file = `${base}.${e}`;
  for (let i = 1; fs.existsSync(path.join(kocDir(), file)); i++) file = `${base} (${i}).${e}`;
  fs.writeFileSync(path.join(kocDir(), file), buffer);
  return file;
}
function kocPath(id) { return path.join(kocDir(), path.basename(id)); }
function removeKoc(id) { fs.rmSync(kocPath(id), { force: true }); }

// ---------- Thư mục xuất ảnh 2K ----------
function outputDirFor(proj) {
  const dir = path.join(cfg.get().outputRoot, outputFolderFor(proj));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  uid, safeName, templates, saveTemplates,
  createProject, nameExists, save, load, list, remove, assetPath, saveAsset,
  listKoc, saveKoc, kocPath, removeKoc, outputDirFor, pdir,
  outputFolderFor, hasActiveWork, sceneOrder, normalizeProject,
  _test: { legacyOutputFolder, suffixedFolder },
};
