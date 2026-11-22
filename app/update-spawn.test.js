const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Kiểm tra thật cơ chế khởi helper trên Windows: tiến trình "cháu" qua Start-Process
// phải chạy được VÀ sống sót sau khi tiến trình cha (app) đã thoát.
test('helper tách qua Start-Process vẫn chạy sau khi app đóng', { skip: process.platform !== 'win32' }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-spawn-'));
  const script = path.join(base, 'helper.ps1');
  const log = path.join(base, 'run.log');
  const childJs = path.join(base, 'launcher.js');

  fs.writeFileSync(script, [
    'param([string]$Log)',
    'Add-Content -LiteralPath $Log -Value "START"',
    'Start-Sleep -Seconds 2',
    'Add-Content -LiteralPath $Log -Value "LATER"',
  ].join('\n'));

  const launcher = `
const { spawn } = require('child_process');
const fs = require('fs');
const script = process.argv[2], log = process.argv[3];
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const inner = "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File'," + q(script) + ",'-Log'," + q(log) + ") -WindowStyle Hidden";
spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command',inner], { stdio:'ignore', windowsHide:true });
const t0 = Date.now();
const iv = setInterval(() => {
  let started = false;
  try { started = fs.readFileSync(log,'utf8').includes('START'); } catch (_) {}
  if (started || Date.now() - t0 > 10000) { clearInterval(iv); process.exit(started ? 0 : 1); }
}, 100);
`;
  fs.writeFileSync(childJs, launcher);

  const parent = spawn(process.execPath, [childJs, script, log], { stdio: 'ignore' });
  const code = await new Promise((resolve) => parent.on('close', resolve));
  assert.equal(code, 0, 'helper phải báo đã chạy trước khi app thoát');

  await new Promise((resolve) => setTimeout(resolve, 3000));
  const content = fs.readFileSync(log, 'utf8');
  assert.ok(content.includes('START'), 'helper phải chạy');
  assert.ok(content.includes('LATER'), 'helper phải sống sau khi tiến trình cha thoát');
  fs.rmSync(base, { recursive: true, force: true });
});
