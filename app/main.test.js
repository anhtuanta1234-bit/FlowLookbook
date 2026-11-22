const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Helper cập nhật từng bị ghi nhầm thành một here-string (@' ... '@) nên không chạy.
// Test này đảm bảo file .ps1 tạo ra là script thật, có đủ 3 bước: log, cài, mở lại.
test('helper tự cập nhật là script PowerShell chạy được', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const found = src.match(/const ps = `([\s\S]*?)`;/);
  assert.ok(found, 'không tìm thấy nội dung helper trong main.js');
  const ps = found[1];
  assert.ok(!ps.includes("@'") && !ps.includes("'@"), 'helper không được bọc trong here-string');
  assert.ok(ps.includes('Add-Content -LiteralPath $Log'), 'phải ghi log từng bước');
  assert.ok(ps.includes('Start-Process -FilePath $Installer'), 'phải chạy installer');
  assert.ok(!ps.includes('Start-Process -FilePath $AppExe'), 'không tự mở lại app — user mở bằng shortcut');
  assert.ok(ps.includes('user will relaunch manually'), 'phải ghi rõ chế độ mở lại thủ công');
  assert.ok(ps.includes('helper start token=$Token'), 'phải ghi token để xác nhận helper chạy');
});

test('helper được khởi qua Start-Process trung gian, không spawn detached', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(src.includes("Start-Process -FilePath 'powershell.exe'"), 'phải dùng Start-Process tách tiến trình');
  assert.ok(!src.includes('detached: true'), 'KHÔNG được spawn detached: PowerShell không chạy -File');
  assert.ok(src.includes('helper confirmed running'), 'phải đợi helper xác nhận trước khi tắt app');
  assert.ok(src.includes("'helper start token=' + token"), 'phải đối chiếu đúng token của lần này');
  assert.ok(src.includes("'-Config',"), 'phải truyền cấu hình qua file, không qua đối số');
  assert.ok(!src.includes("'-Installer',"), 'KHÔNG được đưa đường dẫn có dấu cách vào -ArgumentList');
});

test('một nút duy nhất: tải xong tự cập nhật, không còn nút tải lại', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const block = src.slice(src.indexOf('const file = await window.flowBridge.downloadUpdate'), src.indexOf('const file = await window.flowBridge.downloadUpdate') + 500);
  assert.ok(block.includes('Đang cập nhật'), 'tải xong phải hiện “Đang cập nhật…”');
  assert.ok(block.includes('installUpdate(file, info.version)'), 'tải xong phải tự gọi cài, không cần bấm tiếp');
  assert.ok(!src.includes('showReloadRequired'), 'không được giữ nút “Tải lại để cập nhật”');
  assert.ok(!src.includes('Tải lại để cập nhật'), 'không được giữ nút “Tải lại để cập nhật”');
  assert.ok(!block.includes('window.open('), 'không mở file installer bằng Windows');
});

test('preload mở đúng các hàm cập nhật, đếm ngược và đọc marker thành công', () => {
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  assert.ok(preload.includes('installUpdate: (file, version)'), 'installUpdate phải nhận tên phiên bản');
  assert.ok(preload.includes('consumeUpdateSuccess: ()'), 'phải có hàm đọc marker sau khi cài');
  assert.ok(preload.includes('quitForUpdate: ()'), 'phải có hàm đóng app sau khi đếm ngược');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes("ipcMain.handle('flow:consume-update-success'"), 'main phải xử lý marker');
  assert.ok(main.includes('fs.rmSync(UPDATE_SUCCESS'), 'marker phải bị xoá sau khi đọc');
  assert.ok(main.includes("ipcMain.handle('flow:quit-for-update'"), 'main phải xử lý lệnh đóng app');
});

test('thông báo thành công chỉ hiện khi đúng phiên bản đang chạy', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(src.includes("compareVer(done, CURRENT_VERSION) === 0"), 'phải so phiên bản marker với phiên bản thật');
  assert.ok(src.includes('Cập nhật phiên bản v'), 'phải hiện tên phiên bản trong thông báo');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes("if (version && version !== app.getVersion()) return ''"), 'marker phải giữ lại nếu mở app quá sớm');
});

test('sau khi khởi cài: hiện đếm ngược 3 giây rồi mới đóng app', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const block = ui.slice(ui.indexOf('let n = 3;'), ui.indexOf('let n = 3;') + 700);
  assert.ok(block.includes('Đóng sau ${n}s'), 'phải hiện “Đóng sau 3s/2s/1s”');
  assert.ok(block.includes('quitForUpdate'), 'hết 3 giây mới gọi lệnh đóng app');
  assert.ok(block.includes('Mở lại app bằng shortcut'), 'phải hướng dẫn mở lại bằng shortcut');
  assert.ok(block.includes('v${esc(info.version)}'), 'phải hiện đúng tên phiên bản đích');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(!main.includes('shell.openPath(file)'), 'KHÔNG được để Windows hiện hộp thoại Chọn ứng dụng để mở');
});

test('helper không xác nhận thì báo lỗi, không tắt app và xoá marker', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const block = main.slice(main.indexOf('await new Promise((resolve, reject)'), main.indexOf("ipcMain.handle('flow:quit-for-update'"));
  assert.ok(block.includes('reject(new Error('), 'phải báo lỗi khi helper không chạy');
  assert.ok(block.includes('rmSync(PENDING_CLEANUP'), 'phải xoá marker dọn khi hủy');
  assert.ok(block.includes('rmSync(UPDATE_SUCCESS'), 'phải xoá marker thành công khi hủy');
});
