const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

test('xóa dự án cũng xóa luôn thư mục ảnh trong output (bulk và đơn lẻ)', () => {
  assert.match(src, /function removeProjectOutput\(p\)[\s\S]*?fs\.rmSync\(dir, \{ recursive: true, force: true \}\)/);
  const bulk = slice("app.post('/api/projects/bulk-delete'", "app.get('/api/projects/delete-capabilities'");
  assert.match(bulk, /removeProjectOutput\(p\)/, 'bulk-delete phải xóa thư mục kết quả trước khi remove()');
  const single = slice("app.delete('/api/projects/:id'", '// tải ảnh lên dự án');
  assert.match(single, /removeProjectOutput\(p\)/, 'xóa 1 dự án cũng phải xóa thư mục kết quả');
  assert.match(src, /logoRemoveQueue\[i\]\.projectId === projectId/, 'xóa dự án phải dọn cả hàng đợi xóa logo');
});

test('xóa cảnh Bước 4: chặn khi đang xóa logo và dọn tab Firefly của cảnh đó', () => {
  const del = slice("app.delete('/api/projects/:id/scenes/:sid'", '// ---------- chạy Flow ----------');
  assert.match(del, /\['queued', 'preparing', 'waiting_ok', 'downloading'\]\.includes\(ls\)/, 'đang chạy Firefly thì không được xóa cảnh');
  assert.match(del, /firefly\.discardScene\(\{ projectId: req\.params\.id, sceneId: req\.params\.sid \}\)/, 'xóa cảnh thì đóng luôn tab Firefly của cảnh đó');
});

test('chọn từng ảnh 2K không tự động sang Bước 4', () => {
  const save2k = slice('async function save2k(', "app.post('/api/projects/:id/retry-save'");
  assert.ok(!/ensureLogoRemovalState/.test(save2k), 'save2k không được tạo trạng thái xóa logo');
  assert.ok(!/queueLogoRemoval/.test(save2k), 'save2k không được đưa vào hàng đợi xóa logo');
});

test('tải hết ảnh về & dọn dẹp xong mới đánh dấu Bước 3 xong và khởi động Bước 4', () => {
  const cleanAll = slice("app.post('/api/projects/clean-all'", 'function projectHasActiveWork');
  assert.match(cleanAll, /fs\.rmSync\(tam, \{ recursive: true, force: true \}\)/);
  assert.match(cleanAll, /p\.cleaned = Date\.now\(\)/);
  assert.match(cleanAll, /ensureLogoRemovalState\(p\)/);
  assert.match(cleanAll, /queueLogoRemoval\(id\)/, 'phải đưa vào hàng đợi sau khi đã dọn xong');

  const finish = slice("app.post('/api/projects/:id/finish'", '// xem ảnh 2K đã lưu');
  assert.match(finish, /p\.cleaned = Date\.now\(\)/);
  assert.match(finish, /ensureLogoRemovalState\(p\)/);
});

test('Bước 4 bị khóa khi chưa tải hết ảnh, kể cả bấm làm lại / tiếp tục', () => {
  assert.match(src, /function shouldStartLogoRemoval\(p\)[\s\S]*?step3ReadyForLogo\(p\)/);
  assert.match(src, /if \(!p \|\| !shouldStartLogoRemoval\(p\)\) return null;/, 'prepare phải dùng chung cổng kiểm tra');
  const retry = slice("app.post('/api/projects/:id/logo-remove/retry'", "app.post('/api/projects/:id/logo-remove/skip'");
  assert.match(retry, /if \(!shouldStartLogoRemoval\(p\)\)/);
  assert.match(retry, /Hãy hoàn tất Bước 3/);
  const resume = slice("app.post('/api/projects/:id/logo-remove/resume'", 'app.post(\'/api/projects/:id/open-logo-output\'');
  assert.match(resume, /if \(!shouldStartLogoRemoval\(p\)\) return false;/);
});

test('hết lượt Firefly rồi đổi Gmail: làm lại đúng ảnh chưa Chọn, không đụng ảnh đã Chọn', () => {
  const prepare = slice('async function prepareLogoRemoval(', 'async function downloadLogoRemoval(');
  assert.match(prepare, /sc\.logoRemoval\.generated = false/, 'mỗi lần tạo mới phải reset mốc ảnh đã tạo');
  assert.match(prepare, /sc\.logoRemoval\.generated = true/, 'tạo xong thì đánh dấu có ảnh trên Firefly');

  const download = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(download, /Lỗi\/hết lượt\/tạm dừng: Firefly đóng tab ngay/, 'tải bị lỗi / hết lượt thì đóng tab, không giữ Chrome');
  assert.match(download, /sc\.logoRemoval\.generated = false/, 'tab đã đóng nên không còn ảnh để tải lại');

  const resume = slice("app.post('/api/projects/:id/logo-remove/resume'", 'app.post(\'/api/projects/:id/open-logo-output\'');
  assert.match(resume, /if \(!\['quota_blocked', 'waiting_ok'\]\.includes\(lr\?\.status\)\) continue/, 'ảnh hết lượt hoặc chưa Chọn đều làm lại');
  assert.match(resume, /logoResumeStatus\(lr\)/, 'chỉ xử lý đúng ảnh chưa Chọn');
  assert.match(resume, /lr\.status = next/);
});

test('hết free dạng màn hình nâng cấp trả phí cũng báo đúng dùng lượt free hàng ngày', () => {
  const prepare = slice('async function prepareLogoRemoval(', 'async function downloadLogoRemoval(');
  assert.ok(prepare.includes('nâng cấp.*(?:trả phí|premium|paid)'), 'nhận cả thông báo nâng cấp phí từ Firefly');
  assert.match(prepare, /Firefly đang dùng lượt free hàng ngày và đã hết\. Vui lòng đổi mail khác/);
  const download = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(download, /Firefly đang dùng lượt free hàng ngày và đã hết\. Vui lòng đổi mail khác/);
});

test('Firefly free tối đa 3 ảnh/ngày: đạt giới hạn thì dừng, báo đổi mail; đổi mail thì mở lượt mới', () => {
  const prepare = slice('async function prepareLogoRemoval(', 'async function downloadLogoRemoval(');
  assert.match(prepare, /const dailyBefore = cfg\.fireflyDailyFree\(\)/, 'trước khi mở tab phải kiểm tra lượt free');
  assert.match(prepare, /dailyBefore\.count >= dailyBefore\.limit/, 'đạt 3 ảnh thì không mở ảnh kế');
  assert.match(prepare, /pauseForDailyFreeLimit\(\)/, 'phải tạm dừng hàng chờ');
  assert.match(prepare, /cfg\.consumeFireflyDailyFree\(\)/, 'mỗi ảnh tạo xong tiêu 1 lượt');
  assert.match(prepare, /fireflyCountedOn/, 'làm lại cùng ảnh trong ngày không tính thêm lượt');
  assert.match(prepare, /blockNextQueuedForDaily\(p, sceneId\)/, 'đánh dấu ảnh kế để banner đổi mail hiện ngay');

  const resume = slice("app.post('/api/projects/:id/logo-remove/resume'", "app.post('/api/projects/:id/open-logo-output'");
  assert.match(resume, /cfg\.resetFireflyDailyFree\(\)/, 'đổi Gmail thì reset bộ đếm cho tài khoản mới');
  assert.match(resume, /lr\.fireflyCountedOn = ''/, 'ảnh tạo lại bằng Gmail mới phải được tính vào lượt mới');

  assert.match(src, /kind: 'daily'/, 'cờ dừng theo ngày tự mở lại qua nửa đêm');
  assert.match(src, /fireflyDaily: cfg\.fireflyDailyFree\(\)/, 'status phải trả số lượt đã dùng cho UI');
});

test('Firefly xong là tự tải ảnh sạch; bấm Chọn chỉ duyệt, không tải lại', () => {
  const prepare = slice('async function prepareLogoRemoval(', 'async function downloadLogoRemoval(');
  assert.match(prepare, /const cleanTarget = cur \? logoCleanTargetPath\(cur, sceneId\) : ''/, 'lấy đúng đường dẫn ảnh sạch của cảnh');
  assert.match(prepare, /autoClean = await firefly\.downloadPrepared\(/, 'vừa tạo xong thì tự bấm Tải xuống trên cùng tab Firefly');
  assert.match(prepare, /matchSize: prep\.imagePath && fs\.existsSync\(prep\.imagePath\) \? imageDimensions\(prep\.imagePath\) : null/, 'ảnh tự tải cũng ép đúng kích thước ảnh gốc');
  assert.match(prepare, /sc\.logoRemoval\.cleanFile = autoClean\?\.file \|\| ''/, 'lưu ảnh sạch vào trạng thái để app hiện ngay');
  assert.match(prepare, /Ảnh sạch đã sẵn sàng ở ô bên cạnh/, 'nhắc người dùng bấm Chọn');
  assert.match(prepare, /await firefly\.closeIdleNow\(\)/, 'hết lượt thì đóng Chrome ngay');

  const download = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(download, /matchSize: srcSizeForMatch/, 'bấm Chọn tải lại cũng ép đúng kích thước ảnh gốc');
  assert.match(download, /if \(sc\.logoRemoval\.cleanFile && fs\.existsSync\(sc\.logoRemoval\.cleanFile\)\)/, 'đã có ảnh sạch thì không tải lần 2');
  assert.match(download, /sc\.logoRemoval\.status = 'approved'/, 'bấm Chọn chỉ duyệt ảnh sạch');
  assert.match(download, /cleanupLogoOriginalsIfComplete\(p\)/, 'duyệt xong vẫn dọn ảnh gốc khi mọi cảnh xong');
});

test('nút Chạy tất cả: xếp mọi ảnh chưa xong theo thứ tự, không đụng ảnh cũ và không reset lượt free', () => {
  const all = slice("app.post('/api/projects/:id/logo-remove/run-all'", "app.post('/api/projects/:id/logo-remove/retry'");
  assert.match(all, /shouldStartLogoRemoval\(p\)/, 'phải xong Bước 3 mới chạy');
  assert.match(all, /ensureLogoRemovalState\(p\)/, 'tạo trạng thái chờ cho ảnh chưa có');
  assert.match(all, /sort\(\(a, b\) => sceneNo\(p, a\.id\) - sceneNo\(p, b\.id\)\)/, 'xếp theo đúng số ảnh 01, 02, 03');
  assert.match(all, /\['approved', 'skipped', 'waiting_ok', 'preparing', 'downloading', 'quota_blocked'\]/, 'không đưa lại ảnh đã xong / đang chạy / đang bị chặn');
  assert.match(all, /st === 'error' \|\| !st/, 'chỉ làm lại đúng ảnh lỗi');
  assert.ok(!/resetFireflyDailyFree/.test(all), 'Chạy tất cả KHÔNG tự mở thêm lượt free');
  assert.match(all, /await firefly\.background\(\)\.catch\(\(\) => \{\}\)/, 'bấm Chạy tất cả thì gập Chrome về nền ngay, không nổi lên màn hình');
  assert.match(all, /await queueLogoRemoval\(req\.params\.id\)/, 'dùng lại hàng đợi một ảnh một lần');
  assert.match(src, /app\.post\('\/api\/firefly\/background'/, 'có endpoint gập Firefly về nền');
  const status = slice("app.get('/api/flow/status'", "app.post('/api/auto'");
  assert.match(status, /fireflyStatus: await firefly\.status\(\)/, 'status phải trả trạng thái kết nối Firefly cho khung trái');
  const check = slice("app.post('/api/firefly/check-quota'", "app.post('/api/firefly/open'");
  assert.match(check, /firefly\.checkQuota\(\)/, 'nút Kết nối có endpoint đọc lượt free ngay trên trang Firefly');
  assert.match(check, /res\.json\(await firefly\.checkQuota\(\)\)/, 'trả kết quả.checked / .quota cho giao diện');
  assert.ok(!/fireflyDailyFree\(\)/.test(check), 'endpoint không dùng bộ đếm nội bộ làm nguồn duy nhất');
});

test('ảnh Firefly tải về lưu đúng vào output/<dự án>/anhdaxoalogo', () => {
  assert.match(src, /const LOGO_OUTPUT_DIRNAME = 'anhdaxoalogo'/, 'giữ nguyên tên thư mục anhdaxoalogo');
  assert.match(src, /function logoRemovalDirFor\(p\)[\s\S]*?store\.outputDirFor\(p\), LOGO_OUTPUT_DIRNAME/, 'thư mục nằm ngay trong thư mục dự án');
  assert.match(src, /function discardOldCleanFile\(p, oldFile, newFile\)[\s\S]*?LOGO_OUTPUT_DIRNAME/, 'xóa ảnh cũ cũng trong thư mục đó');
  assert.match(src, /removeStaleTemp\(path\.join\(outDir, LOGO_OUTPUT_DIRNAME\)\)/, 'dọn file tạm trong thư mục đó');
  assert.match(src, /Đã lưu ảnh sạch vào thư mục anhdaxoalogo/);
});

test('Bước 3 và 4 chung số thứ tự ảnh; đổi Gmail lấy đúng ảnh đầu chưa Chọn', () => {
  assert.match(src, /require\('\.\/src\/logo-order'\)/, 'dùng chung module thứ tự ảnh');
  assert.match(src, /function sceneTargetPath\(p, sceneId\)[\s\S]*?sceneFileBase\(p, sceneId\)/, 'ảnh Bước 3 dùng tên có số thứ tự');
  assert.match(src, /function logoCleanTargetPath\(p, sceneId\)[\s\S]*?sceneFileBase\(p, sceneId\)/, 'ảnh sạch Bước 4 giữ cùng số');

  const queue = slice('async function queueLogoRemoval(', 'async function prepareLogoRemoval(');
  assert.match(queue, /sort\(\(a, b\) => sceneNo\(p, a\.id\) - sceneNo\(p, b\.id\)\)/, 'xếp hàng theo đúng 1, 2, 3, 4');

  const daily = slice('function blockNextQueuedForDaily(', '// Một thời điểm chỉ có ĐÚNG 1 cảnh');
  assert.match(daily, /sort\(\(a, b\) => sceneNo\(p, a\.id\) - sceneNo\(p, b\.id\)\)/, 'ảnh bị chặn là ảnh số kế tiếp');

  const resume = slice("app.post('/api/projects/:id/logo-remove/resume'", "app.post('/api/projects/:id/open-logo-output'");
  assert.match(resume, /const resumeScene = nextLogoScene\(p, true\)/, 'chỉ lấy đúng ảnh đầu tiên chưa bấm Chọn');
  assert.match(resume, /if \(logoSceneDone\(p, sc\)\) continue/, 'ảnh đã Chọn/bỏ qua thì bỏ qua');
  assert.match(resume, /if \(sc\.id !== resumeScene\?\.id\) continue/, 'không đụng ảnh đã Chọn hoặc đang chạy thật');
});

test('khởi động lại tool không giữ ảnh chờ Chọn làm kẹt hàng chờ Bước 4', () => {
  assert.match(src, /\['queued', 'preparing', 'waiting_ok', 'downloading'\]\.includes\(sc\.logoRemoval\?\.status\)/, 'Ảnh chờ Chọn cũng phải reset khi mất tab Firefly sau restart');
});

test('xóa logo tuần tự từng ảnh một: ảnh chờ Chọn giữ khóa, không mở ảnh kế tiếp cùng lúc', () => {
  assert.match(src, /function anyLogoJobWaiting\(\)[\s\S]*?'preparing', 'downloading', 'waiting_ok'/, 'ảnh đang xóa / chờ Chọn phải chặn ảnh kế tiếp');
  assert.match(src, /if \(logoRemoveActive \|\| logoRemovePausedQuota \|\| anyLogoJobWaiting\(\)\) return;/);
  assert.match(src, /function releaseLogoJob\(projectId, sceneId, pump = true\)/);

  const prepare = slice('async function prepareLogoRemoval(', 'async function downloadLogoRemoval(');
  assert.match(prepare, /if \(!prep\) \{ releaseLogoJob\(projectId, sceneId\); return; \}/);
  assert.match(prepare, /releaseLogoJob\(projectId, sceneId\);[\s\S]*?\n\}/, 'lỗi/hết lượt phải nhả khóa');

  const download = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(download, /releaseLogoJob\(projectId, sceneId\);/, 'tải xong / lỗi tải thì nhả khóa');

  const retry = slice("app.post('/api/projects/:id/logo-remove/retry'", "app.post('/api/projects/:id/logo-remove/skip'");
  assert.match(retry, /releaseLogoJob\(req\.params\.id, sceneId, false\)/, 'làm lại từ waiting_ok phải nhả khóa cũ');

  const skip = slice("app.post('/api/projects/:id/logo-remove/skip'", "app.post('/api/projects/:id/logo-remove/resume'");
  assert.match(skip, /releaseLogoJob\(req\.params\.id, sceneId\)/, 'bỏ qua ảnh đang chờ Chọn thì chạy ảnh kế');

  assert.match(src, /releaseLogoJobForProject\(projectId\)/, 'xóa dự án đang chạy cũng phải nhả khóa hàng đợi');
});

test('đổi hoặc bỏ chọn ảnh Bước 3 thì khóa lại Bước 4', () => {
  assert.match(src, /Đổi ảnh Bước 3[\s\S]{0,160}delete p\.cleaned;/, 'đổi ảnh Bước 3 phải xóa mốc đã tải');
  assert.match(src, /delete p\.cleaned; \/\/ bỏ chọn ảnh Bước 3/);
  assert.match(src, /delete p\.cleaned; \/\/ ảnh 2K sắp đổi/);
});

test('Bước 4 là bước thật: chỉ mở sau dọn xong, tự chuyển giao diện và ghi nhật ký', () => {
  const patch = slice("app.patch('/api/projects/:id',", 'const pick =');
  assert.match(patch, /if \(b\.stage === 4\)/, 'PATCH phải nhận bước 4');
  assert.match(patch, /if \(!step3ReadyForLogo\(p\)\) return \{ code: 400/, 'chưa dọn xong thì không mở Bước 4');
  assert.match(patch, /p\.stage = 4/);

  for (const from of ["app.post('/api/projects/clean-all'", "app.post('/api/projects/:id/finish'"]) {
    const to = from.includes('clean-all') ? 'function projectHasActiveWork' : '// xem ảnh 2K đã lưu';
    const block = slice(from, to);
    assert.match(block, /p\.stage = 4/, 'dọn xong phải chuyển hẳn sang Bước 4');
    assert.match(block, /p\.autoGo = \{ to: 4/, 'phát tín hiệu để giao diện tự sang Bước 4');
  }

  assert.match(src, /appendLogoPhase\(sc\.logoRemoval, note\)/, 'mỗi phase Firefly phải lưu lại cho giao diện Bước 4');
  assert.match(src, /appendLogoPhase\(sc\.logoRemoval, sc\.logoRemoval\.note\)/, 'mốc chuyển trạng thái cũng phải hiện trong nhật ký');
});

test('ảnh sạch sau khi cắt 9:16 thấp hơn ảnh gốc vẫn được chấp nhận', () => {
  const dl = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(dl, /const is916 = Math\.abs\(result\.width \/ result\.height - 9 \/ 16\) < 0\.01/);
  assert.match(dl, /result\.width <= srcSize\.width && result\.height <= srcSize\.height && is916/, 'không được bắt ảnh 9:16 phải bằng đúng kích thước gốc');
  assert.ok(!/const okSize = !srcSize \|\| \(result\.width === srcSize\.width && result\.height === srcSize\.height\);/.test(dl));
});

test('chỉ tải ảnh khi đã chờ Chọn, xong ảnh mới mở ảnh kế tiếp', () => {
  const dl = slice('async function downloadLogoRemoval(', 'async function save2k(');
  assert.match(dl, /status !== 'waiting_ok'.*Chỉ có thể tải xuống khi cảnh đang chờ bạn bấm “Chọn”/, 'không có Chọn thì không tải');
  assert.match(dl, /Ảnh này đã xong: mới được mở ảnh kế tiếp trong hàng đợi[\s\S]*?releaseLogoJob\(projectId, sceneId\)/, 'xong ảnh mới nhả khóa hàng đợi');
  assert.match(src, /\['preparing', 'downloading', 'waiting_ok'\]/, 'ảnh đang ở Firefly hoặc chờ Chọn vẫn giữ khóa');
});
