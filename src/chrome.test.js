const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, 'chrome.js'), 'utf8');

test('Flow và Firefly dùng 2 cổng CDP + 2 profile Chrome riêng biệt', () => {
  assert.match(src, /function createChrome\(\{ getPort, profileName, startUrl, seedFrom, minWindow, maximized \}\)/, 'phải tạo được các bộ Chrome độc lập');
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

test('Firefly chạy automation thì dời ra ngoài màn hình, vẫn full size; Flow giữ cỡ cũ', () => {
  assert.match(src, /profileName: 'chrome-firefly-profile',[\s\S]*?maximized: true,/, 'Firefly bật chế độ full màn hình');
  assert.match(src, /maximized \? \['--start-maximized'\] : \['--window-position=60,60', '--window-size=1000,700'\]/, 'mở sẵn maximized, Flow vẫn cỡ cũ');
  assert.match(src, /if \(!visible && !maximized\) args\.push\('--start-minimized'\)/, 'bộ maximized không bao giờ nhận --start-minimized');
  assert.match(src, /async function setOffscreen\(b = null\)/, 'có hàm dời cửa sổ ra ngoài màn hình');
  assert.match(src, /screen\.width \|\| 1920, h: screen\.height \|\| 1080/, 'lấy đúng kích thước màn hình để canvas không co');
  assert.match(src, /left: -width - 40, top: -height - 40, width, height/, 'dời ra ngoài nhưng giữ nguyên kích thước full màn hình');
  assert.match(src, /if \(cur\.windowState === 'normal' && \(cur\.left \|\| 0\) <= -sw\) continue/, 'đã ở ngoài thì không gửi lệnh thừa');
  assert.match(src, /if \(maximized && !visible\) await setOffscreen\(browser\)\.catch\(\(\) => \{\}\)/, 'khởi động automation là đẩy ra ngoài ngay, không ló lên');
  assert.match(src, /const hideWindow = \(\) => \(maximized \? setOffscreen\(\) : setWindowState\('minimized'\)\)/, 'chạy ngầm không thu nhỏ Firefly mà dời ra ngoài');
  assert.match(src, /if \(maximized\) await setMaximized\(\);\s*else await setWindowState\('normal'\)/, 'bấm Kết nối/Xem thì đưa về full màn hình');
  assert.ok(!/minWindow: \{ left: 60, top: 60, width: 1000, height: 700 \}/.test(src), 'bỏ cỡ 1000x700 cũ');
  assert.match(src, /'--disable-fre', '--disable-search-engine-choice-screen'/, 'không hiện màn hình chào lần đầu');
});

test('mỗi bộ Chrome chỉ tự đóng process của chính nó', () => {
  assert.match(src, /const port = \(\) => Math\.max\(1, Number\(getPort\(\)\) \|\| 9333\)/);
  assert.match(src, /Where-Object \{ \$_\.CommandLine -like '\*--remote-debugging-port=\$\{p\}\*' -or \$_\.CommandLine -like '\*\$\{dir\}\*' \}/);
});
