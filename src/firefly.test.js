const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _test } = require('./firefly');

const src = fs.readFileSync(path.join(__dirname, 'firefly.js'), 'utf8');

test('vùng xóa logo luôn nằm trọn trong khung ảnh', () => {
  const m = _test.normalizeMask({ xPct: -20, yPct: 120, wPct: 500, hPct: -9 });
  assert.equal(m.xPct, 0);
  assert.equal(m.yPct, 99);
  assert.ok(m.wPct > 0 && m.xPct + m.wPct <= 100);
  assert.ok(m.hPct > 0 && m.yPct + m.hPct <= 100);
});

test('mask mặc định đúng vùng logo ảnh mẫu 768x1376', () => {
  assert.deepEqual(_test.normalizeMask(undefined), { xPct: 84.375, yPct: 91.352, wPct: 6.12, hPct: 3.343 });
  assert.match(_test.fireflyHome(), /^https:\/\/firefly\.adobe\.com(?:\/|$)/);
});

test('nhận diện đúng thông báo hết lượt, không nhầm nút "Lượt tạo miễn phí theo ngày"', () => {
  assert.equal(_test.isQuotaText('Bạn đã sử dụng hết lượt tạo miễn phí theo ngày.'), true);
  assert.equal(_test.isQuotaText('Out of generative credits'), true);
  assert.equal(_test.isQuotaText('Lượt tạo miễn phí theo ngày'), false);
  assert.equal(_test.isQuotaText('Chấm sửa và xóa'), false);
});

test('đường dẫn editor luôn nằm trên firefly.adobe.com', () => {
  assert.equal(_test.editorUrl(), 'https://firefly.adobe.com/image-editor');
});

test('Firefly dùng web component, chờ ổn định và đóng tab khi lỗi/xong', () => {
  assert.match(src, /sp-menu-item\[href="\/image-editor"\]/, 'Phải nhận diện menu item thật của Firefly');
  assert.match(src, /await waitForFireflyReady\(p\)/, 'Phải đợi tài khoản ổn định trước khi bấm menu');
  assert.match(src, /await waitForEditorReady\(p\)/, 'Phải đợi trình chỉnh sửa sẵn sàng');
  assert.match(src, /await clickEnabledAny\(/, 'Chỉ bấm nút đang active');
  assert.match(src, /await input\.setInputFiles\(imagePath\)/, 'Upload thẳng vào input file ẩn');
  assert.match(src, /applyBrush\(p, cfg\.get\(\)\.logoRemoveMask, imagePath\)/, 'Tô mask theo đúng khung ảnh nguồn');
  assert.match(src, /catch \(e\) \{[\s\S]*?await releaseTab\(key\)/, 'Lỗi prepare phải đóng tab Firefly');
  assert.match(src, /finally \{[\s\S]*?await releaseTab\(key\)/, 'Tải xong hoặc lỗi đều đóng tab Firefly');
});
