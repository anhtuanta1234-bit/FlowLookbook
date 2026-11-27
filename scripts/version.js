'use strict';

// Quy ước tên phiên bản Flow Lookbook:
//   ... .1 → .2 → ... → .10 → (tăng phần giữa, patch về 1)
// Ví dụ: 1.1.48 → 1.2.1 → ... → 1.2.10 → 1.3.1 → ... → 1.9.10 → 1.10.1.
// Không bao giờ có patch .11 trở đi.
function bump(version, type = 'patch') {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!m) throw new Error('Version không hợp lệ: ' + version);
  let [major, minor, patch] = m.slice(1).map(Number);

  if (type === 'major') {
    major++;
    minor = 1;
    patch = 1;
  } else if (type === 'minor') {
    minor++;
    patch = 1;
  } else {
    patch++;
    if (patch > 10) {
      minor++;
      patch = 1;
    }
  }
  return `${major}.${minor}.${patch}`;
}

module.exports = { bump };
