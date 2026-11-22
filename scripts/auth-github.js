#!/usr/bin/env node
'use strict';

// Lưu token GitHub 1 lần duy nhất. Token được mã hoá bằng DPAPI của Windows,
// chỉ đọc được bởi chính user này trên máy này — không lưu dạng plain text.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
  'Flow Lookbook'
);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'github-token.dat');
const escaped = file.replace(/'/g, "''");

const ps = `
$sec = Read-Host 'Dán GitHub Personal Access Token (sẽ không hiện ra)' -AsSecureString
if (-not $sec) { throw 'Token rỗng' }
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if (-not $plain) { throw 'Token rỗng' }
$enc = ConvertTo-SecureString -String $plain -AsPlainText -Force | ConvertFrom-SecureString
[IO.File]::WriteAllText('${escaped}', $enc, [Text.Encoding]::ASCII)
Write-Host 'Đã lưu token an toàn. Từ giờ chỉ cần chạy: npm run release'
`;

const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit', shell: false });
process.exit(r.status == null ? 1 : r.status);
