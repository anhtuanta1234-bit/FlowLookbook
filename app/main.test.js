const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildHelperScript } = require('./update-helpers');

// Helper cập nhật từng bị ghi nhầm thành here-string (@' ... '@) nên không chạy.
// Giờ script được sinh bởi buildHelperScript() — test chạy thật hàm đó, không bóc chuỗi trong main.js.
test('helper tự cập nhật là script PowerShell chạy được', () => {
  const ps = buildHelperScript();
  assert.ok(!ps.includes("@'") && !ps.includes("'@"), 'helper không được bọc trong here-string');
  assert.ok(ps.includes('Add-Content -LiteralPath $Log'), 'phải ghi log từng bước');
  assert.ok(ps.includes('Start-Process -FilePath $Installer'), 'phải chạy installer');
  assert.ok(!ps.includes('Start-Process -FilePath $AppExe'), 'không tự mở lại app — user mở bằng shortcut');
  assert.ok(ps.includes('user will relaunch manually'), 'phải ghi rõ chế độ mở lại thủ công');
  assert.ok(ps.includes('helper start token=$Token'), 'phải ghi token để xác nhận helper chạy');
  assert.ok(ps.includes('WriteStatus $false'), 'phải ghi trạng thái thất bại kèm exit code');
  assert.ok(ps.includes('Get-Process -Name $ProcessName'), 'không được hardcode tên process');
});

test('helper được khởi qua Start-Process trung gian, không spawn detached', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(src.includes("Start-Process -FilePath 'powershell.exe'"), 'phải dùng Start-Process tách tiến trình');
  assert.ok(!src.includes('detached: true'), 'KHÔNG được spawn detached: PowerShell không chạy -File');
  assert.ok(src.includes('helper confirmed running'), 'phải đợi helper xác nhận trước khi tắt app');
  assert.ok(src.includes("stripBom(fs.readFileSync(UPDATE_READY, 'utf8')).trim() === token"),
    'phải đối chiếu đúng token của lần này qua file ready, bỏ BOM');
  assert.ok(src.includes('stripBom'), 'phải chịu file UTF-8 có BOM do PowerShell 5.1 ghi');
  assert.ok(src.includes("'-Config',"), 'phải truyền cấu hình qua file, không qua đối số');
  assert.ok(!src.includes("'-Installer',"), 'KHÔNG được đưa đường dẫn có dấu cách vào -ArgumentList');
});

test('một nút duy nhất: tải xong tự cập nhật, không còn nút tải lại', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = src.indexOf('window.flowBridge.downloadUpdate');
  assert.ok(start >= 0, 'phải có lượt tải installer');
  const block = src.slice(start, start + 2000);
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
  assert.ok(main.includes("if (version && !sameVersion(version, app.getVersion())) return ''"), 'marker phải so bằng số phiên bản, giữ lại nếu mở app quá sớm');
});

test('sau khi khởi cài: hiện đếm ngược 3 giây rồi mới đóng app', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const block = ui.slice(ui.indexOf('let n = 3;'), ui.indexOf('let n = 3;') + 700);
  assert.ok(block.includes('Đóng sau ${n}s'), 'phải hiện “Đóng sau 3s/2s/1s”');
  assert.ok(block.includes('quitForUpdate'), 'hết 3 giây mới gọi lệnh đóng app');
  assert.ok(block.includes('Mở lại app bằng shortcut'), 'phải hướng dẫn mở lại bằng shortcut');
  assert.ok(block.includes('Mở lại sau 10–20 giây; nếu chưa thấy bản mới, mở lại lần nữa.'), 'phải có dòng nhỏ báo mở lại sau 10–20s');
  assert.ok(block.includes('font-size:11px'), 'dòng báo mở lại phải nhỏ');
  assert.ok(block.includes('v${esc(info.version)}'), 'phải hiện đúng tên phiên bản đích');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(!main.includes('shell.openPath(file)'), 'KHÔNG được để Windows hiện hộp thoại Chọn ứng dụng để mở');
});

test('cài đặt: phiên bản và nút kiểm tra phiên bản mới nằm ngay trên cùng', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = ui.indexOf('<h3>Cài đặt</h3>');
  const outLabel = ui.indexOf('Thư mục lưu ảnh 2K', start);
  const top = ui.slice(start, outLabel);
  assert.ok(top.includes('Phiên bản hiện tại'), 'phải hiện phiên bản ở đầu hộp Cài đặt');
  assert.ok(top.includes('Kiểm tra phiên bản mới'), 'nút đổi tên phải nằm ở đầu hộp Cài đặt');
  assert.ok(top.includes('btn outline sm'), 'nút phải có viền ngoài kiểu outline');
  assert.ok(!ui.includes('>Kiểm tra cập nhật<'), 'không được giữ tên nút cũ');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  assert.ok(css.includes('.btn.outline{border:1px solid var(--accent)'), 'CSS phải định nghĩa viền xanh cho nút');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('Cài đặt → Kiểm tra phiên bản mới'), 'tooltip phải theo tên mới');
});

test('helper không xác nhận thì báo lỗi, ghi file huỷ và rollback marker', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const block = main.slice(main.indexOf('const cancelAndRollback'), main.indexOf("ipcMain.handle('flow:quit-for-update'"));
  assert.ok(block.includes('UPDATE_CANCEL'), 'phải ghi token huỷ để helper đang chạy cũng dừng');
  assert.ok(block.includes('clearUpdateMarkers()'), 'phải rollback cả marker dọn lẫn marker thành công');
  assert.ok(block.includes('wrapper.kill()'), 'phải dừng PowerShell trung gian');
  assert.ok(block.includes('reject(new Error('), 'phải báo lỗi khi helper không chạy');
  assert.ok(main.includes('Date.now() - startedAt > 15000'), 'timeout phải đủ 15s cho AV/PS cold start');
});

test('mở app quá sớm thì giữ job dọn, không xoá pending-cleanup', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes('shouldKeepPending(app.getVersion(), job)'), 'phải dùng helper quyết định giữ job');
  assert.ok(!main.includes('fs.rmSync(PENDING_CLEANUP, { force: true }); } catch (_) {}\n  try { runCleanup'),
    'không được xoá marker trước khi runCleanup kiểm tra version');
});

test('helper báo lỗi installer thì báo lại cho user ở lần mở sau', () => {
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(preload.includes('consumeUpdateError'), 'preload phải mở hàm đọc lỗi cài đặt');
  assert.ok(main.includes("ipcMain.handle('flow:consume-update-error'"), 'main phải có IPC báo lỗi');
  assert.ok(main.includes('status.ok === false'), 'chỉ báo lỗi khi helper xác nhận thất bại');
  assert.ok(main.includes('LAST_UPDATE_ERROR'), 'phải giữ lỗi lại cho giao diện đọc');
});

test('tải/cài installer KHÔNG hiện thông báo timeout — chỉ báo lỗi thật', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(!ui.includes('withActivityTimeout'), 'không được có timeout theo tiến độ');
  assert.ok(!ui.includes('withTimeout('), 'không được có timeout cố định cho tải/cài');
  assert.ok(!ui.includes('quá 30 giây'), 'không được hiện câu báo quá 30s');
  assert.ok(!ui.includes('không có tiến độ'), 'không được hiện câu báo không có tiến độ');
  assert.ok(!ui.includes('quá 10 phút'), 'không được hiện câu báo quá 10 phút');
  assert.ok(ui.includes('await window.flowBridge.downloadUpdate(info.url)'), 'phải chờ tải đến khi Electron trả kết quả');
  assert.ok(ui.includes('await window.flowBridge.installUpdate(file, info.version)'), 'phải chờ cài đến khi Electron trả kết quả');
  assert.ok(ui.includes("btn.textContent = pct >= 0 ? `Đang tải… ${pct}%`"), 'phải giữ thông báo tiến độ trong lúc tải');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('/style.css?v=20261127-firefly-ui-18'), 'phải bump cache-buster CSS khi gọn banner Firefly');
  assert.ok(html.includes('/app.js?v=20261127-firefly-ui-18'), 'phải bump cache-buster JS cùng bản CSS mới');
});

test('xác nhận helper bằng file ready, không tin câu log ghi trước khi kiểm tra lock', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes('UPDATE_READY'), 'phải có file ready');
  assert.ok(main.includes("stripBom(fs.readFileSync(UPDATE_READY, 'utf8')).trim() === token"),
    'phải so token trong file ready, bỏ BOM');
  assert.ok(!main.includes("includes('helper start token=' + token)"), 'không được soi câu log cũ');
  assert.ok(main.includes('st && st.ok === false'), 'helper báo lỗi sớm thì rollback ngay, không đóng app');
  assert.ok(main.includes('cancelled stale helper'), 'lúc mở app phải huỷ helper còn sót của phiên trước');
  assert.ok(main.includes('targetAdvanced && !installConfirmed'),
    'phải phát hiện trường hợp báo thành công nhưng version không tăng');
});

test('file installer đã tải trọn vẹn thì tận dụng, không tải lại 118 MB', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(main.includes('reuseExistingInstaller'), 'phải có hàm tận dụng file cũ');
  assert.ok(main.includes('content-length'), 'phải so kích thước với server trước khi tin file cũ');
  assert.ok(main.includes('.complete'), 'file tải mới phải ghi marker để lần sau khỏi HEAD');
  assert.ok(main.includes('activeDownload'), 'phải chặn 2 lượt tải cùng lúc khi bấm Thử lại');
});
