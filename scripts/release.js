#!/usr/bin/env node
'use strict';

// Phát hành 1 bản mới, KHÔNG cần thao tác tay trên GitHub:
//  1) tăng version, lấy ghi chú từ CHANGELOG.md (hoặc git log)
//  2) cập nhật version.json
//  3) build installer
//  4) commit + push source lên GitHub
//  5) tạo/cập nhật Release, upload installer
// Sau đó mọi app (máy bạn + máy người khác) tự hiện thông báo, tự tải/cài/mở lại.

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'anhtuanta1234-bit';
const REPO = 'FlowLookbook';
const BRANCH = 'main';
const REMOTE = `https://github.com/${OWNER}/${REPO}.git`;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (f, o) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o, null, 2) + '\n');

function tokenFile() {
  const base = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  return path.join(base, 'Flow Lookbook', 'github-token.dat');
}

function loadToken() {
  const file = tokenFile();
  if (!fs.existsSync(file)) {
    throw new Error('Chưa lưu token GitHub. Chạy 1 lần: npm run auth:github');
  }
  const ps = `
    $c = [IO.File]::ReadAllText('${file.replace(/'/g, "''")}').Trim()
    $s = ConvertTo-SecureString $c
    [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    )
  `;
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim();
}

const TOKEN = loadToken();

function git(list, auth) {
  // GitHub chấp nhận Basic với username đặc biệt "x-access-token" (Bearer không dùng được cho git HTTPS).
  const basic = Buffer.from(`x-access-token:${TOKEN}`).toString('base64');
  const prefix = auth ? ['-c', `http.extraHeader=AUTHORIZATION: basic ${basic}`] : [];
  return execFileSync('git', [...prefix, ...list], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function gitOk(list) { try { git(list); return true; } catch (_) { return false; } }

function api(method, endpoint, body, upload) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8'));
    const opts = {
      hostname: upload ? 'uploads.github.com' : 'api.github.com',
      path: endpoint,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'FlowLookbook-Release-Bot',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    if (data) {
      opts.headers['Content-Type'] = upload ? 'application/octet-stream' : 'application/json';
      opts.headers['Content-Length'] = data.length;
    }
    const req = https.request(opts, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        let json = text;
        try { json = JSON.parse(text); } catch (_) {}
        if (res.statusCode >= 400) {
          reject(new Error(`${method} ${endpoint} → HTTP ${res.statusCode}\n${text.slice(0, 800)}`));
        } else resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function bump(version, type) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error('Version không hợp lệ: ' + version);
  let [a, b, c] = m.slice(1).map(Number);
  if (type === 'major') { a++; b = 0; c = 0; }
  else if (type === 'minor') { b++; c = 0; }
  else c++;
  return `${a}.${b}.${c}`;
}

function readChangelog() {
  const file = path.join(ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(file)) return { text: '# Lịch sử phiên bản\n\n## Unreleased\n\n', notes: '' };
  const text = fs.readFileSync(file, 'utf8');
  const m = /##\s*Unreleased\s*\n([\s\S]*?)(?=\n##\s|$)/i.exec(text);
  return { text, notes: m ? m[1].trim() : '' };
}

function notesFromGit() {
  let range = '';
  try { range = `${git(['describe', '--tags', '--abbrev=0'])}..HEAD`; } catch (_) {}
  try {
    return git(['log', ...(range ? [range] : ['-8']), '--pretty=format:- %s'])
      .split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
  } catch (_) { return ''; }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(/^y|yes$/i.test(String(answer).trim())); });
  });
}

(async () => {
  // 1. Chuẩn bị git repo
  if (!gitOk(['rev-parse', '--is-inside-work-tree'])) {
    git(['init', '-b', BRANCH]);
    git(['config', 'user.name', OWNER]);
    git(['config', 'user.email', `${OWNER}@users.noreply.github.com`]);
    git(['remote', 'add', 'origin', REMOTE]);
  }
  if (!gitOk(['remote', 'get-url', 'origin'])) git(['remote', 'add', 'origin', REMOTE]);

  // 2. Version mới
  const pkg = readJson('package.json');
  const explicit = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
  const next = explicit || bump(pkg.version, has('--major') ? 'major' : has('--minor') ? 'minor' : 'patch');

  // 3. Ghi chú: ưu tiên CHANGELOG.md "Unreleased", fallback = commit messages
  const cl = readChangelog();
  const notes = cl.notes || notesFromGit() || `Bản cập nhật ${next}.`;

  // 3b. Hỏi lại trước khi publish (bỏ qua bằng --yes khi agent đã hỏi user).
  if (!has('--yes')) {
    console.log(`\nBản mới: v${next}`);
    console.log('Nội dung thông báo:\n' + notes.split('\n').map((l) => '  ' + l).join('\n'));
    const ok = await ask('\nĐưa phiên bản mới này lên Git/GitHub? [y/N] ');
    if (!ok) { console.log('Đã huỷ, không có gì được đẩy lên.'); return; }
  }

  // 4. Ghi lại vào file
  pkg.version = next;
  writeJson('package.json', pkg);
  const assetName = `Flow Lookbook Setup ${next}.exe`;
  writeJson('version.json', {
    version: next,
    url: `https://github.com/${OWNER}/${REPO}/releases/download/v${next}/${encodeURIComponent(assetName)}`,
    notes,
  });
  const date = new Date().toISOString().slice(0, 10);
  const newCl = cl.text.replace(
    /##\s*Unreleased\s*\n[\s\S]*?(?=\n##\s|$)/i,
    `## Unreleased\n\n## v${next} - ${date}\n${notes}\n\n`
  );
  fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), newCl);

  // 5. Build installer
  console.log(`\n>> Đang build bản v${next}...`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build'], {
    cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (build.status !== 0) throw new Error('Build thất bại.');
  const installer = path.join(ROOT, 'dist', assetName);
  if (!fs.existsSync(installer)) throw new Error('Không tìm thấy file cài đặt: ' + installer);

  // 6. Commit + tag + push
  git(['add', '-A']);
  let committed = true;
  try { git(['commit', '-m', `release: v${next}`]); } catch (_) { committed = false; }
  try { git(['tag', '-f', `v${next}`]); } catch (_) {}
  console.log('>> Đang đẩy source lên GitHub...');
  git(['push', '-f', 'origin', BRANCH, '--tags'], true);
  console.log(`   source pushed${committed ? '' : ' (không có thay đổi mới)'}`);

  // 7. Tạo / cập nhật Release
  console.log('>> Đang tạo/cập nhật Release...');
  const tag = `v${next}`;
  const releases = await api('GET', `/repos/${OWNER}/${REPO}/releases?per_page=100`);
  let rel = releases.data.find((r) => r.tag_name === tag) || null;
  if (rel) {
    await api('PATCH', `/repos/${OWNER}/${REPO}/releases/${rel.id}`, {
      name: `Flow Lookbook ${next}`, body: notes,
    });
    for (const a of rel.assets || []) {
      if (a.name === assetName) await api('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${a.id}`);
    }
  } else {
    const created = await api('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: tag, name: `Flow Lookbook ${next}`, body: notes, draft: false, prerelease: false,
    });
    rel = created.data;
  }

  // 8. Upload installer
  console.log('>> Đang upload installer (~118 MB)...');
  const upload = `/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(assetName)}`;
  await api('POST', upload, fs.readFileSync(installer), true);

  console.log(`\nXONG v${next}`);
  console.log(`Manifest : https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/version.json`);
  console.log(`Release  : https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
})().catch((e) => {
  console.error('\nLỖI:', e.message);
  process.exit(1);
});
