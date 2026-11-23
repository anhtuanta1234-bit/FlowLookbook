const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

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
