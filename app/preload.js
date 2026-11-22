// Cầu nối an toàn giữa giao diện web và vỏ app Electron.
// Chỉ mở các hàm cần thiết: chọn thư mục và tải/cập nhật app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowBridge', {
  // Trả về đường dẫn thư mục người dùng chọn, hoặc null nếu bấm Hủy.
  pickFolder: (current) => ipcRenderer.invoke('flow:pick-folder', current),
  // Tải installer phiên bản mới về máy. tiến độ gửi qua onUpdateProgress.
  downloadUpdate: (url) => ipcRenderer.invoke('flow:download-update', url),
  // Tự chạy installer đã tải (chỉ khi app đã được đóng gói).
  installUpdate: (file) => ipcRenderer.invoke('flow:install-update', file),
  onUpdateProgress: (cb) => ipcRenderer.on('flow:update-progress', (_e, percent) => cb(percent)),
});
