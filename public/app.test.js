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
