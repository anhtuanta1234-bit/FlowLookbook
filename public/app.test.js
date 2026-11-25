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

test('manifest đã có bản mới thì không gọi GitHub API', async () => {
  let apiCalls = 0;
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) { apiCalls++; throw new Error('Không được gọi API'); }
      return jsonResponse({ version: '1.1.31', url: 'https://github.com/new.exe', notes: 'mới' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.31');
  assert.equal(apiCalls, 0);
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
});

test('đổi raw URL thành đúng GitHub Releases API cùng repo', () => {
  const h = updateHelpers('', '1.1.29', async () => jsonResponse({}));
  assert.equal(
    h.latestReleaseApiUrl('https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json'),
    'https://api.github.com/repos/anhtuanta1234-bit/FlowLookbook/releases/latest',
  );
});
