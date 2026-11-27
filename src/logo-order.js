// Thứ tự ảnh 01, 02, 03, … dùng CHUNG cho ảnh Bước 3 và ảnh sạch Bước 4.
// Số lấy từ order của cảnh nên ổn định khi xóa/thêm cảnh. Khi đổi Gmail giữa chừng,
// tool căn cứ vào các ảnh đã có file sạch để biết đã xong tới ảnh số mấy và chỉ lấy ảnh kế tiếp.
const store = require('./store');

function sceneNo(p, sceneId) {
  const idx = (p?.s3?.scenes || []).findIndex((s) => s.id === sceneId);
  return store.sceneOrder(p, sceneId) || (idx + 1);
}

function sceneFileBase(p, sceneId) {
  return `${String(sceneNo(p, sceneId)).padStart(2, '0')}-${store.safeName(p.name)}`;
}

// Đã xong = đã bấm “Chọn” (approved) hoặc đã bỏ qua. Có file sạch trên đĩa mà CHƯA
// bấm “Chọn” thì CHƯA xong: đổi Gmail sẽ làm lại đúng ảnh đó, không nhảy sang ảnh kế.
function logoSceneDone(p, sc) {
  return ['approved', 'skipped'].includes(sc?.logoRemoval?.status);
}

// Ảnh kế tiếp cần xóa: số nhỏ nhất trong các ảnh CHƯA bấm “Chọn”.
// skipActive: bỏ qua ảnh ĐANG chạy thật (preparing/downloading); vẫn lấy ảnh đang chờ Chọn.
function nextLogoScene(p, skipActive = false) {
  return (p?.s3?.scenes || [])
    .slice()
    .sort((a, b) => sceneNo(p, a.id) - sceneNo(p, b.id))
    .find((sc) => sc?.chosen?.status === 'saved' && sc?.chosen?.target && !logoSceneDone(p, sc)
      && (!skipActive || !['preparing', 'downloading'].includes(sc.logoRemoval?.status))) || null;
}

module.exports = { sceneNo, sceneFileBase, logoSceneDone, nextLogoScene };
