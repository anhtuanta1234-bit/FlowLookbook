// Các hàm thuần dùng chung cho luồng tự cập nhật.
// Tách riêng để test được bằng node --test mà không cần khởi tạo Electron.
const path = require('path');
const { compareVersion } = require('./update-cleanup');

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'raw.githubusercontent.com',
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

const INSTALLER_NAME = /^Flow\.Lookbook\.Setup\.(\d+\.\d+\.\d+)\.exe$/i;

// "v1.1.17", " 1.1.17.0 " và "1.1.17" phải được coi là cùng một bản.
function cleanVersion(v) {
  return String(v == null ? '' : v).trim().replace(/^v/i, '');
}

function sameVersion(a, b) {
  return compareVersion(cleanVersion(a), cleanVersion(b)) === 0;
}

// Chỉ chấp nhận HTTPS từ GitHub và đúng tên installer do chính release script tạo.
function validateInstallerUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); }
  catch (_) { return { ok: false, reason: 'Đường dẫn tải không hợp lệ.' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Chỉ chấp nhận đường dẫn HTTPS.' };
  if (u.username || u.password) return { ok: false, reason: 'Đường dẫn tải không hợp lệ.' };
  if (!ALLOWED_DOWNLOAD_HOSTS.has(u.hostname.toLowerCase())) {
    return { ok: false, reason: 'Máy chủ tải không được phép.' };
  }
  let name;
  try { name = decodeURIComponent(path.posix.basename(u.pathname)); }
  catch (_) { return { ok: false, reason: 'Tên file không hợp lệ.' }; }
  if (!name || name.includes('..') || name.includes('\\') || name.includes('/')) {
    return { ok: false, reason: 'Tên file không hợp lệ.' };
  }
  const m = name.match(INSTALLER_NAME);
  if (!m) return { ok: false, reason: 'File tải không đúng định dạng installer.' };
  return { ok: true, fileName: name, version: m[1], url: u.toString() };
}

// Quyết định có xoá pending-cleanup.json hay không. Mở app quá sớm (version chưa tăng)
// thì PHẢI giữ lại job, đây là lỗi đã xảy ra ở bản 1.1.15 -> 1.1.16.
function shouldKeepPending(currentVersion, job) {
  return !!job && compareVersion(
    cleanVersion(currentVersion),
    cleanVersion(job.fromVersion || '0'),
  ) <= 0;
}

// Script PowerShell chạy độc lập sau khi app đã đóng. Mọi đường dẫn được đọc từ
// file JSON cấu hình để tránh PowerShell 5.1 tách đường dẫn có dấu cách.
function buildHelperScript() {
  return `param([string]$Config)
$c = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$Installer = $c.installer
$AppExe = $c.appExe
$Log = $c.log
$Token = $c.token
$Lock = $c.lock
$Cancel = $c.cancel
$Status = $c.status
$ProcessName = $c.processName
function W($m) { Add-Content -LiteralPath $Log -Value ("[" + (Get-Date -Format o) + "] " + $m) }
function WriteStatus($ok, $code, $err) {
  $data = @{ token = $Token; ok = $ok }
  if ($null -ne $code) { $data.exitCode = $code }
  if ($err) { $data.error = $err }
  try { Set-Content -LiteralPath $Status -Value ($data | ConvertTo-Json -Compress) -Encoding UTF8 } catch {}
}
W "helper start token=$Token"
try {
  $lockToken = (Get-Content -LiteralPath $Lock -Raw -ErrorAction Stop).Trim()
  if ($lockToken -ne $Token) { W "helper abort: khoa khong khop token"; exit 1 }
} catch { W "helper abort: khong doc duoc khoa"; exit 1 }

for ($i = 0; $i -lt 150; $i++) {
  if (Test-Path -LiteralPath $Cancel) {
    try {
      $cancelToken = (Get-Content -LiteralPath $Cancel -Raw -ErrorAction SilentlyContinue).Trim()
      if ($cancelToken -eq $Token) {
        W "helper cancelled by token"
        Remove-Item -LiteralPath $Lock -Force -ErrorAction SilentlyContinue
        exit 0
      }
    } catch {}
  }
  $running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $AppExe }
  if (-not $running) { break }
  Start-Sleep -Milliseconds 400
}
W "waited ticks=$i stillRunning=$([bool]$running)"
try {
  $proc = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru -ErrorAction Stop
  $code = [int]$proc.ExitCode
  W "installer exit=$code"
  if ($code -ne 0) { throw ("installer tra ve ma " + $code) }
  WriteStatus $true $code ''
  W "install finished - user will relaunch manually"
} catch {
  W "installer failed: $($_.Exception.Message)"
  WriteStatus $false $null $_.Exception.Message
} finally {
  Remove-Item -LiteralPath $Lock -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Config -Force -ErrorAction SilentlyContinue
}
W "helper end"
`;
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS,
  INSTALLER_NAME,
  cleanVersion,
  sameVersion,
  validateInstallerUrl,
  shouldKeepPending,
  buildHelperScript,
};
