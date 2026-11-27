const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// Chạy thật các hàm đọc thông tin cập nhật (không nạp toàn bộ app.js vì cần DOM).
function updateHelpers(manifestUrl, currentVersion, fetchImpl) {
  const start = src.indexOf('const normalizeVersion =');
  const end = src.indexOf('async function checkUpdate(manual)');
  assert.ok(start >= 0 && end > start, 'Phải tìm thấy khối hàm cập nhật trong app.js');
  const code = src.slice(start, end) + '\nglobalThis.__h = { readUpdateInfo, parseManifestInfo, parseLatestRelease, latestReleaseApiUrl };';
  const context = {
    UPDATE_MANIFEST_URL: manifestUrl,
    CURRENT_VERSION: currentVersion,
    fetchWithTimeout: fetchImpl,
    compareVer: (a, b) => {
      const pa = String(a || '').split('.').map(Number);
      const pb = String(b || '').split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x > y ? 1 : -1;
      }
      return 0;
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.__h;
}
const jsonResponse = (data) => ({ ok: true, json: async () => data });

test('giao diện không gọi hộp nhập tên của trình duyệt (Electron không hỗ trợ)', () => {
  // Chỉ khớp lời gọi thật có đối số là chuỗi, không khớp chữ "prompt" trong câu tiếng Việt.
  assert.doesNotMatch(src, /(?:window\.)?prompt\s*\(\s*['"`]/, 'Không được gọi prompt() trong app.js');
  assert.match(src, /function askText\(/, 'Phải có hộp nhập chữ thay thế ngay trong app');
});

test('nút Thêm KOC hỏi tên bằng hộp nhập của app và xử lý khi hủy', () => {
  assert.match(src, /const name = await askText\('Thêm KOC'/, 'Nút Thêm KOC phải dùng askText()');
  assert.match(src, /if \(name === null\) return kocDialog\(selectMode\)/, 'Bấm Hủy phải hiện lại thư viện KOC');
  assert.match(src, /activeModalClose = \(\) => finish\(null\)/, 'Esc phải hủy hộp nhập, không để promise treo');
});

test('hết 5 lần mở Flow thì báo riêng cho cảnh kèm nút Mở Flow đúng cảnh đó', () => {
  assert.match(src, /run\.errorCode === 'FLOW_BLOCKED_GIVE_UP'/, 'Phải nhận diện lỗi Flow đã hết lần thử');
  assert.match(src, /label: 'Mở Flow'/, 'Thông báo phải có nút Mở Flow');
  assert.match(src, /sceneId: item\.scene\?\.id/, 'Nút Mở Flow phải mở đúng dự án của cảnh');
  assert.match(src, /if \(kind === 'err' && \/flow\/i\.test\(msg\) && !opts\.action\)/, 'Có nút riêng thì không thêm nút Mở Flow chung sai cảnh');
});

test('dialog cập nhật không bị kẹt cờ khi modal khác thay thế', () => {
  assert.match(src, /S\.updateDialogOpen = false;\n  const close = \(\) => \{/, 'modal() phải reset cờ updateDialogOpen');
  assert.match(src, /if \(S\.updateDialogOpen && \$\('#uInstall'\)\) return;/, 'Chỉ chặn khi dialog cập nhật thật sự đang mở');
  assert.match(src, /const m = modal\(`<h3>Có phiên bản mới: v\$\{esc\(info\.version\)\}<\/h3>[\s\S]*S\.updateDialogOpen = true;/, 'Phải set cờ sau khi tạo dialog cập nhật');
});

test('danh sách dự án có vai trò nút để mở dự án', () => {
  assert.match(src, /role="button" tabindex="0" aria-label="Mở dự án/, 'Mục dự án phải có role button và aria-label mở dự án');
});

test('Bước 4 có nút bật/tắt ngoài Cài đặt, mặc định TẮT, chỉnh cọ/mask riêng', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /id="btnLogo"/, 'Phải có nút bật/tắt trên thanh công cụ');
  assert.match(html, /data-tip="Bật\/tắt Bước 4 xóa logo bằng Firefly\. Mặc định TẮT/, 'Nút phải nói rõ mặc định TẮT');
  assert.match(src, /async function toggleLogo\(\)/, 'Phải có hàm bật/tắt');
  assert.match(src, /await api\('POST', '\/api\/config', \{ removeLogoEnabled: on \}\)/, 'Chỉ lưu khi người dùng bấm nút');
  assert.match(src, /function step3ReadyForLogo\(\)/, 'Vẫn nhận diện Bước 3 đã dọn xong để tự mở khóa');
  assert.ok(!/if \(on && !step3ReadyForLogo\(\)\)/.test(src), 'Bật sớm được: không chặn nút khi chưa xong Bước 3');
  assert.match(src, /const ready = on && step3ReadyForLogo\(\)/, 'Chỉ tự sang Bước 4 khi đã dọn xong Bước 3');
  assert.ok(!/id="cRemoveLogo"/.test(src), 'Cài đặt không còn toggle Bước 4');
  for (const id of ['fBrush', 'fMaskX', 'fMaskY', 'fMaskW', 'fMaskH']) assert.match(src, new RegExp(`id="${id}"`), `Phải có ô chỉnh ${id}`);
  assert.match(src, /data-act="savefireflycfg"/, 'Cỡ cọ/mask có nút Lưu riêng');
  assert.match(src, /logoRemoveMask: \{ xPct: val\('fMaskX'/, 'Mask phải được lưu cùng cỡ cọ');
  assert.match(src, /data-act="logook"/, 'Phải có nút Chọn trước khi lưu ảnh sạch');
  assert.match(src, /data-act="fireflyreveal"/, 'Phải có nút hiện Firefly để kiểm tra kết quả');
  assert.match(src, /fireflyQuotaPaused/, 'Phải hiện trạng thái Firefly hết lượt trên thanh trạng thái');
  assert.match(src, /data-act="logoresume"/, 'Phải có nút tiếp tục sau khi đổi Gmail');
  assert.match(src, /esc\(logoText\(lr\.error\)\)/, 'Thông báo lỗi/quota phải hiển thị từ máy chủ gửi sang và sửa chữ Ổn cũ');
});

test('tắt Xóa logo thì Bước 4 ẩn hẳn, bật lại mới hiện sau Bước 3', () => {
  assert.match(src, /const visibleSteps = \(\) => \(S\.cfg\?\.removeLogoEnabled \? STEPS : STEPS\.filter\(\(s\) => s\.n !== 4\)\)/, 'thanh bước chỉ lấy 1-2-3 khi đang tắt');
  assert.match(src, /morph\(\$\('#steps'\), visibleSteps\(\)\.map/, 'render thanh bước dùng danh sách đã lọc');
  assert.match(src, /if \(!on && S\.stage === 4\) S\.stage = 3;/, 'tắt thì lui về Bước 3');
  assert.match(src, /if \(ready\) \{\s*S\.stage = 4;[\s\S]{0,200}api\('PATCH', `\/api\/projects\/\$\{S\.p\.id\}`/, 'xong Bước 3 rồi bật là chuyển thẳng sang Bước 4');
  assert.match(src, /if \(to === 4 && !S\.cfg\?\.removeLogoEnabled\) return;/, 'không cho tự nhảy vào Bước 4 khi đang ẩn');
  assert.match(src, /if \(!S\.cfg\?\.removeLogoEnabled\) return false; \/\/ đang TẮT thì không hiện Bước 4/, 'dọn xong Bước 3 cũng không tự mở Bước 4');
  assert.match(src, /const nextStage = !S\.cfg\?\.removeLogoEnabled && data\.stage >= 4 \? 3 : data\.stage/, 'poll không đẩy lên Bước 4');
  assert.match(src, /const to = !S\.cfg\?\.removeLogoEnabled && g\.to >= 4 \? 3 : g\.to/, 'SSE không đẩy lên Bước 4');
  assert.match(src, /S\.stage = \(!S\.cfg\?\.removeLogoEnabled && st >= 4\) \? 3 : st/, 'mở lại dự án đang ở Bước 4 vẫn dừng ở Bước 3');
});

test('thanh bước “Xóa logo”: bật sớm vẫn khóa, dọn xong Bước 3 mới tích xanh và tự sang Bước 4', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  assert.match(src, /\{ n: 4, t: 'Xóa logo'/, 'có bước Xóa logo nối ngay sau Ghép cảnh thật');
  assert.match(src, /const locked = s\.n > maxStage, done = stageDone\(s\.n\)/, 'khóa theo maxStage y hệt các bước khác');
  assert.match(src, /s\.n === 4[\s\S]{0,30}\? `<span class="n">\$\{locked \? I\.lock : '✓'\}<\/span>`/, 'chưa mở là hình khóa, mở rồi là vòng tích');
  assert.match(src, /s\.n === 4 \? 'logo-step' : ''/, 'cùng lớp .step với các bước trước');
  assert.match(css, /\.step\.logo-step\.logo-on:not\(\.locked\),\.step\.logo-step\.active,\.step\.logo-step\.done\{color:var\(--ok\)\}/, 'chữ xanh như bước trước');
  assert.match(css, /\.step\.logo-step\.logo-on:not\(\.locked\) \.n,\.step\.logo-step\.active \.n,\.step\.logo-step\.done \.n\{background:var\(--ok\);color:#fff\}/, 'vòng tích xanh');
  assert.match(src, /async function showStep4IfReady\(\)/, 'dọn xong Bước 3 thì tự sang Bước 4, giữ thông báo hiện tại');
});

test('Firefly báo xong thì ảnh vào khung xem trước, bấm Chọn mới tải vào anhdaxoalogo', () => {
  assert.ok(src.includes('/api/firefly/prepared?projectId='), 'khung “Ảnh đã xóa logo” đọc ảnh đang giữ trong RAM');
  assert.ok(src.includes('xem trước · bấm Chọn để tải về'), 'có nhãn báo ảnh chưa ghi đĩa');
  assert.match(src, /const canChoose = waiting && cleanReady/, 'nút Chọn chỉ sáng khi Firefly đã xong và có ảnh xem trước');
  assert.ok(src.includes('Firefly báo <b>Đã hoàn tất thao tác tạo sinh</b>'), 'hướng dẫn đúng mốc Firefly báo xong');
  assert.ok(src.includes('bấm <b>Chọn</b> thì tool mới tải vào'), 'chỉ bấm Chọn mới lưu vào thư mục đích');
});

test('xóa dự án báo rõ thư mục output bị xóa, không còn nói giữ ảnh', () => {
  assert.match(src, /thư mục ảnh trong output sẽ bị xóa vĩnh viễn/, 'phải cảnh báo xóa ảnh trong output');
  assert.ok(!/ảnh 2K đã lưu trong thư mục kết quả vẫn được giữ/.test(src), 'không được nói ảnh được giữ nữa');
  assert.match(src, /outputDirsRemoved \?/, 'toast phải đếm thư mục ảnh đã xóa');
});

test('Bước 3 có nút tải hết ảnh về & dọn dẹp, xong mới sang Bước 4', () => {
  assert.match(src, /data-act="cleanall"[\s\S]{0,260}📥 Tải hết ảnh về & Dọn dẹp/, 'phải có nút tải hết ảnh về');
  const cleanall = src.slice(src.indexOf("  if (a === 'cleanall') {"), src.indexOf("  if (a === 'dismisspause')"));
  assert.ok(!/logo|Logo|Firefly/.test(cleanall), 'confirm/toast của Bước 3 không nhắc xóa logo');
  assert.match(src, /JSON\.stringify\(\[!!p\.cleaned,/, 'phải render lại khi trạng thái đã tải/dọn thay đổi');
  assert.match(src, /Đã tải hết ảnh 2K, thư mục chỉ còn ảnh đã chọn/, 'trạng thái sau dọn phải rõ ràng');
});

test('Bước 3 sạch nút/badge xóa logo: mọi thao tác logo chỉ có ở Bước 4', () => {
  const scene = src.slice(src.indexOf('function sceneHtml('), src.indexOf('function sceneMoreMenu('));
  const results = src.slice(src.indexOf('function renderResults()'), src.indexOf('function morph('));
  const sig = src.slice(src.indexOf('function resultsSig('), src.indexOf('function patchProgress()'));
  const notify = src.slice(src.indexOf('  // Bước 4: báo từng mốc'), src.indexOf('// Chip Firefly được tạo lại'));
  assert.ok(!/logoRemoval|Firefly/.test(scene), 'thẻ cảnh Bước 3 không đọc trạng thái xóa logo');
  assert.ok(!/data-act="(?:logook|logoretry|logoskip|logoresume|gmailchange|openclean|fireflyreveal|openlogoout)"/.test(scene), 'thẻ cảnh Bước 3 không có nút xóa logo');
  assert.ok(!/logoArea|quotaScene|Firefly/.test(results), 'khung kết quả Bước 3 không có thư mục/banner xóa logo');
  const step3Sig = sig.slice(sig.indexOf('if (S.stage === 3)'), sig.indexOf('const st = p[PK[S.stage]]'));
  assert.ok(!/logo/.test(step3Sig), 'đổi trạng thái logo không làm vẽ lại Bước 3');
  assert.match(notify, /if \(S\.stage === 4\)/, 'thông báo xóa logo chỉ bật khi đang ở Bước 4');
});

test('hết lượt Firefly: banner gọn, có nút × tắt, đổi Gmail làm lại đúng ảnh chưa Chọn', () => {
  assert.match(src, /Firefly hết \$\{\+\(S\.flow\?\.fireflyDaily\?\.limit \|\| 3\)\} lượt\/ngày tại <b>/, 'phải báo tên ảnh đang bị chặn');
  assert.match(src, /làm lại đúng ảnh này; ảnh đã bấm Chọn giữ nguyên/);
  assert.ok(src.includes('data-act="dismissquota" data-key="${esc(quotaKey)}"') && src.includes('aria-label="Tắt thông báo" data-tip="Tắt">×</button>'), 'banner có dấu × để tắt');
  assert.match(src, /if \(a === 'dismissquota'\) \{ S\.quotaHidden\.add\(b\.dataset\.key\); refresh\(\); return; \}/, 'tắt xong không hiện lại khi poll');
  assert.match(src, /quotaHidden: new Set\(\)/, 'có bộ nhớ các banner đã tắt');
  assert.match(src, /if \(S\.stage === 4\) return JSON\.stringify\(\[[\s\S]{0,200}\[\.\.\.S\.quotaHidden\]\.join\(','\)/, 'signature Bước 4 đổi khi tắt banner');
  assert.match(src, /data-act="gmailchange" data-sid="\$\{s\.id\}"[\s\S]{0,180}>Đổi Gmail<\/span><\/button>/, 'nút đổi Gmail nằm trên thẻ ảnh Bước 4, cùng kiểu .tb');
  assert.ok(!src.includes('ảnh đã tạo, chờ tải lại'), 'không hứa tải lại ảnh cũ');
});

test('nhật ký cũ còn chữ Ổn thì đổi thành Chọn ngay trên giao diện Bước 4', () => {
  assert.ok(src.includes("const logoText = (s) => String(s ?? '').replace(/Ổn/g, 'Chọn');"), 'có hàm sửa chữ cũ khi hiển thị');
  assert.ok(src.includes('logoText(lr?.note)'), 'câu trạng thái đi qua logoText');
  assert.ok(src.includes('logoText(lastPhase.note)'), 'tiến trình Firefly đi qua logoText');
  assert.ok(src.includes('logoText(lr.error)'), 'tooltip lỗi đi qua logoText');
});

test('dấu × của thông báo nằm sát mép phải, không dính sau chữ hay lên góc trên', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  assert.ok(src.includes('giữ nguyên.</span>${closeQuota}</div>'), '× nằm NGOÀI <span> chữ để đẩy ra cuối dòng');
  assert.match(css, /\.banner\.quota\{font-size:12px;display:flex;align-items:flex-start;gap:8px;line-height:1\.5;padding-right:10px\}/, 'banner dạng flex để × sát mép phải');
  assert.match(css, /\.banner\.quota>span\{flex:1;min-width:0\}/, 'chữ chiếm hết chỗ, × bị đẩy ra phải');
  assert.match(css, /\.banner\.quota \.tclose\{margin-left:auto;flex:none\}/, '× có margin-left:auto');
  assert.ok(src.includes('Tiếp tục chạy</button><button class="tclose" data-act="dismisspause"'), '× của banner tạm dừng cũng nằm cuối hàng nút');
  assert.match(css, /#pauseBanner \.tclose\{position:static;order:99;margin-left:auto;flex:none\}/, 'không còn ép × lên góc phải');
});

test('manifest raw bị cache cũ vẫn lấy bản mới từ GitHub Releases API', async () => {
  const calls = [];
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      calls.push(url);
      if (url.includes('api.github.com')) {
        return jsonResponse({
          tag_name: 'v1.1.30',
          body: '- Bản mới',
          assets: [
            { name: 'Flow.Lookbook.Setup.1.1.30.exe.blockmap', browser_download_url: 'https://x/blockmap' },
            { name: 'Flow.Lookbook.Setup.1.1.30.exe', browser_download_url: 'https://github.com/anhtuanta1234-bit/FlowLookbook/releases/download/v1.1.30/Flow.Lookbook.Setup.1.1.30.exe' },
          ],
        });
      }
      return jsonResponse({ version: '1.1.29', url: 'https://github.com/old.exe', notes: 'cũ' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.30');
  assert.match(info.url, /Flow\.Lookbook\.Setup\.1\.1\.30\.exe$/);
  assert.equal(calls.length, 2, 'Phải hỏi thêm GitHub API khi manifest không có bản mới');
});

test('raw cache trả bản cũ nhưng vẫn cao hơn current thì API vẫn thắng', async () => {
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) return jsonResponse({ tag_name: 'v1.1.31', assets: [{ name: 'setup.exe', browser_download_url: 'https://github.com/new.exe' }] });
      return jsonResponse({ version: '1.1.30', url: 'https://github.com/stale.exe', notes: 'cache cũ' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.31', 'Không được tin manifest cache dù nó cũng "mới hơn" current');
});

test('API lỗi/rate-limit thì vẫn dùng manifest mới nhất', async () => {
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) throw new Error('rate limit');
      return jsonResponse({ version: '1.1.31', url: 'https://github.com/new.exe', notes: 'mới' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.31');
});

test('GitHub API lỗi thì vẫn dùng manifest đang có, không báo lỗi giả', async () => {
  const h = updateHelpers(
    'https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json',
    '1.1.29',
    async (url) => {
      if (url.includes('api.github.com')) throw new Error('rate limit');
      return jsonResponse({ version: '1.1.29', url: 'https://github.com/old.exe', notes: 'cũ' });
    },
  );
  const info = await h.readUpdateInfo();
  assert.equal(info.version, '1.1.29');
  assert.equal(info.uncertain, true, 'Không được tự tin báo "đã mới nhất" khi API lỗi và raw có thể bị cache cũ');
});

test('checkUpdate khi không chắc chắn thì hiện cảnh báo thay vì báo đã mới nhất', () => {
  assert.match(src, /if \(info\.uncertain\) toast\('Chưa xác nhận được bản mới nhất/, 'Phải báo không xác nhận được khi API lỗi');
  assert.match(src, /else if \(manual\) toast\('Bạn đang dùng phiên bản mới nhất/, 'Chỉ báo đã mới nhất khi chắc chắn');
});

test('đổi raw URL thành đúng GitHub Releases API cùng repo', () => {
  const h = updateHelpers('', '1.1.29', async () => jsonResponse({}));
  assert.equal(
    h.latestReleaseApiUrl('https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json'),
    'https://api.github.com/repos/anhtuanta1234-bit/FlowLookbook/releases/latest',
  );
});

test('thanh bước có Bước 4 nối ngay sau Bước 3 và chỉ xong khi ảnh sạch có đủ', () => {
  assert.match(src, /\{ n: 4, t: 'Xóa logo'/, 'Phải có tab Bước 4');
  assert.match(src, /if \(!p\.cleaned \|\| !scenes\.length\) return false;/, 'Chưa dọn xong thì Bước 4 chưa xong');
  assert.match(src, /scenes\.every\(\(s\) => \['approved', 'skipped'\]\.includes\(s\.logoRemoval\?\.status\)\)/, 'Mọi cảnh phải có ảnh sạch hoặc được bỏ qua');
  assert.match(src, /S\.stage === 4 \? \[\] : p\[PK\[S\.stage\]\]\.runs/, 'Bước 4 không đọc runs của Flow');
});

test('giao diện Bước 4 hiện đúng chuỗi thao tác Firefly và nhật ký theo thời gian thực', () => {
  assert.match(src, /const LOGO_FLOW_STEPS = \[[\s\S]*?Cắt ảnh về khung 9:16[\s\S]*?Chấm sửa và xóa[\s\S]*?Mở “Cài đặt cọ”, chọn cỡ 14[\s\S]*?Chấm đúng 1 lần vào vùng logo[\s\S]*?Bấm “Xóa” trên Firefly[\s\S]*?Tool bấm “Tải xuống”, bạn bấm “Chọn”/);
  assert.match(src, /id="logoPhaseList"/, 'Phải có danh sách tiến trình Firefly');
  assert.match(src, /id="logoNow"/, 'Phải hiện thao tác đang chạy');
  assert.match(src, /function patchLogoPhases\(\)/, 'Tiến trình phải cập nhật khi server gửi phase mới');
  assert.match(src, /\(lr\.phases \|\| \[\]\)\.slice\(-1\)\[0\]/, 'Mỗi cảnh chỉ hiện 1 bước mới nhất');
  assert.match(src, /<div class="phaselist" data-phase-sid="\$\{s\.id\}">\$\{phase\}<\/div>/, 'Tiến trình nằm trong ô Firefly, không còn dưới cả 2 ô');
  assert.match(src, /data-act="logook"[\s\S]{0,180}>Chọn<\/span><\/button>/, 'Bấm Chọn mới lưu ảnh sạch');
  assert.match(src, /data-act="savefireflycfg"/, 'Bước 4 phải có nút Lưu cọ/mask ngay trong bước');
});

test('Bước 4: hàng chờ chỉ ở khung trái, khung phải 2 ô ảnh với Firefly chiếu trực tiếp', () => {
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  const scene = src.slice(src.indexOf('const LOGO_LIVE_STATUS ='), src.indexOf('function logoResultsHtml('));
  const results = src.slice(src.indexOf('function logoResultsHtml('), src.indexOf('const runSig'));
  assert.match(src, /function logoQueueRows\(p\)/, 'Phải tính thứ tự ảnh chưa xong');
  assert.match(src, /<span class="qno">\$\{x\.no\}<\/span>/, 'Mỗi cảnh phải hiện số thứ tự trong hàng chời');
  assert.match(src, /chờ hàng đợi/, 'Ảnh chưa tới lượt phải hiện rõ là chờ hàng đợi');
  assert.match(ctl, /\$\{logoQueueHtml\(p\)\}/, 'Hàng chờ nằm trong khung trái');
  assert.match(ctl, /<summary>Hướng dẫn<\/summary>/, 'Giữ mục Hướng dẫn trong khung trái');
  assert.ok(!/Ảnh Bước 4/.test(ctl), 'Bỏ ô ảnh thừa bên dưới Hướng dẫn trong khung trái');
  assert.ok(!/logoQueueHtml\(p\)/.test(results), 'Khung phải không còn hàng chờ trùng');
  assert.match(scene, /class="logosplit"/, 'Mỗi cảnh chia ô ảnh');
  assert.match(scene, /class="logocell clean/, 'Có thêm ô ảnh đã xóa logo');
  assert.match(scene, /data-clean-sid="\$\{s\.id\}"/, 'Ô ảnh sạch cập nhật theo từng cảnh');
  assert.match(scene, /Ảnh đã xóa logo<\/div>/, 'Ô thứ 3 có nhãn gọn, không chữ thừa');
  assert.ok(!/so sánh với ảnh gốc/.test(scene), 'Bỏ dòng “so sánh với ảnh gốc” dưới ô ảnh sạch');
  assert.match(scene, /class="logocell clean[^"]*"[^>]*>[\s\S]{0,900}\$\{actions\}/, '2 nút “Làm lại / Chọn” nằm ngay dưới ảnh đã xóa logo');
  assert.ok(!/chưa có ảnh sạch|sẵn sàng — nếu ổn|data-clean-status/.test(scene), 'bỏ hết chữ trạng thái ảnh sạch');
  assert.match(scene, /Ảnh gốc <span>chưa xóa logo<\/span>/, 'Ô 1 là ảnh gốc chưa xóa logo');
  assert.match(scene, /data-preview-sid=/, 'Ô 2 chiếu ảnh Firefly');
  assert.ok(!/data-live-dot=/.test(scene), 'Không còn chấm/nút riêng ở góc ô Firefly');
  assert.match(scene, /class="chip livechip/, 'Chấm nằm ngay trong chữ “chiếu trực tiếp”');
  assert.match(scene, /data-live-chip="\$\{s\.id\}"/, 'Chữ “chiếu trực tiếp” đổi màu cùng chấm');
  assert.match(src, /function setLiveDot\(id, on\)/, 'Chấm bật/tắt theo trạng thái chiếu');
  assert.match(src, /\[data-live-chip="\$\{id\}"\]/, 'Chữ chip bật/tắt cùng chấm');
  assert.match(src, /setLiveDot\(s\.id, true\)/, 'Đang chiếu thì chấm xanh');
  assert.match(src, /setLiveDot\(s\.id, false\)/, 'Dừng chiếu thì chấm tắt');
  assert.match(src, /S\.preview\.has\(s\.id\)\) \{ setLiveDot\(s\.id, false\)/, 'Chờ Chọn thì đóng băng và tắt chấm');
  assert.match(scene, /data-live-status=/, 'Có dòng trạng thái trực tiếp');
  assert.ok(!/live-note/.test(scene), 'Bỏ dòng note/error dài (kiểu hết lượt free) bên dưới 2 khung');
  assert.match(scene, /<div class="meta">[\s\S]*?<span class="grow"><\/span><button class="btn sm xs danger" data-act="rmscene" data-sid="\$\{s\.id\}"/, 'Nút Xóa nằm góc phải trên cùng của mỗi cảnh');

  assert.match(src, /preparing: \{ text: 'đang chạy'/, 'Đang chạy thì báo đúng “đang chạy”');
  assert.match(src, /waiting_ok: \{ text: 'đã xóa xong · chờ Chọn'/, 'Xong thì báo đã xóa xong, chờ Chọn');
  assert.match(src, /\/api\/firefly\/preview/, 'Có endpoint chụp Firefly lên app');
  assert.match(src, /function patchFireflyPreviews\(\)/, 'Ảnh Firefly được làm mới định kỳ');
  assert.match(src, /setInterval\(\(\) => \{ patchFireflyPreviews\(\)\.catch\(\(\) => \{\}\); \}, 500\)/, 'Poll 500ms để chiếu trực tiếp mượt, không delay');
  assert.match(src, /status === 'waiting_ok' && S\.preview\.has\(s\.id\)\) \{ setLiveDot\(s\.id, false\); continue; \}/, 'Xong mà chưa bấm Chọn thì đóng băng khung hình, không chụp lại gây nháy');
  assert.match(src, /Firefly hết \$\{\+\(S\.flow\?\.fireflyDaily\?\.limit \|\| 3\)\} lượt\/ngày tại <b>\$\{esc\(quotaScene\.label \|\| `Cảnh \$\{quotaIndex \+ 1\}`\)\}<\/b>/, 'Banner gọn nhưng vẫn nói tên ảnh hết lượt');
  assert.match(src, /ảnh \$\{String\(quotaNo\)\.padStart\(2, '0'\)\}/, 'Banner giữ số ảnh để biết đang chỗ nào');
  assert.match(src, /Đổi Gmail rồi bấm “Tiếp tục”[\s\S]{0,80}làm lại đúng ảnh này; ảnh đã bấm Chọn giữ nguyên/, 'Banner hướng dẫn đúng 2 nút mới và làm lại đúng ảnh chưa Chọn');
  assert.ok(!/tab đã đóng, chờ Gmail mới/.test(src), 'Bỏ đoạn dài về tab đã đóng');
  assert.ok(!/Đổi Gmail khác để tiếp tục/.test(src), 'Bỏ nhãn nút cũ trong banner');
  assert.match(src, /Free \$\{\+\(S\.flow\?\.fireflyDaily\?\.count \|\| 0\)\}/, 'Bước 4 phải hiện số lượt đã dùng');
  assert.match(src, /Firefly: hết \$\{limit\} lượt free\/ngày — đổi mail/, 'Chip Firefly phải nhắc đổi mail khi hết lượt');
  assert.match(src, /id="fBrush"[^>]*min="5"[^>]*max="128"/, 'Bước 4 phải có ô cỡ cọ');
  assert.match(src, /logoBrushSize: val\('fBrush', 16\)/, 'Cỡ cọ phải được lưu qua /api/config');
});

test('khung Firefly bên trái cập nhật trạng thái từng cảnh theo SSE, không đóng băng ở chữ cũ', () => {
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  const refreshFn = src.slice(src.indexOf('function refresh()'), src.indexOf('// ---------- khung ảnh tham chiếu'));
  assert.match(ctl, /<div id="logoQueue">\$\{logoQueueHtml\(p\)\}<\/div>/, 'hàng chờ có id để tự patch');
  assert.match(src, /function patchLogoQueue\(\)[\s\S]*?\$\('#logoQueue'\)[\s\S]*?logoQueueHtml\(S\.p\)/, 'patch nội dung hàng chờ từ dữ liệu mới');
  assert.match(refreshFn, /if \(S\.stage === 4\) \{ patchLogoQueue\(\); syncFireflyDaily\(\); \}/, 'mỗi sự kiện SSE ở Bước 4 đều vẽ lại khung trái');
  assert.match(src, /const LOGO_STATUS = \{/, 'một bảng trạng thái dùng chung cho khung trái và phải');
  assert.match(src, /retrying: \{ text: 'đang làm lại'/, 'bấm Làm lại hiện đúng đang làm lại');
  assert.match(src, /queued: \{ text: 'chờ hàng đợi'/, 'chưa tới lượt hiện chờ hàng đợi');
  assert.match(src, /preparing: \{ text: 'đang chạy'/, 'đang chạy thì hiện đang chạy, không phải chờ/làm lại');
  assert.match(src, /downloading: \{ text: 'đang chạy'/, 'đang tải ảnh sạch vẫn là đang chạy');
  assert.match(src, /error: \{ text: 'lỗi'/, 'lỗi thì hiện lỗi');
  assert.match(src, /quota_blocked: \{ text: 'hết lượt'/, 'hết free thì hiện hết lượt');
  assert.match(refreshFn, /renderSlots\(\); renderResults\(\); patchLogoPhases\(\);/, 'khung phải vẫn cập nhật như cũ');
});

test('ảnh xem trước tự thử lại khi chưa tải được, không bắt bấm Chọn lại', () => {
  assert.ok(src.includes('const preparedRetry = new Map()'), 'có bộ đếm thử lại theo cảnh');
  assert.match(src, /el\.naturalWidth > 0\) \{ preparedRetry\.delete\(s\.id\); continue; \}/, 'ảnh lên rồi thì thôi không thử nữa');
  assert.match(src, /if \(n >= 8\) continue/, 'giới hạn số lần thử, không gọi endpoint vô hạn');
  assert.match(src, /`\/api\/firefly\/prepared\?projectId=\$\{encodeURIComponent\(S\.p\.id\)\}&sceneId=\$\{encodeURIComponent\(s\.id\)\}&t=\$\{Date\.now\(\)\}`/, 'thử lại với cache-buster mới');
});

test('nút Xóa cảnh đang chờ/chạy Firefly hỏi xác nhận rồi mới hủy lượt đó', () => {
  const rmscene = src.slice(src.indexOf("if (a === 'rmscene') {"), src.indexOf("if (a === 'retrysave')"));
  assert.match(rmscene, /\['queued', 'retrying', 'preparing', 'downloading', 'waiting_ok'\]\.includes\(st\)/, 'cảnh đang chờ/chạy/chờ Chọn thì hỏi trước');
  assert.match(rmscene, /confirm\('Cảnh này đang xóa logo trên Firefly/, 'báo rõ sẽ hủy lượt Firefly');
  assert.match(rmscene, /return api\('DELETE', `\/api\/projects\/\$\{p\.id\}\/scenes\/\$\{sid\}`\)/, 'đồng ý thì gửi DELETE như thường');
});

test('chip Free tăng ngay 0/3 → 1/3 → 2/3 sau mỗi ảnh Firefly xong', () => {
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  assert.match(ctl, /id="fireflyDailyChip"[^>]*>Free \$\{\+\(S\.flow\?\.fireflyDaily\?\.count \|\| 0\)\}\/\$\{\+\(S\.flow\?\.fireflyDaily\?\.limit \|\| 3\)\}/, 'chip Free có id để tự cập nhật, vẫn hiện số từ /api/flow/status');
  assert.match(src, /function syncFireflyDaily\(\)[\s\S]*?\$\('#fireflyDailyChip'\)[\s\S]*?const text = `Free \$\{used\}\/\$\{limit\}`[\s\S]*?el\.textContent = text/, 'đọc count/limit rồi đổi ngay chữ trên chip');
  assert.match(src, /function syncFireflyChip\(\) \{\s*syncFireflyDaily\(\);/, 'mỗi lần vẽ chip Firefly cũng cập nhật chip Free');
  assert.match(src, /if \(S\.stage === 4\) refreshFlow\(\)/, 'sự kiện project ở Bước 4 hỏi lại status ngay, không đợi poll 6s');
});

test('hàng chờ Bước 4 hiện đúng số ảnh 01, 02, 03 đã đặt từ Bước 3', () => {
  assert.match(src, /no: \+\(s\.order \|\| i \+ 1\)/, 'dùng số thứ tự thật của ảnh, không đánh số lại từ 1');
  assert.match(src, /sort\(\(a, b\) => a\.no - b\.no\)/, 'hàng chờ đi theo thứ tự ảnh');
  assert.ok(src.includes('Ảnh ${String(+(s.order || i + 1)).padStart(2, \'0\')}'), 'thẻ ảnh hiện đúng số ảnh');
  assert.ok(src.includes('01, 02, 03'), 'giải thích rõ cách đánh số ảnh');
  assert.match(src, /Thư mục ảnh đã xóa logo/, 'nút mở thư mục đổi tên đúng ý');
  assert.match(src, /output\/&lt;project&gt;\/anhdaxoalogo\//, 'hướng dẫn đúng đường dẫn output/<dự án>/anhdaxoalogo');
  assert.match(src, /ảnh \$\{String\(quotaNo\)\.padStart\(2, '0'\)\}/, 'banner gọn vẫn nói rõ đang chặn ảnh số mấy');
});

test('Bước 4 gọn hơn: đúng 2 nút .tb “Làm lại / Chọn” giống Bước 1-3, không nút trùng', () => {
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  const scene = src.slice(src.indexOf('const LOGO_LIVE_STATUS ='), src.indexOf('function logoResultsHtml('));
  const results = src.slice(src.indexOf('function logoResultsHtml('), src.indexOf('const runSig'));
  assert.ok(!/data-act="fireflyopen"/.test(ctl), 'thanh điều khiển không còn nút Firefly trùng');
  assert.ok(!/data-act="logoresume"/.test(ctl), 'thanh điều khiển không còn nút tiếp tục trùng');
  assert.match(ctl, /<details class="lite-details">/, 'hướng dẫn dài được gập lại');
  assert.match(ctl, /data-act="fireflyreveal"[\s\S]{0,160}>Kết nối Firefly<\/button>/, 'nút Firefly ghi rõ “Kết nối Firefly”');
  assert.match(scene, /class="logocell clean[^"]*"[^>]*>[\s\S]{0,900}\$\{actions\}/, 'nút nằm chung hàng ngay dưới ảnh sạch');
  assert.match(scene, /<div class="rc-act clean-act">\$\{redoBtn\}\$\{chooseBtn\}<\/div>/, 'dùng chung .rc-act với Bước 1-3');
  assert.match(scene, /data-act="logook"[\s\S]{0,180}>Chọn<\/span><\/button>/, 'nút chính là Chọn');
  assert.match(scene, /data-act="logoretry"[\s\S]{0,180}>Làm lại<\/span><\/button>/, 'nút bên trái là Làm lại, cùng .tb');
  assert.match(scene, /class="tb ok on" aria-pressed="true"[\s\S]{0,180}>Đã chọn<\/span><\/button>/, 'đã duyệt thì hiện Đã chọn như Bước 1-3');
  assert.match(scene, /data-act="gmailchange"[\s\S]{0,180}>Đổi Gmail<\/span><\/button>/, 'lúc hết lượt nút trái thành Đổi Gmail');
  assert.match(scene, /data-act="logoresume"[\s\S]{0,180}>Tiếp tục<\/span><\/button>/, 'sau khi đổi Gmail thì nút thành Tiếp tục');
  assert.match(scene, /class="tb extra" data-act="fireflyreveal"/, 'Xem Firefly dời xuống chân ô, không nằm trong hàng 2 nút');
  assert.match(scene, /class="tb extra" data-act="logoskip"/, 'Bỏ qua dời xuống chân ô, không nằm trong hàng 2 nút');
  assert.ok(!/class="btn sm primary"/.test(scene), 'không còn nút btn sm primary kiểu cũ dưới ảnh sạch');
  assert.ok(!/data-act="fireflyopen"/.test(results), 'kết quả Bước 4 không còn nút mở Firefly trùng');
  assert.ok(!/data-act="fireflyreveal"[\s\S]{0,160}>Firefly<\/button>/.test(results), 'kết quả Bước 4 không còn nút Firefly trùng');
});

test('Bước 4: nút Chạy tất cả xếp từng ảnh một và hiện trạng thái kết nối Firefly', () => {
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  assert.match(ctl, /data-act="logoall"/, 'Bước 4 có nút Chạy tất cả');
  assert.match(ctl, />Chạy tất cả<\/button>/, 'Nút ghi đúng chữ Chạy tất cả');
  assert.match(ctl, /mở từng tab Firefly một, xong ảnh 1 mới mở ảnh 2[\s\S]{0,260}làm lại đúng ảnh chưa bấm Chọn, ảnh đã Chọn giữ nguyên/, 'tip nói rõ mở từng tab một, 3 ảnh/mail và làm lại đúng ảnh chưa Chọn');
  assert.match(ctl, /id="fireflyStatus"/, 'Khung trái có chip trạng thái Firefly');
  assert.match(src, /a === 'logoall'/, 'Có handler cho nút Chạy tất cả');
  assert.match(src, /\/logo-remove\/run-all/, 'Gọi đúng endpoint xếp hàng tất cả');
  assert.match(src, /const fs = S\.flow\.fireflyStatus \|\| \{\}/, 'Chip Firefly lấy trạng thái từ server');
  assert.match(src, /'Firefly: đã kết nối'/, 'Hiện trạng thái đã kết nối');
});

test('Bước 4: ảnh chiếu cao bằng ảnh gốc, nguyên tab không cắt/kéo giãn', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  assert.match(css, /\.logosplit\{--shot-w:210px;--shot-h:calc\(\(var\(--shot-w\) - 2px\) \* 16 \/ 9\);display:grid;grid-template-columns:minmax\(0,210px\) minmax\(0,1fr\) minmax\(0,210px\)/, 'ảnh gốc và ảnh sạch 2 cột cùng 210px, Firefly chiếm giữa');
  assert.match(css, /\.logocell img\{display:block;width:100%;aspect-ratio:9\/16;object-fit:cover;background:var\(--bg2\);max-width:var\(--shot-w\);margin-inline:auto\}/, 'ảnh gốc khung 9:16 giới hạn bởi --shot-w');
  assert.match(css, /\.logocell\.firefly img\{display:block;width:100%;max-width:none;height:var\(--shot-h\);aspect-ratio:auto;object-fit:contain/, 'chiếu nguyên tab nhưng CAO BẰNG ảnh gốc, contain nên không cắt/kéo giãn');
  assert.match(css, /--shot-h:calc\(\(var\(--shot-w\) - 2px\) \* 16 \/ 9\)/, '--shot-h trừ 2px viền → cao bằng đúng ảnh gốc');
  assert.ok(!/\.logocell\.firefly img\{[^}]*object-fit:(fill|cover)/.test(css), 'không kéo giãn/cắt canvas Firefly');
  assert.match(css, /\.logocell\.clean img\{[^}]*max-width:var\(--shot-w\);margin-inline:auto;height:auto;aspect-ratio:9\/16;object-fit:cover\}/, 'ảnh sạch cùng chiều rộng/cao 9:16 với ảnh gốc');
  assert.match(css, /grid-template-columns:minmax\(0,210px\) minmax\(0,1fr\) minmax\(0,210px\)/, '2 cột ảnh cố định 210px → mọi cảnh cùng kích thước');
  assert.ok(!/\.logocell\.clean img\{[^}]*max-width:none/.test(css), 'không để ảnh sạch rộng/cao hơn ảnh gốc');
  assert.match(css, /\.logocell\.clean \.rc-act\{[^}]*margin:0;[^}]*border-top:1px solid var\(--line\)/, 'hàng nút dùng chung .rc-act, nằm sát dưới ảnh sạch');
  assert.ok(!/\.logocell img\{[^}]*max-height/.test(css), 'không được cắt ảnh gốc bằng max-height');
  assert.match(css, /\.logocell-lab \.livechip\.on::before\{[^}]*background:var\(--ok\)[^}]*animation:pulse 1\.6s ease-out infinite/, 'chấm TRONG chữ “chiếu trực tiếp” nhấp nháy xanh y hệt chip Flow');
  assert.match(css, /\.logocell-lab \.livechip\.on\{[^}]*color:var\(--ok\)/, 'chữ “chiếu trực tiếp” cũng chuyển xanh');
  assert.ok(!/\.livedot\b/.test(css), 'không còn chấm/nút riêng ở góc ô Firefly');
});

test('thanh “Xóa logo”: không số 4, bật tính năng là vòng tích + chữ LUÔN xanh như Ghép cảnh thật', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  assert.match(src, /\{ n: 4, t: 'Xóa logo', tip: 'Làm sau khi ghép ảnh thật/);
  assert.match(src, /s\.n === 4 \? 'logo-step' : ''/);
  assert.match(src, /s\.n === 4 && S\.cfg\?\.removeLogoEnabled \? 'logo-on' : ''/, 'bật xóa logo thì gắn cờ luôn xanh');
  assert.match(src, /const num = s\.n === 4\s*\? `<span class="n">\$\{locked \? I\.lock : '✓'\}<\/span>`/, 'bước 4 chỉ có tích/khóa, không có số 4');
  assert.match(css, /\.step\.logo-step\.logo-on:not\(\.locked\),\.step\.logo-step\.active,\.step\.logo-step\.done\{color:var\(--ok\)\}/, 'chữ xanh ngay cả khi đang đứng ở bước 3');
  assert.match(css, /\.step\.logo-step\.logo-on:not\(\.locked\) \.n,\.step\.logo-step\.active \.n,\.step\.logo-step\.done \.n\{background:var\(--ok\);color:#fff\}/, 'vòng tích xanh');
});

test('chiếu từ lúc tạo tab tới lúc Firefly báo xong, ảnh mới giải mã xong mới thay để không giật', () => {
  assert.match(src, /\['queued', 'retrying', 'preparing', 'downloading', 'waiting_ok', 'quota_blocked'\]/, 'ảnh đang chờ/làm lại/tạo tab cũng nằm trong vòng chiếu');
  assert.match(src, /status === 'waiting_ok' && S\.preview\.has\(s\.id\)/, 'đóng băng khung đúng lúc Firefly đã hoàn tất');
  assert.match(src, /async function paintPreview\(sid, el, data\)/);
  assert.match(src, /const im = new Image\(\);\s*im\.src = data;\s*try \{ await im\.decode\(\); \}/, 'giải mã khung mới trước khi gán vào ô chiếu');
  assert.match(src, /await paintPreview\(s\.id, el, out\.data\)/);
  assert.match(src, /fireflyPreviewTimer = setInterval\(\(\) => \{ patchFireflyPreviews\(\)\.catch\(\(\) => \{\}\); \}, 500\)/);
});

test('dọn xong Bước 3 thì chuyển hẳn sang Bước 4, không cần bấm tab', () => {
  assert.match(src, /async function showStep4IfReady\(\)/);
  assert.match(src, /fresh\.stage === 4\) \{\s*S\.p = fresh; S\.stage = 4;/, 'Phải đổi stage trên giao diện');
  assert.match(src, /return showStep4IfReady\(\);/, 'finish phải gọi hàm chuyển bước');
  assert.match(src, /toast\(`Đã tải\/dọn xong \$\{r\.cleaned\} dự án[\s\S]{0,220}showStep4IfReady\(\)/, 'clean-all cũng phải chuyển bước');
});

test('header bỏ nút Tải lại, chỉ chuột phải mới tải lại giao diện', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(!/id="btnReload"/.test(html), 'header không còn nút Tải lại');
  assert.ok(!/\$\('#btnReload'\)\.onclick/.test(src), 'app.js không còn gán nút Tải lại');
  assert.match(src, /document\.addEventListener\('contextmenu'/, 'vẫn giữ menu chuột phải');
  assert.match(src, /<span>Tải lại giao diện<\/span>/, 'menu chuột phải có mục Tải lại giao diện');
});

test('chip Firefly: bấm Kết nối là cập nhật ngay, chưa kết nối → đã kết nối + chấm xanh nhấp nháy', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const ffSrc = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'firefly.js'), 'utf8');
  assert.match(src, /function syncFireflyChip\(\)/);
  assert.match(src, /ff\.className = connected && !quota \? 'chip ok' : 'chip warn'/);
  assert.match(src, /: connected \? 'Firefly: đã kết nối' : 'Firefly: chưa kết nối'/);
  assert.match(src, /const quota = !!S\.flow\.fireflyQuotaPaused \|\| used >= limit \|\| !!S\.fireflyQuota\?\.quota;/, 'Chip cũng tin kết quả đọc trực tiếp trang Firefly');
  assert.match(src, /const used = Math\.max\(0, Number\(d\.count\) \|\| 0\)/, 'Đọc số lượt free đã dùng hôm nay từ /api/flow/status');
  assert.match(src, /Firefly đang dùng lượt free hàng ngày và đã hết\. Vui lòng đổi mail khác rồi tiếp tục/, 'Tip chip Firefly dùng đúng chuỗi báo hết lượt');
  assert.match(src, /syncFireflyChip\(\); \/\/ vẽ lại chip đúng trạng thái/, 'vẽ lại Bước 4 phải cập nhật chip ngay');
  assert.match(src, /syncFireflyChip\(\);\s*const ob =/, 'refreshFlow cũng cập nhật chip');
  assert.match(src, /async function connectFirefly\(kind = 'reveal', checkDaily = true\)/);
  assert.match(src, /a === 'fireflyreveal'\) return connectFirefly\('reveal'\)/, 'bấm Kết nối Firefly thì hỏi lại trạng thái ngay');
  assert.match(src, /await api\('POST', '\/api\/firefly\/check-quota'\)/, 'bấm Kết nối thì gọi API đọc TRỰC TIẾP trang Firefly');
  assert.match(src, /S\.fireflyQuota = await api\('POST', '\/api\/firefly\/check-quota'\)/, 'lưu kết quả kiểm tra để chip và toast dùng lại');
  assert.match(src, /fireflyDailyNotice\(\);/, 'sau khi đọc xong thì báo ngay cho người dùng');
  assert.match(src, /Gmail này hôm nay đã hết \$\{limit\} lượt free\. Đổi Gmail khác rồi bấm “Tiếp tục”\./, 'Gmail hết lượt thì báo đúng thông báo');
  assert.match(src, /await connectFirefly\('reveal', false\); \/\/ đang đổi Gmail/, 'lúc đang đổi Gmail thì không nhắc lại lượt của mail cũ');
  assert.match(src, /for \(let i = 0; i < 12; i\+\+\)[\s\S]{0,220}await refreshFlow\(\)/, 'chờ tối đa ~12s cho chip lên xanh');
  assert.match(ffSrc, /port: c\.fireflyCdpPort/, 'Firefly status phải đọc cổng 9334 riêng');
  assert.ok(!/port: c\.cdpPort/.test(ffSrc), 'không đọc nhầm cổng Flow 9333');
  assert.match(css, /#fireflyStatus\.chip\.ok::before\{background:var\(--ok\);animation:pulse 1\.6s ease-out infinite\}/, 'chấm Firefly cũng nhấp nháy kiểu pulse như chip Flow');
  const ctl = src.slice(src.indexOf('function buildLogoCtl('), src.indexOf('function buildCtl()'));
  assert.match(ctl, /id="fireflyStatus"[\s\S]{0,260}data-act="fireflyreveal"/, 'chip và nút Kết nối Firefly nằm cạnh nhau');
});

test('Kết nối Firefly: Gmail đã hết lượt ở ngoài tool vẫn báo, không tin bộ đếm 0/3', () => {
  assert.ok(src.includes('if (!checkDaily) S.fireflyQuota = null;'), 'đổi Gmail thì xóa kết quả của mail cũ');
  assert.match(src, /if \(!!live\?\.quota \|\| !!S\.flow\.fireflyQuotaPaused \|\| used >= limit\)/, 'toast ưu tiên kết quả đọc từ trang Firefly');
  assert.match(src, /Trang Firefly báo hết lượt là chuẩn nhất/, 'có giải thích vì sao không tin bộ đếm');
  assert.match(src, /Gmail này hôm nay đã hết \$\{limit\} lượt free\. Đổi Gmail khác rồi bấm “Tiếp tục”\./, 'đúng thông báo hết lượt');
  assert.match(src, /duration: 15000/, 'thông báo đủ lâu để thấy');
  assert.ok(src.includes('Gmail này hôm nay đã hết ${+(S.flow?.fireflyDaily?.limit || 3)} lượt free. Đổi Gmail rồi bấm “Tiếp tục”'), 'Bước 4 cũng hiện banner ngay sau khi bấm Kết nối');
  assert.match(src, /const liveKey = S\.fireflyQuota\?\.quota \? `live:/, 'banner live có khóa riêng để tắt bằng ×');
  assert.match(src, /S\.fireflyQuota\?\.quota \? \(S\.fireflyQuota\.checkedAt \|\| 0\) : ''/, 'signature đổi khi trạng thái live đổi');
  assert.match(src, /if \(S\.p && S\.stage === 4\) refresh\(\)/, 'cập nhật banner ngay, không đợi poll');
});

test('header Flow chỉ báo Flow; hết lượt Firefly không dán vào chip “Flow: đã kết nối”', () => {
  const flow = src.slice(src.indexOf("const el = $('#flowStatus')"), src.indexOf("const el = $('#flowStatus')") + 900);
  assert.match(flow, /Flow: đã kết nối · chạy nền/, 'chip Flow vẫn báo kết nối bình thường');
  assert.ok(!/fireflyQuotaPaused/.test(flow), 'chip Flow không đọc trạng thái hết lượt Firefly');
  assert.ok(!/lượt free\/ngày/.test(flow), 'chip Flow không hiện chữ hết lượt free/ngày');
  assert.match(flow, /syncFireflyChip\(\)/, 'chỉ gọi chip Firefly để báo riêng');
});

test('Chạy tất cả căn giữa, to hơn và vẫn mở từng tab Firefly một', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(css, /\.logo-runrow\{display:flex;justify-content:center/);
  assert.match(css, /\.logo-runrow \.btn\.primary\{min-width:168px;min-height:38px/);
  assert.match(src, /mở từng tab Firefly một, xong ảnh 1 mới mở ảnh 2/);
  assert.match(serverSrc, /if \(logoRemoveActive \|\| logoRemovePausedQuota \|\| anyLogoJobWaiting\(\)\) return;/, 'hàng đợi chặn không cho mở ảnh kế trước khi ảnh trước xong');
  assert.match(serverSrc, /logoRemoveActiveKey = logoJobKey\(next\.projectId, next\.sceneId\)/);
});

test('hết lượt Firefly: 2 bước Đổi Gmail → Tiếp tục', () => {
  assert.match(src, /function gmailReady\(sid\)/);
  assert.match(src, /function markGmailChanged\(sid\)/);
  assert.match(src, /function clearGmailChanged\(sid\)/);
  assert.match(src, /a === 'gmailchange'/);
  assert.match(src, /markGmailChanged\(b\.dataset\.sid\)/);
  assert.match(src, /await api\('POST', '\/api\/firefly\/reveal'\)/, 'bấm đổi Gmail thì mở Firefly ngay');
  assert.match(src, /clearGmailChanged\(b\.dataset\.sid\)/);
  assert.ok(!/data-live-dot/.test(src), 'không còn chấm riêng ở góc ô chiếu');
});

test('nút Xóa logo bật/tắt cùng kiểu nút Tự động, xong Bước 3 mới tự sang Bước 4', () => {
  assert.match(src, /b\.classList\.toggle\('primary', on\); \/\/ giống hệt nút “Tự động: Bật”/);
  assert.match(src, /ba\.classList\.toggle\('primary', on\)/, 'nút Tự động cũng dùng class primary');
  assert.match(src, /if \(ready\) \{\s*S\.stage = 4;/, 'bật sớm thì vẫn khóa, chỉ xong Bước 3 mới tự sang');
  assert.match(src, /await api\('PATCH', `\/api\/projects\/\$\{S\.p\.id\}`/, 'cập nhật stage đúng dự án đang mở');
});

test('nút thư mục ảnh đã xóa logo chỉ có ở Bước 4, cùng kiểu với Mở thư mục kết quả', () => {
  const folderBtn = /class="btn sm" data-act="openlogoout"[\s\S]{0,180}>\$\{I\.folder\} Thư mục ảnh đã xóa logo<\/button>/g;
  assert.equal((src.match(folderBtn) || []).length, 1, 'chỉ Bước 4 có nút thư mục ảnh đã xóa logo');
  assert.match(src, /class="btn sm" data-act="openout"[^>]*>\$\{I\.folder\} Mở thư mục kết quả<\/button>/);
});

test('sidebar thu gọn: “dự án 2” rút thành DA2, nằm gọn trong khung, không tràn ra ngoài', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  assert.match(src, /function shortProjectName\(name = ''\)/);
  assert.ok(src.includes(".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')"), 'bỏ dấu để “dự án” thành DUAN');
  assert.ok(src.includes('raw.match(/^(?:DUAN|DA)(\\d+)$/)'), '“dự án 2” và “DA2” cùng ra DA2');
  assert.ok(src.includes('return `DA${m[1]}`'));
  assert.ok(src.includes('<span class="pav-name">${esc(shortProjectName(p.name))}</span>'), 'ô thu gọn dùng tên rút gọn');
  assert.ok(!src.includes('<span class="pav-name">${esc(p.name'), 'không ghi hẳn tên dài ra ngoài khung');
  assert.match(css, /\.layout\.rail \.pav\{[^}]*min-width:0;overflow:hidden/, 'chữ dài không đẩy rộng ô');
  assert.match(css, /\.layout\.rail \.pav-name\{[^}]*max-width:100%;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css, /\.layout\.rail \.pitem\{[^}]*min-width:0;overflow:hidden/);
  assert.match(css, /\.layout\.rail \.pitem\.active\{background:var\(--accent-soft\);border-color:var\(--accent\)/, 'dự án đang mở nhấn mạnh khung ngoài');
  assert.match(css, /\.pitem \.nm\{font-weight:600/, 'mở rộng vẫn có tên dự án');
  assert.match(css, /\.pitem \.sub\{font-size:11\.5px/, 'mở rộng vẫn có dòng trạng thái');
  assert.match(html, /id="railAdd"/);
  assert.match(src, /\$\('#railAdd'\)\.onclick/);
});

test('dự án xếp lần lượt 1, 2, 3… theo số trong tên (DA1 trước DA2)', () => {
  assert.match(src, /const projectNumber = \(p\) =>/);
  assert.ok(src.includes("String(p?.name || '').match(/(\\d+)\\s*$/)"), 'lấy số ở cuối tên dự án');
  assert.match(src, /if \(na !== nb\) return na - nb;/);
  assert.match(src, /\(\(a\.createdAt \|\| 0\) - \(b\.createdAt \|\| 0\)\)/, 'không có số thì giữ thứ tự tạo');
  assert.match(src, /sortedProjects\(\)\.map\(\(p\) =>/, 'sidebar dùng danh sách đã sắp xếp');
});

test('chạy xóa logo giữ Chrome ở nền; chỉ nút Kết nối/Đổi Gmail mới mở cửa sổ', () => {
  const ff = fs.readFileSync(path.join(__dirname, '..', 'src', 'firefly.js'), 'utf8');
  const prepare = ff.slice(ff.indexOf('async function prepareScene('), ff.indexOf('async function downloadPrepared('));
  const download = ff.slice(ff.indexOf('async function downloadPrepared('), ff.indexOf('function hasSceneTab('));
  assert.ok(!/showWindow\(|bringToFront\(/.test(prepare), 'prepareScene không đẩy cửa sổ Firefly lên');
  assert.ok(!/showWindow\(|bringToFront\(/.test(download), 'tải ảnh sạch cũng không đẩy cửa sổ lên');
  assert.match(ff, /async function open\(\)/);
  assert.match(ff, /await chrome\.showWindow\(\)/, 'đăng nhập/đổi Gmail vẫn mở cửa sổ khi người dùng chủ động bấm');
});
