const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// Chạy thật các hàm đọc thông tin cập nhật (không nạp toàn bộ app.js vì cần DOM).
function updateHelpers(manifestUrl, currentVersion, fetchImpl) {
  const start = src.indexOf('const normalizeVersion =');
  const end = src.indexOf('async function checkUpdate(manual)');
  assert.ok(start >= 0 && end > start, 'Phải tìm thấy khối hàm cập nhật trong app.js');
  const code = src.slice(start, end) + '\nglobalThis.__h = { readUpdateInfo, parseManifestInfo, parseLatestRelease, latestReleaseApiUrl };';
  const context = {
    UPDATE_MANIFEST_URL: manifestUrl,
    CURRENT_VERSION: currentVersion,
    fetchWithTimeout: fetchImpl,
    compareVer: (a, b) => {
      const pa = String(a || '').split('.').map(Number);
      const pb = String(b || '').split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x > y ? 1 : -1;
      }
      return 0;
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.__h;
}
const jsonResponse = (data) => ({ ok: true, json: async () => data });

test('giao diện không gọi hộp nhập tên của trình duyệt (Electron không hỗ trợ)', () => {
  // Chỉ khớp lời gọi thật có đối số là chuỗi, không khớp chữ "prompt" trong câu tiếng Việt.
  assert.doesNotMatch(src, /(?:window\.)?prompt\s*\(\s*['"`]/, 'Không được gọi prompt() trong app.js');
  assert.match(src, /function askText\(/, 'Phải có hộp nhập chữ thay thế ngay trong app');
});

test('nút Thêm KOC hỏi tên bằng hộp nhập của app và xử lý khi hủy', () => {
  assert.match(src, /const name = await askText\('Thêm KOC'/, 'Nút Thêm KOC phải dùng askText()');
  assert.match(src, /if \(name === null\) return kocDialog\(selectMode\)/, 'Bấm Hủy phải hiện lại thư viện KOC');
  assert.match(src, /activeModalClose = \(\) => finish\(null\)/, 'Esc phải hủy hộp nhập, không để promise treo');
});

test('hết 5 lần mở Flow thì báo riêng cho cảnh kèm nút Mở Flow đúng cảnh đó', () => {
  assert.match(src, /run\.errorCode === 'FLOW_BLOCKED_GIVE_UP'/, 'Phải nhận diện lỗi Flow đã hết lần thử');
  assert.match(src, /label: 'Mở Flow'/, 'Thông báo phải có nút Mở Flow');
  assert.match(src, /sceneId: item\.scene\?\.id/, 'Nút Mở Flow phải mở đúng dự án của cảnh');
  assert.match(src, /if \(kind === 'err' && \/flow\/i\.test\(msg\) && !opts\.action\)/, 'Có nút riêng thì không thêm nút Mở Flow chung sai cảnh');
});

test('dialog cập nhật không bị kẹt cờ khi modal khác thay thế', () => {
  assert.match(src, /S\.updateDialogOpen = false;\n  const close = \(\) => \{/, 'modal() phải reset cờ updateDialogOpen');
  assert.match(src, /if \(S\.updateDialogOpen && \$\('#uInstall'\)\) return;/, 'Chỉ chặn khi dialog cập nhật thật sự đang mở');
  assert.match(src, /const m = modal\(`<h3>Có phiên bản mới: v\$\{esc\(info\.version\)\}<\/h3>[\s\S]*S\.updateDialogOpen = true;/, 'Phải set cờ sau khi tạo dialog cập nhật');
});

test('danh sách dự án có vai trò nút để mở dự án', () => {
  assert.match(src, /role="button" tabindex="0" aria-label="Mở dự án/, 'Mục dự án phải có role button và aria-label mở dự án');
});

test('Bước 4 chỉ chạy sau khi bật toggle và có nút duyệt Ổn, chỉnh mask', () => {
  assert.match(src, /id="cRemoveLogo"/, 'Phải có toggle bật/tắt xóa logo');
  assert.match(src, /removeLogoEnabled: \$\('#cRemoveLogo'\)\.checked/, 'Toggle phải được lưu qua /api/config');
  for (const id of ['cMaskX', 'cMaskY', 'cMaskW', 'cMaskH']) assert.match(src, new RegExp(`id="${id}"`), `Phải có ô chỉnh ${id}`);
  assert.match(src, /logoRemoveMask: \{ xPct: \+\$\('#cMaskX'\)\.value/, 'Mask phải được lưu cùng cài đặt');
  assert.match(src, /data-act="logook"/, 'Phải có nút Ổn trước khi tải ảnh sạch');
  assert.match(src, /data-act="fireflyreveal"/, 'Phải có nút hiện Firefly để kiểm tra kết quả');
  assert.match(src, /fireflyQuotaPaused/, 'Phải hiện trạng thái Firefly hết lượt trên thanh trạng thái');
  assert.match(src, /data-act="logoresume"/, 'Phải có nút tiếp tục sau khi đổi Gmail');
  assert.match(src, /esc\(lr\.error \|\| ''\)/, 'Thông báo lỗi/quota phải hiển thị từ máy chủ gửi sang');
});

test('xóa dự án báo rõ thư mục output bị xóa, không còn nói giữ ảnh', () => {
  assert.match(src, /thư mục ảnh trong output sẽ bị xóa vĩnh viễn/, 'phải cảnh báo xóa ảnh trong output');
  assert.ok(!/ảnh 2K đã lưu trong thư mục kết quả vẫn được giữ/.test(src), 'không được nói ảnh được giữ nữa');
  assert.match(src, /outputDirsRemoved \?/, 'toast phải đếm thư mục ảnh đã xóa');
});

test('Bước 3 có nút tải hết ảnh về & dọn dẹp, xong mới sang Bước 4', () => {
  assert.match(src, /data-act="cleanall"[\s\S]{0,260}📥 Tải hết ảnh về & Dọn dẹp/, 'phải có nút tải hết ảnh về');
  assert.match(src, /r\.startLogo\?\.length/, 'toast phải báo Bước 4 vừa bắt đầu');
  assert.match(src, /JSON\.stringify\(\[!!S\.cfg\?\.removeLogoEnabled, !!p\.cleaned,/, 'phải render lại khi trạng thái đã tải/dọn thay đổi');
  assert.match(src, /Đã tải hết ảnh 2K, thư mục chỉ còn ảnh đã chọn/, 'trạng thái sau dọn phải rõ ràng');
});

test('hết lượt Firefly: banner mở Firefly để đổi Gmail và báo không làm lại ảnh cũ', () => {
  assert.match(src, /Firefly hết lượt free ở <b>/, 'phải báo tên ảnh đang bị chặn');
  assert.match(src, /tối đa \$\{\+\(S\.flow\?\.fireflyDaily\?\.limit \|\| 3\)\} ảnh\/ngày/, 'phải nói rõ giới hạn free hàng ngày');
  assert.match(src, /không làm lại ảnh cũ/);
  assert.match(src, /data-act="fireflyopen">Mở Firefly để đổi Gmail/, 'phải có nút mở Firefly để đăng nhập mail khác');
  assert.match(src, /lr\.generated \? ' <span class="badge warn"/, 'ảnh đã tạo phải hiện trạng thái chờ tải lại');
});

test('manifest raw bị cache cũ vẫn lấy bản mới từ GitHub Releases API', async () => {
  const calls = [];
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      calls.push(url);
      if (url.includes('api.github.com')) {
        return jsonResponse({
          tag_name: 'v1.1.30',
          body: '- Bản mới',
          assets: [
            { name: 'Flow.Lookbook.Setup.1.1.30.exe.blockmap', browser_download_url: 'https://x/blockmap' },
            { name: 'Flow.Lookbook.Setup.1.1.30.exe', browser_download_url: 'https://github.com/anhtuanta1234-bit/FlowLookbook/releases/download/v1.1.30/Flow.Lookbook.Setup.1.1.30.exe' },
          ],
        });
      }
      return jsonResponse({ version: '1.1.29', url: 'https://github.com/old.exe', notes: 'cũ' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.30');
  assert.match(info.url, /Flow\.Lookbook\.Setup\.1\.1\.30\.exe$/);
  assert.equal(calls.length, 2, 'Phải hỏi thêm GitHub API khi manifest không có bản mới');
});

test('raw cache trả bản cũ nhưng vẫn cao hơn current thì API vẫn thắng', async () => {
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) return jsonResponse({ tag_name: 'v1.1.31', assets: [{ name: 'setup.exe', browser_download_url: 'https://github.com/new.exe' }] });
      return jsonResponse({ version: '1.1.30', url: 'https://github.com/stale.exe', notes: 'cache cũ' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.31', 'Không được tin manifest cache dù nó cũng "mới hơn" current');
});

test('API lỗi/rate-limit thì vẫn dùng manifest mới nhất', async () => {
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) throw new Error('rate limit');
      return jsonResponse({ version: '1.1.31', url: 'https://github.com/new.exe', notes: 'mới' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.31');
});

test('GitHub API lỗi thì vẫn dùng manifest đang có, không báo lỗi giả', async () => {
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) throw new Error('rate limit');
      return jsonResponse({ version: '1.1.29', url: 'https://github.com/old.exe', notes: 'cũ' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.29');
  assert.equal(info.uncertain, true, 'Không được tự tin báo "đã mới nhất" khi API lỗi và raw có thể bị cache cũ');
});

test('checkUpdate khi không chắc chắn thì hiện cảnh báo thay vì báo đã mới nhất', () => {
  assert.match(src, /if \(info\.uncertain\) toast\('Chưa xác nhận được bản mới nhất/, 'Phải báo không xác nhận được khi API lỗi');
  assert.match(src, /else if \(manual\) toast\('Bạn đang dùng phiên bản mới nhất/, 'Chỉ báo đã mới nhất khi chắc chắn');
});

test('đổi raw URL thành đúng GitHub Releases API cùng repo', () => {
  const h = updateHelpers('', '1.1.29', async () => jsonResponse({}));
  assert.equal(
    h.latestReleaseApiUrl('https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json'),
    'https://api.github.com/repos/anhtuanta1234-bit/FlowLookbook/releases/latest',
  );
});

test('thanh bước có Bước 4 nối ngay sau Bước 3 và chỉ xong khi ảnh sạch có đủ', () => {
  assert.match(src, /\{ n: 4, t: 'Xóa logo'/, 'Phải có tab Bước 4');
  assert.match(src, /if \(!p\.cleaned \|\| !scenes\.length\) return false;/, 'Chưa dọn xong thì Bước 4 chưa xong');
  assert.match(src, /scenes\.every\(\(s\) => \['approved', 'skipped'\]\.includes\(s\.logoRemoval\?\.status\)\)/, 'Mọi cảnh phải có ảnh sạch hoặc được bỏ qua');
  assert.match(src, /S\.stage === 4 \? \[\] : p\[PK\[S\.stage\]\]\.runs/, 'Bước 4 không đọc runs của Flow');
});

test('giao diện Bước 4 hiện đúng chuỗi thao tác Firefly và nhật ký theo thời gian thực', () => {
  assert.match(src, /const LOGO_FLOW_STEPS = \[[\s\S]*?Cắt ảnh về khung 9:16[\s\S]*?Chấm sửa và xóa[\s\S]*?Mở “Cài đặt cọ”, chọn cỡ 14[\s\S]*?Chấm đúng 1 lần vào vùng logo[\s\S]*?Bấm “Xóa” trên Firefly[\s\S]*?tool bấm “Tải xuống”/);
  assert.match(src, /id="logoPhaseList"/, 'Phải có danh sách tiến trình Firefly');
  assert.match(src, /id="logoNow"/, 'Phải hiện thao tác đang chạy');
  assert.match(src, /function patchLogoPhases\(\)/, 'Tiến trình phải cập nhật khi server gửi phase mới');
  assert.match(src, /\(lr\.phases \|\| \[\]\)\.slice\(-10\)\.map\(\(x\) =>/, 'Mỗi cảnh phải hiện nhật ký thao tác');
  assert.match(src, /<div class="phaselist">\$\{phases\}<\/div>/);
  assert.match(src, /data-act="logook"[\s\S]{0,80}>Ổn<\/button>/, 'Bấm Ổn mới tải ảnh sạch');
  assert.match(src, /data-act="opensettings"/, 'Bước 4 phải mở được Cài đặt để chỉnh cọ/mask');
});

test('Bước 4 hiện hàng chờ từng ảnh và đặt cỡ cọ 14 trong Cài đặt', () => {
  assert.match(src, /function logoQueueRows\(p\)/, 'Phải tính thứ tự ảnh chưa xong');
  assert.match(src, /function logoQueueHtml\(p\)/, 'Phải hiện hàng chờ trên giao diện');
  assert.match(src, /hàng chờ \$\{q\.no\}/, 'Mỗi cảnh phải hiện số thứ tự trong hàng chời');
  assert.match(src, /trong hàng chờ/, 'Ảnh chưa tới lượt phải hiện rõ là đang chờ');
  assert.match(src, /Firefly hết lượt free ở <b>\$\{esc\(quotaScene\.label \|\| `Cảnh \$\{quotaIndex \+ 1\}`\)\}<\/b>/, 'Banner phải nói tên ảnh hết lượt');
  assert.match(src, /tối đa \$\{\+\(S\.flow\?\.fireflyDaily\?\.limit \|\| 3\)\} ảnh\/ngày/, 'Banner phải nói rõ giới hạn 3 ảnh/ngày');
  assert.match(src, /Đã đổi Gmail khác, tiếp tục/, 'Banner phải hướng dẫn bấm nút đổi Gmail');
  assert.match(src, /Lượt free hôm nay: <b>\$\{\+\(S\.flow\?\.fireflyDaily\?\.count \|\| 0\)\}\/\$\{\+\(S\.flow\?\.fireflyDaily\?\.limit \|\| 3\)\}<\/b>/, 'Bước 4 phải hiện số lượt đã dùng');
  assert.match(src, /Firefly hết \$\{S\.flow\.fireflyDaily\?\.limit \|\| 3\} lượt free\/ngày — đổi mail/, 'Thanh trạng thái phải nhắc đổi mail');
  assert.match(src, /id="cBrush"[^>]*min="5"[^>]*max="128"/, 'Cài đặt phải có ô cỡ cọ');
  assert.match(src, /logoBrushSize: \+\$\('#cBrush'\)\.value/, 'Cỡ cọ phải được lưu qua /api/config');
});

test('hàng chờ Bước 4 hiện đúng số ảnh 01, 02, 03 đã đặt từ Bước 3', () => {
  assert.match(src, /no: \+\(s\.order \|\| i \+ 1\)/, 'dùng số thứ tự thật của ảnh, không đánh số lại từ 1');
  assert.match(src, /sort\(\(a, b\) => a\.no - b\.no\)/, 'hàng chờ đi theo thứ tự ảnh');
  assert.ok(src.includes('Ảnh ${+(s.order || i + 1)}'), 'thẻ ảnh hiện đúng số ảnh');
  assert.ok(src.includes('01, 02, 03'), 'giải thích rõ cách đánh số ảnh');
  assert.match(src, /Mở anhdaxoalogo/, 'nút mở đúng thư mục anhdaxoalogo');
  assert.match(src, /output\/&lt;project&gt;\/anhdaxoalogo\//, 'hướng dẫn đúng đường dẫn output/<dự án>/anhdaxoalogo');
  assert.match(src, /ảnh số <b>\$\{String\(quotaNo\)\.padStart\(2, '0'\)\}<\/b>/, 'banner hết lượt nói rõ đang chặn ảnh số mấy');
});

test('Bước 4 gọn hơn: mỗi ảnh 1 nút chính, thao tác phụ gấp vào menu Thêm', () => {
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  const scene = src.slice(src.indexOf('function sceneMoreMenu('), src.indexOf('function logoResultsHtml('));
  const results = src.slice(src.indexOf('function logoResultsHtml('), src.indexOf('const runSig'));
  assert.ok(!/data-act="fireflyopen"/.test(ctl), 'thanh điều khiển không còn nút Firefly trùng');
  assert.ok(!/data-act="logoresume"/.test(ctl), 'thanh điều khiển không còn nút tiếp tục trùng');
  assert.match(ctl, /<details class="lite-details">/, 'hướng dẫn dài được gập lại');
  assert.match(ctl, /data-act="fireflyreveal"[\s\S]{0,120}>Firefly<\/button>/, 'chỉ còn một nút Firefly');
  assert.match(scene, /function sceneMoreMenu\(items\)/, 'có menu gấp thao tác phụ');
  assert.match(scene, /<details class="scene-more">/, 'mỗi ảnh dùng menu Thêm');
  assert.match(scene, /data-act="logook"[\s\S]{0,120}>Ổn<\/button>/, 'nút chính là Ổn');
  assert.match(scene, /data-act="logoresume"[\s\S]{0,140}>Đã đổi Gmail khác, tiếp tục<\/button>/, 'nút tiếp tục chỉ nằm trên thẻ ảnh bị chặn');
  assert.ok(!/Ổn — tải ảnh sạch/.test(scene), 'không còn chuỗi nút dài');
  assert.ok(!/data-act="fireflyopen"/.test(results), 'kết quả Bước 4 không còn nút mở Firefly trùng');
  assert.ok(!/data-act="fireflyreveal"/.test(results), 'kết quả Bước 4 không còn nút Firefly trùng');
});

test('dọn xong Bước 3 thì chuyển hẳn sang Bước 4, không cần bấm tab', () => {
  assert.match(src, /async function showStep4IfReady\(\)/);
  assert.match(src, /fresh\.stage === 4\) \{\s*S\.p = fresh; S\.stage = 4;/, 'Phải đổi stage trên giao diện');
  assert.match(src, /return showStep4IfReady\(\);/, 'finish phải gọi hàm chuyển bước');
  assert.match(src, /toast\(`Đã tải\/dọn xong \$\{r\.cleaned\} dự án[\s\S]{0,220}showStep4IfReady\(\)/, 'clean-all cũng phải chuyển bước');
});
