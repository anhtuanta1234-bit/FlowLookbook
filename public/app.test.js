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
  assert.match(src, /Tool dừng đúng ảnh đang làm, giữ nguyên các ảnh đã xong/, 'phải báo tiếp tục từ ảnh bị chặn');
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
