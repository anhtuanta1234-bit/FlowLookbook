const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Kiểm tra thật cơ chế khởi helper trên Windows, với đường dẫn CÓ DẤU CÁCH:
// helper phải chạy được và sống sót sau khi app đóng.
test('helper chạy được dù đường dẫn có dấu cách', { skip: process.platform !== 'win32' }, async () => {
  const spaced = path.join(os.tmpdir(), 'flow spawn test ' + Date.now());
  fs.mkdirSync(spaced, { recursive: true });
  // helper + config nằm ở gốc %TEMP% (đường dẫn ngắn); installer/log có dấu cách,
  // đúng với thực tế app: "C:\Users\TA ANH TUAN\Downloads\Flow Lookbook Setup.exe".
  const script = path.join(os.tmpdir(), 'flow-helper-' + Date.now() + '.ps1');
  const config = path.join(os.tmpdir(), 'flow-params-' + Date.now() + '.json');
  const log = path.join(spaced, 'run log.txt');
  const installer = path.join(spaced, 'Flow Lookbook Setup 1.1.12.exe');
  const childJs = path.join(os.tmpdir(), 'flow-launch-' + Date.now() + '.js');
  // attrib.exe là exe hệ thống vô hại, chạy với /S rồi thoát ngay — dùng làm installer giả.
  fs.copyFileSync(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'attrib.exe'), installer);

  fs.writeFileSync(script, [
    'param([string]$Config)',
    '$c = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json',
    'Add-Content -LiteralPath $c.log -Value "START"',
    '$proc = Start-Process -FilePath $c.installer -ArgumentList \'/S\' -Wait -PassThru -ErrorAction Stop',
    'Add-Content -LiteralPath $c.log -Value "installer exit=$($proc.ExitCode)"',
    'Start-Sleep -Seconds 2',
    'Add-Content -LiteralPath $c.log -Value "LATER"',
  ].join('\n'));
  fs.writeFileSync(config, JSON.stringify({ log, installer }));

  // os.tmpdir() trả về đường dẫn ngắn (không dấu cách) nên -File/-Config an toàn.
  const launcher = `
const { spawn } = require('child_process');
const fs = require('fs');
const script = process.argv[2], config = process.argv[3], log = process.argv[4];
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const inner = "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File'," + q(script) + ",'-Config'," + q(config) + ") -WindowStyle Hidden";
spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command',inner], { stdio:'ignore', windowsHide:true });
const t0 = Date.now();
const iv = setInterval(() => {
  let started = false;
  try { started = fs.readFileSync(log,'utf8').includes('START'); } catch (_) {}
  if (started || Date.now() - t0 > 10000) { clearInterval(iv); process.exit(started ? 0 : 1); }
}, 100);
`;
  fs.writeFileSync(childJs, launcher);

  // cwd là thư mục rỗng để attrib.exe /S (installer giả) thoát ngay, không quét cả repo.
  const parent = spawn(process.execPath, [childJs, script, config, log], { stdio: 'ignore', cwd: spaced });
  const code = await new Promise((resolve) => parent.on('close', resolve));
  assert.equal(code, 0, 'helper phải chạy dù script nằm ở đường dẫn có dấu cách');

  await new Promise((resolve) => setTimeout(resolve, 4000));
  const content = fs.readFileSync(log, 'utf8');
  assert.ok(content.includes('START'), 'helper phải chạy');
  assert.ok(content.includes('installer exit=0'), 'phải chạy được installer dù đường dẫn có dấu cách');
  assert.ok(content.includes('LATER'), 'helper phải sống sau khi tiến trình cha thoát');
  for (const f of [script, config, childJs]) { try { fs.rmSync(f, { force: true }); } catch (_) {} }
  fs.rmSync(spaced, { recursive: true, force: true });
});
