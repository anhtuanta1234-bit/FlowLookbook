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
  assert.ok(ps.includes('Start-Process -FilePath $AppExe'), 'phải mở lại app');
});
