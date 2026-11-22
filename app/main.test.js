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
});

test('luồng cập nhật mới: tải xong không cài ngay, có nút tải lại bắt buộc', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const block = src.slice(src.indexOf('const file = await window.flowBridge.downloadUpdate'), src.indexOf('const file = await window.flowBridge.downloadUpdate') + 400);
  assert.ok(block.includes('showReloadRequired(file)'), 'sau khi tải phải hiện nút tải lại');
  const beforeReload = block.slice(0, block.indexOf('showReloadRequired(file)'));
  assert.ok(!beforeReload.includes('installUpdate('), 'không được cài/đóng app ngay lúc tải xong');
  assert.ok(src.includes('Tải lại để cập nhật'), 'phải có nút tải lại bắt buộc');
});

test('preload mở đúng 2 hàm cài có tên phiên bản và đọc marker thành công', () => {
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  assert.ok(preload.includes('installUpdate: (file, version)'), 'installUpdate phải nhận tên phiên bản');
  assert.ok(preload.includes('consumeUpdateSuccess: ()'), 'phải có hàm đọc marker sau khi cài');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes("ipcMain.handle('flow:consume-update-success'"), 'main phải xử lý marker');
  assert.ok(main.includes('fs.rmSync(UPDATE_SUCCESS'), 'marker phải bị xoá sau khi đọc');
});

test('thông báo thành công chỉ hiện khi đúng phiên bản đang chạy', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(src.includes("compareVer(done, CURRENT_VERSION) === 0"), 'phải so phiên bản marker với phiên bản thật');
  assert.ok(src.includes('Cập nhật phiên bản v'), 'phải hiện tên phiên bản trong thông báo');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes("if (version && version !== app.getVersion()) return ''"), 'marker phải giữ lại nếu mở app quá sớm');
});

test('đếm ngược 3 giây trước khi cài, không dùng shell.openPath', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(ui.includes('tick(3)') && ui.includes('Tắt app sau'), 'phải có đếm ngược 3 giây');
  assert.ok(ui.includes('mở lại app bằng shortcut'), 'phải hướng dẫn mở lại bằng shortcut');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(!main.includes('shell.openPath(file)'), 'KHÔNG được để Windows hiện hộp thoại Chọn ứng dụng để mở');
});
