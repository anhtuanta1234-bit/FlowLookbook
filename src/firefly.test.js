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
  assert.match(src, /finally \{[\s\S]*?await releaseTab\(key\)/, 'Tải xong atau lỗi đều đóng tab Firefly');
});

test('banner hết lượt không làm mất ảnh đã tạo: có nút Tải xuống thì tải tiếp', () => {
  assert.match(src, /async function downloadReady\(page\)[\s\S]*?isVisible\([\s\S]*?isEnabled/);
  assert.match(src, /if \(await downloadReady\(page\)\) return true; \/\/ Ảnh đã tạo xong/);
  assert.match(src, /detectQuotaBlock\(page\) && !\(await downloadReady\(page\)\)/, 'đợi tải: chỉ báo hết lượt khi không có nút tải');
  assert.match(src, /!\(await downloadReady\(p\)\) && await detectQuotaBlock\(p\)/, 'bấm tải: ảnh đã tạo thì không chặn');
});

test('hết lượt lúc tải thì giữ tab Firefly để đổi Gmail rồi tải lại, không tạo lại ảnh', () => {
  assert.match(src, /keepTabOnQuota = false/);
  assert.match(src, /keepTabOnQuota && e\?\.code === 'FIREFLY_QUOTA'\) quotaBlocked = true/);
  assert.match(src, /if \(!quotaBlocked\) await releaseTab\(key\)/, 'lỗi hết lượt lúc tải thì không đóng tab');
  assert.match(src, /function hasSceneTab\(projectId, sceneId\)[\s\S]*?tabs\.has/);
  assert.match(src, /e\?\.code === 'FIREFLY_QUOTA'\) await open\(\)/, 'hết lượt lúc tạo thì mở cửa sổ để đổi Gmail');
  assert.match(src, /prepareScene, downloadPrepared, discardScene, hasSceneTab/);
});

test('đọc trạng thái Firefly qua shadow DOM, không đếm sai nút bị ẩn', () => {
  assert.match(src, /el\.shadowRoot/, 'Phải đi qua shadowRoot của web component');
  assert.match(src, /const deepText =/, 'Phải gom text từ trong shadow DOM');
  assert.match(src, /hasEditorApp:/, 'Phải nhận diện editor thật, không phải khung điều hướng');
  assert.match(src, /Không tin cookie _pin_unauth/, 'Không được chặn nhầm sau khi đã đăng nhập');
  assert.match(src, /if \(!\(await waitForFireflyReady\(p\)\)\) throw loginError\(\)/, 'Chưa đăng nhập thì báo lỗi đăng nhập ngay');
  assert.match(src, /if \(state\.login\) return false;[\s\S]*hasEditorApp/, 'Editor chỉ sẵn sàng khi có công cụ xóa');
  assert.match(src, /throw loginError\(\);\n\}/, 'Editor không tải được thì báo đăng nhập rõ ràng');
});
