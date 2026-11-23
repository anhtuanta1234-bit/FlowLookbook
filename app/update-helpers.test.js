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
  // GitHub redirect sang release-assets.* — host này phải nằm trong whitelist.
  assert.equal(validateInstallerUrl('https://release-assets.githubusercontent.com/x/Flow.Lookbook.Setup.1.1.18.exe').ok, true);
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
  assert.ok(ps.includes('$Ready'), 'phải có file ready làm tín hiệu xác nhận');
  assert.ok(ps.includes('Get-Token'), 'phải đọc được lock dạng JSON lẫn chuỗi thường');
  assert.ok(ps.includes('Write-Text'), 'phải ghi file không có BOM');
  assert.ok(!ps.includes('Set-Content -LiteralPath $Status'), 'không được ghi status bằng Set-Content UTF8 (có BOM)');
  assert.ok(!ps.includes('Set-Content -LiteralPath $Ready'), 'không được ghi ready bằng Set-Content UTF8 (có BOM)');
  assert.ok(ps.includes('WriteStatus $false'), 'phải ghi trạng thái thất bại');
  assert.ok(ps.includes('WriteStatus $true'), 'phải ghi trạng thái thành công');
  assert.ok(ps.includes('Get-Process -Name $ProcessName'), 'không hardcode \'Flow Lookbook\'');
  assert.ok(!ps.includes('Start-Process -FilePath $AppExe'), 'không tự mở lại');
  assert.ok(!ps.includes('@\'') && !ps.includes("'@"), 'không bọc here-string');
});

// Chạy THẬT script PowerShell do buildHelperScript() sinh ra, với đúng định dạng lock
// mà app ghi (JSON {"token":...}). Đây là lỗi làm mọi bản từ 1.1.17 không cài được.
function runRealHelper(overrides = {}) {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawn } = require('node:child_process');
  const dir = path.join(os.tmpdir(), 'flow real helper ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'helper.ps1');
  const config = path.join(dir, 'params.json');
  const log = path.join(dir, 'update.log');
  const lock = path.join(dir, 'lock.json');
  const cancel = path.join(dir, 'cancel.json');
  const status = path.join(dir, 'status.json');
  const ready = path.join(dir, 'ready.json');
  const installer = path.join(dir, 'Flow Lookbook Setup 9.9.9.exe');
  const token = Date.now() + '-token';
  fs.copyFileSync(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'attrib.exe'), installer);
  fs.writeFileSync(script, buildHelperScript());
  fs.writeFileSync(lock, JSON.stringify({ token: overrides.lockToken || token, at: Date.now() }));
  fs.writeFileSync(config, JSON.stringify({
    installer,
    appExe: path.join(dir, 'khong-co-app.exe'),
    log, token, lock, cancel, status, ready,
    processName: 'flow-khong-ton-tai-' + Date.now(),
  }));

  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Config', config,
    ], { stdio: 'ignore', windowsHide: true, cwd: dir });
    const t0 = Date.now();
    const iv = setInterval(() => {
      let st = null;
      try { st = JSON.parse(fs.readFileSync(status, 'utf8')); } catch (_) {}
      if (st || Date.now() - t0 > 20000) {
        clearInterval(iv);
        try { ps.kill(); } catch (_) {}
        let readyText = '';
        let logText = '';
        try { readyText = fs.readFileSync(ready, 'utf8').trim(); } catch (_) {}
        try { logText = fs.readFileSync(log, 'utf8'); } catch (_) {}
        resolve({ dir, status: st, readyText, logText, token });
      }
    }, 200);
  });
}

function cleanupRealHelper(dir) {
  try { require('node:fs').rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

test('helper chạy thật với lock JSON thì qua kiểm tra, ghi ready và chạy installer',
  { skip: process.platform !== 'win32' }, async () => {
    const r = await runRealHelper();
    try {
      assert.ok(r.status, 'helper phải ghi file status');
      assert.equal(r.status.ok, true, 'lock JSON phải được chấp nhận: ' + JSON.stringify(r.status));
      assert.equal(r.readyText, r.token, 'phải ghi ready với đúng token, KHÔNG có BOM');
      assert.doesNotThrow(() => JSON.parse(require('node:fs').readFileSync(
        require('node:path').join(r.dir, 'status.json'), 'utf8')), 'status phải parse được trực tiếp, KHÔNG có BOM');
      assert.ok(r.logText.includes('helper ready token=' + r.token), 'phải log ready');
      assert.ok(r.logText.includes('installer exit=0'), 'phải chạy được installer');
    } finally { cleanupRealHelper(r.dir); }
  });

test('helper gặp lock sai token thì báo lỗi thay vì âm thầm thoát',
  { skip: process.platform !== 'win32' }, async () => {
    const r = await runRealHelper({ lockToken: 'khac-token' });
    try {
      assert.ok(r.status, 'lock sai vẫn phải ghi status để app báo lỗi');
      assert.equal(r.status.ok, false);
      assert.match(r.status.error, /khoa khong khop token/);
      assert.equal(r.readyText, '', 'KHÔNG được ghi ready khi lock sai');
    } finally { cleanupRealHelper(r.dir); }
  });

test('runCleanup trả skipped=true khi version chưa tăng', () => {
  const { runCleanup } = require('./update-cleanup');
  const r = runCleanup({ fromVersion: '1.1.15' }, '1.1.15', () => {});
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'version not advanced');
  assert.deepEqual(r.deleted, []);
});
