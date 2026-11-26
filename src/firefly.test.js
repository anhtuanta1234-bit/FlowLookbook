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
  assert.deepEqual(_test.normalizeMask(undefined), { xPct: 89.94, yPct: 94.329, wPct: 6.12, hPct: 3.343 });
  assert.match(_test.fireflyHome(), /^https:\/\/firefly\.adobe\.com(?:\/|$)/);
});

test('nhận diện đúng thông báo hết lượt, không nhầm nút "Lượt tạo miễn phí theo ngày"', () => {
  assert.equal(_test.isQuotaText('Bạn đã sử dụng hết lượt tạo miễn phí theo ngày.'), true);
  assert.equal(_test.isQuotaText('Out of generative credits'), true);
  assert.equal(_test.isQuotaText('Lượt tạo miễn phí theo ngày'), false);
  assert.equal(_test.isQuotaText('Chấm sửa và xóa'), false);
});

test('màn hình nâng cấp trả phí cũng là hết lượt free, báo đổi mail khác', () => {
  assert.equal(_test.isQuotaText('Nâng cấp lên gói trả phí để tiếp tục.'), true);
  assert.equal(_test.isQuotaText('Upgrade to a paid plan to continue generating.'), true);
  assert.equal(_test.isQuotaText('Mua thêm lượt tạo sinh'), true);
  assert.equal(_test.isQuotaText('Bạn có 10 lượt tạo miễn phí theo ngày'), false);
  assert.equal(_test.isQuotaText('Hôm nay còn 0 lượt tạo'), true, 'Firefly hiện báo số lượt còn lại bằng câu này');
  assert.equal(_test.isQuotaText('Bạn đã dùng hết số lượt tạo miễn phí hằng ngày.'), true);
  assert.match(src, /Firefly đang dùng lượt free hàng ngày và đã hết\. Vui lòng đổi mail khác/);
});

test('chỉ coi banner hết lượt là có thật khi nó visible, không đếm tooltip ẩn trong shadow DOM', () => {
  assert.match(src, /function stateHasQuota\(state\) \{[\s\S]*?return isQuotaText\(state\?\.body\);/, 'chỉ tin body, không tin deepText/uiText');
  assert.ok(!/isQuotaText\(state\?\.deepText\)/.test(src), 'không đọc text ẩn');
  assert.ok(!/isQuotaText\(state\?\.uiText\)/.test(src), 'không đọc text ẩn');
  assert.match(src, /const count = Math\.min\(await loc\.count\(\)\.catch\(\(\) => 0\), 12\)/);
  assert.match(src, /loc\.nth\(i\)\.isVisible\(\)/, 'kiểm tra từng kết quả có thật sự hiện không');
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
  assert.match(src, /applyBrush\(p, cfg\.get\(\)\.logoRemoveMask, imagePath, cfg\.get\(\)\.logoBrushSize, ratio916\)/, 'Chấm mask theo khung 9:16 với cỡ cọ đã cấu hình');
  assert.match(src, /catch \(e\) \{[\s\S]*?await releaseTab\(key\)/, 'Lỗi prepare phải đóng tab Firefly');
  assert.match(src, /finally \{[\s\S]*?await releaseTab\(key\)/, 'Tải xong atau lỗi đều đóng tab Firefly');
});

test('nhận diện màn hình chọn ảnh Firefly mới: nút "Tải lên", không chỉ "Tải ảnh lên"', () => {
  assert.match(src, /uploadBtn:[\s\S]{0,260}Tải lên/);
  assert.match(src, /uploadBtnText:/);
  assert.match(src, /hasEditorApp:[\s\S]{0,320}Tải lên/);
  assert.match(src, /\[L\.uploadBtn, L\.uploadBtnText\]/, 'phải bấm được cả nút dạng text trong shadow DOM');
  assert.match(src, /input file=\$\{!!st\.hasUpload\}/, 'lỗi upload phải kèm trạng thái để dễ tra cứu');
});

test('banner hết lượt không làm mất ảnh đã tạo: có nút Tải xuống thì tải tiếp', () => {
  assert.match(src, /async function downloadReady\(page\)[\s\S]*?isVisible\([\s\S]*?isEnabled/);
  assert.match(src, /if \(await downloadReady\(page\)\) return true; \/\/ Ảnh đã tạo xong/);
  assert.match(src, /detectQuotaBlock\(page, state\) && !\(await downloadReady\(page\)\)/, 'đợi tải: chỉ báo hết lượt khi không có nút tải');
  assert.match(src, /!\(await downloadReady\(p\)\) && await detectQuotaBlock\(p\)/, 'bấm tải: ảnh đã tạo thì không chặn');
});

test('lỗi / hết lượt / tạm dừng thì đóng ngay tab Firefly để nhẹ RAM', () => {
  assert.match(src, /require\('\.\/chrome-firefly'\)/, 'Firefly phải dùng Chrome riêng, không chung profile với Flow');
  assert.ok(!src.includes('keepTabOnQuota'), 'không còn giữ tab khi Firefly chặn tải');
  assert.match(src, /async function closeIfIdle\(\)[\s\S]*?if \(tabs\.size \|\| loginKeepAlive\) return;[\s\S]*?await chrome\.close\(\)/);
  assert.match(src, /async function releaseTab\(key\)[\s\S]*?await closeIfIdle\(\)/, 'xong / lỗi thì đóng tab và process Chrome nếu hết việc');
  assert.match(src, /async function downloadPrepared\([\s\S]*?finally \{\s*await releaseTab\(key\);\s*\}/, 'tải lỗi cũng đóng tab ngay');
  assert.ok(!src.includes('quotaBlocked'), 'không giữ cửa sổ Firefly chờ đổi Gmail');
  assert.match(src, /e\?\.code === 'FIREFLY_QUOTA'\) await open\(\)/, 'hết lượt lúc tạo vẫn mở cửa sổ để đổi Gmail');
  assert.match(src, /closeProjectTabs, closeAll/, 'tắt tool phải đóng luôn Chrome Firefly');
});

test('canvas mask dù bị thu nhỏ vẫn được chọn, không chấm nhầm canvas nền', () => {
  assert.match(src, /if \(isMask \? \(box\.width < 10 \|\| box\.height < 10\)/, 'không loại canvas mask vì nhỏ hơn 60/100px');
  assert.match(src, /score = isMask \? -Infinity : Math\.abs/, 'mask-canvas được ưu tiên tuyệt đối');
  assert.ok(!src.includes('box.width < 60'), 'ngưỡng cũ loại canvas mask khi cửa sổ nhỏ đã bỏ');
});

test('chấm cọ thử lại khi Firefly chưa nhận nét, mỗi lần lấy box canvas mới', () => {
  assert.match(src, /const boxBefore = \(await waitForMaskCanvas\(page\)\)\.box/);
  assert.match(src, /const brush = await setBrushSize\(page, brushSize\);[\s\S]*?const boxAfter = \(await waitForMaskCanvas\(page\)\)\.box/, 'đóng hộp cọ xong phải lấy box mới');
  assert.match(src, /for \(; attempts < 3 && !ready; attempts\+\+\)/, 'nút Xóa chưa bật thì chấm lại tối đa 3 lần');
  assert.match(src, /box = \(await waitForMaskCanvas\(page\)\)\.box;[\s\S]*?cx = box\.x \+ rel\.x \* box\.width/, 'mỗi lần thử tính lại tọa độ theo box hiện tại');
  assert.match(src, /if \(!ready\) throw new Error\('Firefly không nhận nét chấm/);
});

test('ô chiếu trực tiếp chụp đúng canvas 9:16, nét, mượt và không hiện giao diện đầu', () => {
  assert.match(src, /findCanvas\(page, \{ prefer9x16: true \}\)\)\.box/, 'chụp đúng vùng ảnh, không chụp cả trang Firefly');
  assert.match(src, /if \(!box\) return \{ ok: false \}/, 'chưa có canvas thì không chiếu trang chủ Firefly');
  assert.ok(!/x: 0, y: 0,\s*width: Math\.max\(320/.test(src), 'không còn dự phòng chụp cả viewport');
  assert.match(src, /scale: 2, \/\/ 2x device pixel/);
  assert.match(src, /format: 'jpeg', quality: 90/);
  assert.match(src, /optimizeForSpeed: true/, 'chụp nhanh để ô chiếu không delay');
  assert.match(src, /now - previewCache\.at < 250/, 'cache ngắn để poll nhanh nhưng vẫn cập nhật');
  assert.match(src, /if \(!tab\.cdp\) tab\.cdp = await withTimeout\(page\.context\(\)\.newCDPSession\(page\), 1500\)/, 'dùng lại session CDP, không tạo lại mỗi lần chụp');
  assert.match(src, /await detachPreview\(t\); await t\.page\.close\(\)/, 'đóng tab thì huỷ session chụp');
  assert.ok(!src.includes("quality: 45"), 'không chụp ảnh mờ quality 45');
});

test('đọc trạng thái Firefly qua shadow DOM, không đếm sai nút bị ẩn', () => {
  assert.match(src, /el\.shadowRoot/, 'Phải đi qua shadowRoot của web component');
  assert.match(src, /const deepText =/, 'Phải gom text từ trong shadow DOM');
  assert.match(src, /hasEditorApp:/, 'Phải nhận diện editor thật, không phải khung điều hướng');
  assert.match(src, /Không tin cookie _pin_unauth/, 'Không được chặn nhầm sau khi đã đăng nhập');
  assert.match(src, /if \(!\(await waitForFireflyReady\(p\)\)\) throw loginError\(\)/, 'Chưa đăng nhập thì báo lỗi đăng nhập ngay');
  assert.match(src, /if \(state\.login\) return false;[\s\S]*hasEditorApp/, 'Editor chỉ sẵn sàng khi có công cụ xóa');
  assert.match(src, /if \(!ready\) throw loginError\(\);/, 'Editor không tải được thì báo đăng nhập rõ ràng');
  assert.ok(src.includes('depth > 26'), 'Editor nằm sâu hơn 10 lớp shadow root: không được dừng sớm');
  assert.ok(src.includes("await p.goto(editorUrl(), { waitUntil: 'domcontentloaded', timeout: 45000 })"), 'Vào thẳng editor, không lệ thuộc role của menu');
});

test('chọn khung hình chuẩn 9:16 trước khi chấm vùng logo', () => {
  assert.ok(src.includes('async function selectAspect916(page)'));
  assert.ok(src.includes('sp-menu-item[value="9:16"]'), 'Preset 9:16 nằm trong picker "Thêm" của Firefly');
  assert.ok(src.includes("getByRole('combobox', { name: /^Thêm$|More/i })"), 'Phải mở picker "Thêm" trước khi chọn 9:16');
  assert.ok(src.includes("getByRole('button', { name: /^Cắt$/i })"), 'Chọn xong phải bấm "Cắt" để áp dụng khung');
  assert.ok(src.includes('const ratio916 = await selectAspect916(p)'), 'Phải chọn khung ngay sau khi upload, trước khi chấm mask');
  assert.match(src, /const ratio916 = await selectAspect916\(p\)[\s\S]*?applyBrush\(p, cfg\.get\(\)\.logoRemoveMask, imagePath, cfg\.get\(\)\.logoBrushSize, ratio916\)/);
  assert.match(src, /waitClickable\(page, \[L\.ratioPicker, L\.moreRatio\]/, 'Chờ picker thật active thay vì sleep cố định');
  assert.match(src, /dismissFireflyDialogs\(page, 1500\)/, 'Chờ hộp Xác nhận cắt theo điều kiện, không ngủ 1500ms rồi mới bấm');
});

test('báo rõ từng thao tác Firefly trên Bước 4, có xác nhận cắt và chờ thông báo hoàn tất', () => {
  assert.ok(src.includes("name: /^Xác nhận cắt$/i"), 'Giao diện hiện có hộp xác nhận sau khi bấm Cắt');
  assert.ok(src.includes('await dismissFireflyDialogs(p)'), 'Phải đóng hộp chắn trước khi chấm cọ');
  assert.ok(src.includes('await waitForRemovalComplete(p)'), 'Chờ Firefly báo xong mới cho tải');
  assert.ok(src.includes('Đang cắt ảnh về khung chuẩn 9:16…'));
  assert.ok(src.includes('Đang bấm công cụ Chấm sửa và xóa…'));
  assert.ok(src.includes('Đang mở Cài đặt cọ, chọn cỡ ${cfg.get().logoBrushSize}…'));
  assert.ok(src.includes('Đang chấm vào đúng vùng logo trên ảnh 9:16…'));
  assert.ok(src.includes('Đang bấm Xóa để Firefly xóa logo…'));
  assert.ok(src.includes('Chờ bạn bấm “Ổn” để tải xuống'));
  assert.ok(src.includes('Đang bấm nút Tải xuống trên Firefly…'), 'Sau khi bấm Ổn thì tool bấm Tải xuống');
});

test('chọn cỡ cọ thật trong hộp Cài đặt cọ vẽ, rồi chấm đúng 1 lần vào canvas mask', () => {
  assert.ok(src.includes("#gen-remove-brush-settings-trigger"), 'Phải mở nút Cài đặt cọ vẽ thật của Firefly');
  assert.ok(src.includes('sp-slider[label="Kích thước cọ"]'), 'Slider thật nằm trong web component sp-slider');
  assert.match(src, /await range\.focus\(\);[\s\S]*?page\.keyboard\.press\('Home'\)[\s\S]*?ArrowRight/, 'Phải tăng cỡ cọ bằng bàn phím như người thật, không gán .value');
  assert.match(src, /await page\.keyboard\.press\('Escape'\)/, 'Đóng hộp cài đặt cọ trước khi chấm');

  assert.match(src, /async function findCanvas\(page, \{ prefer9x16 = false \} = \{\}\)/);
  assert.ok(src.includes('/mask-canvas/i.test(cls)'), 'Chọn canvas mask 9:16, không chọn canvas nền to hơn');
  assert.match(src, /await waitForMaskCanvas\(page\)\)\.box/, 'Chấm trên canvas mask thật');
  assert.match(src, /await page\.mouse\.move\(cx, cy\);[\s\S]*?await page\.mouse\.down\(\);[\s\S]*?await page\.mouse\.up\(\);/, 'Chấm tại tâm logo (có thử lại nếu Firefly chưa nhận)');
  assert.ok(!src.includes('strokes.push'), 'Không quét nhiều nét làm sai thao tác người dùng');
  assert.match(src, /cfg\.get\(\)\.logoBrushSize/, 'Cỡ cọ lấy từ cài đặt, mặc định 14');
});

test('chờ đúng câu Firefly báo hoàn tất tạo sinh trước khi tải', () => {
  assert.equal(_test.isRemovalDone('Đã hoàn tất thao tác tạo sinh'), true);
  assert.equal(_test.isRemovalDone('Hoàn tất thao tác tạo sinh'), true);
  assert.equal(_test.isRemovalDone('Lượt tạo miễn phí theo ngày'), false);
  assert.equal(_test.isRemovalDone('Bạn đã tải xuống xong'), false);
  assert.match(src, /async function waitForRemovalComplete\(page, timeoutMs = 180000\)/);
  assert.match(src, /if \(await removalComplete\(page, state\)\) return true; \/\/ Firefly đã báo xong mới được phép tải\./);
});

test('canvas mask 2K rộng ~199px vẫn được chọn, kể cả khi thu nhỏ còn ~50px', () => {
  assert.match(src, /isMask \? \(box\.width < 10 \|\| box\.height < 10\) : \(box\.width < 200 \|\| box\.height < 200\)/);
  assert.match(src, /score = isMask \? -Infinity : Math\.abs\(box\.width \/ box\.height - 9 \/ 16\)/);
});

test('mỗi ảnh mở một tab Firefly mới và đóng tab khi ảnh xong', () => {
  assert.match(src, /async function getTab\(key\)[\s\S]*?chrome\.newBackgroundPage\(\)/, 'mỗi project:scene có tab riêng');
  assert.match(src, /await page\.goto\(editorUrl\(\), \{ waitUntil: 'domcontentloaded' \}\)/, 'tab mới vào thẳng editor, không tải trang chủ rồi tải lại');
  assert.match(src, /async function releaseTab\(key\)[\s\S]*?t\.page\.close\(\)/, 'xong/lỗi thì đóng tab, ảnh kế mở tab mới');
});

test('tăng tốc bằng chờ theo điều kiện thật, không sleep cố định dài', () => {
  assert.match(src, /const UI_TICK_MS = 150/);
  assert.match(src, /async function waitUntil\(check, timeoutMs, label, tickMs = UI_TICK_MS\)/);
  assert.match(src, /async function waitClickable\(page, locators,/);
  assert.match(src, /async function dismissFireflyDialogs\(page, graceMs = 400\)/);
  assert.ok(!/await sleep\((?:600|800|900|1000|1200|1500)\)/.test(src), 'Không được ngủ cố định các mốc cũ');
  assert.match(src, /const remain = minWaitMs - \(Date\.now\(\) - start\);[\s\S]*?return true;\n\}/, 'Editor không cộng thêm 5s sau khi đã chờ lúc mở tab');
  assert.match(src, /await waitClickable\(page, \[L\.removeBtn, L\.removeBtnText\], \{ timeout: 2500/, 'Chờ cọ được Firefly ghi nhận thay vì sleep 900ms');
  assert.match(src, /await sleep\(400\);\n  \}\n  throw new Error\('Firefly chưa báo/);
});

