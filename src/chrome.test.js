const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, 'chrome.js'), 'utf8');

test('Flow và Firefly dùng 2 cổng CDP + 2 profile Chrome riêng biệt', () => {
  assert.match(src, /function createChrome\(\{ getPort, profileName, startUrl, seedFrom, minWindow \}\)/, 'phải tạo được các bộ Chrome độc lập');
  assert.match(src, /profileName: 'chrome-profile'/, 'Flow giữ profile cũ');
  assert.match(src, /profileName: 'chrome-firefly-profile'/, 'Firefly có profile riêng');
  assert.match(src, /startUrl: FLOW_HOME/);
  assert.match(src, /startUrl: FIREFLY_HOME/);
  assert.match(src, /fireflyCdpPort/, 'Firefly có cổng CDP riêng');
  assert.match(src, /ff === flow \? flow \+ 1 : ff/, 'cổng Firefly tự lệch nếu lỡ trùng cổng Flow');
  assert.match(src, /closeAll: async \(\) => \{ await Promise\.allSettled\(\[flowChrome\.close\(\), fireflyChrome\.close\(\)\]\); \}/);
});

test('lần đầu tách Firefly kế thừa đăng nhập từ profile cũ', () => {
  assert.match(src, /function seedProfile\(dir, seedFrom\)/);
  assert.match(src, /if \(!seedFrom \|\| fs\.existsSync\(dir\)\) return;/);
  assert.match(src, /fs\.cpSync\(src, dir, \{ recursive: true \}\)/);
  assert.match(src, /profileName: 'chrome-firefly-profile',[\s\S]*?seedFrom: 'chrome-profile'/, 'profile Firefly mới copy từ profile đang đăng nhập');
  assert.match(src, /seedProfile\(dir, seedFrom\); \/\/ copy profile cũ trước khi Chrome khởi động/);
});

test('showWindow phóng Firefly về kích thước tối thiểu để canvas không co lại', () => {
  assert.match(src, /minWindow: \{ width: 1100, height: 760 \}/);
  assert.match(src, /if \(minWindow\) \{[\s\S]*?Browser\.getWindowBounds[\s\S]*?Browser\.setWindowBounds[\s\S]*?minWindow\.width[\s\S]*?minWindow\.height/);
});

test('mỗi bộ Chrome chỉ tự đóng process của chính nó', () => {
  assert.match(src, /const port = \(\) => Math\.max\(1, Number\(getPort\(\)\) \|\| 9333\)/);
  assert.match(src, /Where-Object \{ \$_\.CommandLine -like '\*--remote-debugging-port=\$\{p\}\*' -or \$_\.CommandLine -like '\*\$\{dir\}\*' \}/);
});
