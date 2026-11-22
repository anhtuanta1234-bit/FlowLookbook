const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanVersion,
  sameVersion,
  validateInstallerUrl,
  shouldKeepPending,
  buildHelperScript,
} = require('./update-helpers');

test('cleanVersion bỏ v và khoảng trắng', () => {
  assert.equal(cleanVersion(' v1.1.17 '), '1.1.17');
  assert.equal(cleanVersion('1.1.17.0'), '1.1.17.0');
  assert.equal(cleanVersion(null), '');
});

test('sameVersion so sánh theo số, không phải chuỗi', () => {
  assert.ok(sameVersion('v1.1.17', '1.1.17.0'));
  assert.ok(sameVersion('1.1.17', '1.1.17'));
  assert.ok(!sameVersion('1.1.16', '1.1.17'));
});

test('validateInstallerUrl chỉ nhận HTTPS GitHub + đúng tên installer', () => {
  const ok = validateInstallerUrl('https://github.com/anhtuanta1234-bit/FlowLookbook/releases/download/v1.1.17/Flow.Lookbook.Setup.1.1.17.exe');
  assert.equal(ok.ok, true);
  assert.equal(ok.version, '1.1.17');
  assert.equal(ok.fileName, 'Flow.Lookbook.Setup.1.1.17.exe');

  assert.equal(validateInstallerUrl('http://github.com/x/Flow.Lookbook.Setup.1.1.17.exe').ok, false);
  assert.equal(validateInstallerUrl('https://evil.com/Flow.Lookbook.Setup.1.1.17.exe').ok, false);
  // new URL() tự chuẩn hoá '..' thường, nên dùng dạng encode để kiểm tra decodeURIComponent.
  assert.equal(validateInstallerUrl('https://github.com/x/%2E%2E%2FFlow.Lookbook.Setup.1.1.17.exe').ok, false);
  assert.equal(validateInstallerUrl('https://github.com/x/setup.exe').ok, false);
  assert.equal(validateInstallerUrl('not a url').ok, false);
});

test('validateInstallerUrl chặn username/password trong URL', () => {
  const r = validateInstallerUrl('https://user:pass@github.com/x/Flow.Lookbook.Setup.1.1.17.exe');
  assert.equal(r.ok, false);
});

test('shouldKeepPending giữ job khi mở app quá sớm', () => {
  assert.equal(shouldKeepPending('1.1.15', { fromVersion: '1.1.15' }), true);
  assert.equal(shouldKeepPending('v1.1.15.0', { fromVersion: '1.1.15' }), true);
  assert.equal(shouldKeepPending('1.1.16', { fromVersion: '1.1.15' }), false);
  assert.equal(shouldKeepPending('1.1.16', null), false);
});

test('buildHelperScript sinh script có lock/cancel/status, không hardcode tên app', () => {
  const ps = buildHelperScript();
  assert.ok(ps.startsWith('param([string]$Config)'));
  assert.ok(ps.includes('$Lock'), 'phải kiểm tra lock token');
  assert.ok(ps.includes('$Cancel'), 'phải hỗ trợ huỷ theo token');
  assert.ok(ps.includes('WriteStatus $false'), 'phải ghi trạng thái thất bại');
  assert.ok(ps.includes('WriteStatus $true'), 'phải ghi trạng thái thành công');
  assert.ok(ps.includes('Get-Process -Name $ProcessName'), 'không hardcode \'Flow Lookbook\'');
  assert.ok(!ps.includes('Start-Process -FilePath $AppExe'), 'không tự mở lại');
  assert.ok(!ps.includes('@\'') && !ps.includes("'@"), 'không bọc here-string');
});

test('runCleanup trả skipped=true khi version chưa tăng', () => {
  const { runCleanup } = require('./update-cleanup');
  const r = runCleanup({ fromVersion: '1.1.15' }, '1.1.15', () => {});
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'version not advanced');
  assert.deepEqual(r.deleted, []);
});
