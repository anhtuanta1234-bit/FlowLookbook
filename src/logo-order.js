// Thứ tự ảnh 01, 02, 03, … dùng CHUNG cho ảnh Bước 3 và ảnh sạch Bước 4.
// Số lấy từ order của cảnh nên ổn định khi xóa/thêm cảnh. Khi đổi Gmail giữa chừng,
// tool căn cứ vào các ảnh đã có file sạch để biết đã xong tới ảnh số mấy và chỉ lấy ảnh kế tiếp.
const fs = require('fs');
const store = require('./store');

function sceneNo(p, sceneId) {
  const idx = (p?.s3?.scenes || []).findIndex((s) => s.id === sceneId);
  return store.sceneOrder(p, sceneId) || (idx + 1);
}

function sceneFileBase(p, sceneId) {
  return `${String(sceneNo(p, sceneId)).padStart(2, '0')}-${store.safeName(p.name)}`;
}

// Đã xong: đã duyệt/bỏ qua HOẶC đã có file ảnh sạch trên đĩa theo đúng số thứ tự.
function logoSceneDone(p, sc) {
  if (['approved', 'skipped'].includes(sc?.logoRemoval?.status)) return true;
  const clean = sc?.logoRemoval?.cleanFile;
  return !!clean && fs.existsSync(clean);
}

// Ảnh kế tiếp cần xóa: số nhỏ nhất trong các ảnh CHƯA có ảnh sạch.
// skipActive: bỏ qua ảnh đang chạy / đang chờ bấm Ổn (dùng lúc đổi Gmail).
function nextLogoScene(p, skipActive = false) {
  return (p?.s3?.scenes || [])
    .slice()
    .sort((a, b) => sceneNo(p, a.id) - sceneNo(p, b.id))
    .find((sc) => sc?.chosen?.status === 'saved' && sc?.chosen?.target && !logoSceneDone(p, sc)
      && (!skipActive || !['preparing', 'downloading', 'waiting_ok'].includes(sc.logoRemoval?.status))) || null;
}

module.exports = { sceneNo, sceneFileBase, logoSceneDone, nextLogoScene };
