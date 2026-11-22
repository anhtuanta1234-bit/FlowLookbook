// Dọn file cài đặt cũ SAU khi bản mới đã mở lại thành công.
// Chỉ xóa các file installer do chính app tạo ra: file vừa tải + các file cũ trong dist.
// Không đụng vào thư mục data/, thư mục app đang cài hay registry.
const fs = require('fs');
const path = require('path');

function compareVersion(a, b) {
  const pa = String(a || '0').split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function runCleanup(job, currentVersion, log = () => {}, opts = {}) {
  const deleted = [];
  if (!job) return { deleted };
  if (compareVersion(currentVersion, job.fromVersion || '0') <= 0) {
    log('cleanup skipped: version not advanced (' + currentVersion + ' <= ' + job.fromVersion + ')');
    return { deleted };
  }
  if (opts.enabled === false) {
    log('cleanup skipped: disabled by setting');
    return { deleted };
  }
  log('cleanup start: ' + job.fromVersion + ' -> ' + currentVersion);

  let bytes = 0;
  const tryDelete = (p, reason) => {
    try {
      if (typeof p !== 'string' || !p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return;
      const size = fs.statSync(p).size;
      fs.rmSync(p, { force: true });
      deleted.push(p);
      bytes += size;
      log('cleanup deleted (' + reason + '): ' + p);
    } catch (er) {
      log('cleanup delete failed: ' + p + ' — ' + (er && er.message ? er.message : er));
    }
  };

  // File installer vừa được tải về để cài bản mới — sau khi cài xong không cần giữ.
  tryDelete(job.installer, 'downloaded');

  // Máy phát triển: giữ lại đúng installer của bản hiện tại, xóa các bản cũ hơn.
  const dist = job.sourceRoot ? path.join(job.sourceRoot, 'dist') : '';
  if (dist && fs.existsSync(dist)) {
    for (const name of fs.readdirSync(dist)) {
      const m = name.match(/^Flow Lookbook Setup (\d+\.\d+\.\d+)\.exe$/i);
      if (!m || compareVersion(m[1], currentVersion) >= 0) continue;
      tryDelete(path.join(dist, name), 'old build');
    }
  }

  log('cleanup done: ' + deleted.length + ' file(s), ' + (bytes / 1048576).toFixed(1) + ' MB freed');
  return { deleted };
}

module.exports = { compareVersion, runCleanup };
