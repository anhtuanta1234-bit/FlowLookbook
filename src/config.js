// Cấu hình + đường dẫn dữ liệu. Mọi dữ liệu người dùng nằm trong thư mục data/ (dễ sao lưu, dễ gửi máy khác).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let dataDir;
let isPackaged = false;
try {
  const { app } = require('electron');
  if (app && app.isPackaged) {
    isPackaged = true;
    dataDir = path.join(app.getPath('userData'), 'data');
  }
} catch (_) {}
if (!isPackaged) {
  dataDir = process.env.FLOW_DATA_DIR ? path.resolve(process.env.FLOW_DATA_DIR) : path.join(root, 'data');
}
const file = path.join(dataDir, 'config.json');
const outputRoot = process.env.FLOW_OUTPUT_ROOT ? path.resolve(process.env.FLOW_OUTPUT_ROOT) : (isPackaged ? path.join(dataDir, 'output') : path.join(root, 'output'));

// Máy của người phát triển: thư mục nhận ảnh LUÔN là E:\FlowLookbook\output, kể cả khi chạy bản cài đặt.
// Nhận diện bằng sự tồn tại của thư mục mã nguồn; có thể ghi đè bằng FLOW_OUTPUT_ROOT nếu cần.
const fixedOutputRoot = process.env.FLOW_DISABLE_FIXED_OUTPUT === '1' ? '' : (process.env.FLOW_OUTPUT_ROOT
  ? path.resolve(process.env.FLOW_OUTPUT_ROOT)
  : (process.platform === 'win32' && fs.existsSync('E:\\FlowLookbook') ? path.join('E:\\FlowLookbook', 'output') : ''));

const defaults = {
  cdpPort: 9333,
  // Firefly chạy Chrome riêng (profile + cổng riêng) để đổi Gmail không đụng session Flow.
  fireflyCdpPort: 9334,
  chromePath: '',
  outputRoot, // thư mục gốc để lưu ảnh 2K theo từng dự án
  maxParallelRuns: 4, // số lượt Flow chạy cùng lúc trong 1 tab
  concurrent2k: 8, // số ảnh 2K tải cùng lúc (mở nhiều tab nền; cao quá dễ bị Flow cảnh báo)
  humanDelayMs: [250, 800], // trễ ngẫu nhiên giữa các thao tác, giống người thật
  imagesPerRun: 4,
  hqIntermediate: true, // ảnh đã chọn ở bước 1, 2: tự lấy bản 2K nét trước khi dùng cho bước sau
  aspect: '9:16',
  fastMode: false, // chế độ nhanh: giảm delay giữa thao tác (tăng nguy cơ Flow cảnh báo spam)
  maxChromeTabs: 12, // giới hạn tổng số tab Chrome đang mở để tránh hết RAM
  autoCleanOldInstallers: true, // sau khi update thành công: xóa installer cũ, giữ bản mới nhất
  lastBackupAt: 0,
  // Bước 4 (tùy chọn): xóa logo bằng Adobe Firefly. Tắt mặc định, không ảnh hưởng Bước 1-3.
  removeLogoEnabled: false,
  fireflyHomeUrl: 'https://firefly.adobe.com/',
  // Tâm vùng chấm = (93%, 96%) trên ảnh tham chiếu 2K (trái 2%, xuống 4% so với điểm cũ 95%,92%).
  logoRemoveMask: { xPct: 89.940, yPct: 94.329, wPct: 6.120, hPct: 3.343 },
  logoBrushSize: 14, // cỡ cọ Firefly: mức 14 như thao tác thật trên ảnh mẫu
  // Firefly free hiện chỉ cho 3 ảnh/ngày cho mỗi tài khoản; vượt quá thì nhắc đổi mail.
  fireflyDailyFreeLimit: 3,
  fireflyDailyUsed: { date: '', count: 0 },
};

let cache = null;

function get() {
  if (cache) return cache;
  fs.mkdirSync(dataDir, { recursive: true });
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  cache = { ...defaults, ...saved };
  // Máy này có đường dẫn cố định → bỏ qua mọi giá trị đã lưu, không cho đổi ở Cài đặt.
  if (fixedOutputRoot) {
    cache.outputRoot = fixedOutputRoot;
    try { fs.mkdirSync(fixedOutputRoot, { recursive: true }); } catch (_) {}
  }
  delete cache.geminiKey; delete cache.geminiModel; // không còn dùng Gemini
  return cache;
}

function set(patch) {
  const next = { ...get(), ...patch };
  if (patch.logoRemoveMask) {
    const n = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
    const x = Math.min(99, Math.max(0, n(patch.logoRemoveMask.xPct, 89.940)));
    const y = Math.min(99, Math.max(0, n(patch.logoRemoveMask.yPct, 94.329)));
    next.logoRemoveMask = {
      xPct: x, yPct: y,
      wPct: Math.max(0.1, Math.min(100 - x, n(patch.logoRemoveMask.wPct, 6.12))),
      hPct: Math.max(0.1, Math.min(100 - y, n(patch.logoRemoveMask.hPct, 3.343))),
    };
  }
  if (patch.logoBrushSize !== undefined) {
    const b = Number(patch.logoBrushSize);
    next.logoBrushSize = Number.isFinite(b) ? Math.min(128, Math.max(5, Math.round(b))) : 14;
  }
  if (fixedOutputRoot) next.outputRoot = fixedOutputRoot; // khóa cứng, lưu cài đặt cũng không đổi được
  cache = next;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

// Máy khác: "chưa chọn" = chưa từng lưu outputRoot vào config.json.
// Máy có đường dẫn cố định thì coi như đã chọn sẵn, không cần nhắc.
function hasSavedOutputRoot() {
  if (fixedOutputRoot) return true;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof saved.outputRoot === 'string' && !!saved.outputRoot.trim();
  } catch (_) { return false; }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bộ đếm lượt free Firefly theo ngày. Tự reset sang ngày mới; đổi Gmail thì gọi resetFireflyDailyFree().
function fireflyDailyFree() {
  const c = get();
  const date = todayKey();
  const saved = c.fireflyDailyUsed || {};
  const count = saved.date === date ? Math.max(0, Number(saved.count) || 0) : 0;
  return { date, count, limit: Math.max(1, Number(c.fireflyDailyFreeLimit) || 3) };
}
function consumeFireflyDailyFree() {
  const u = fireflyDailyFree();
  set({ fireflyDailyUsed: { date: u.date, count: u.count + 1 } });
  return fireflyDailyFree();
}
function resetFireflyDailyFree() {
  set({ fireflyDailyUsed: { date: todayKey(), count: 0 } });
  return fireflyDailyFree();
}

module.exports = { get, set, dataDir, root, fixedOutputRoot, defaultOutputRoot: outputRoot, hasSavedOutputRoot, todayKey, fireflyDailyFree, consumeFireflyDailyFree, resetFireflyDailyFree };
