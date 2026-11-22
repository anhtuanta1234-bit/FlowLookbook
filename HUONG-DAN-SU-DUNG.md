# Flow Lookbook — Hướng dẫn sử dụng

## 1. Cài đặt (cho người nhận app)

### Cách cài
1. Chạy file **"Flow Lookbook Setup 1.0.0.exe"**.
2. Chọn thư mục cài đặt (mặc định: `C:\Program Files\Flow Lookbook`).
3. Bấm **Install** → đợi cài xong → bấm **Finish**.
4. App xuất hiện trong Start Menu và Desktop shortcut.

### Yêu cầu hệ thống
- Windows 10/11 (64-bit).
- Google Chrome (hoặc Edge/Brave) đã cài.
- Kết nối internet (để dùng Google Flow).
- Tài khoản Google đã đăng ký Google Flow.

### Gỡ cài đặt
Control Panel → Programs → Uninstall "Flow Lookbook". Dữ liệu người dùng (dự án, ảnh) nằm ở `%APPDATA%\Flow Lookbook\data` — xóa thủ công nếu muốn.

---

## 2. Khởi động app

- Bấm shortcut **Flow Lookbook** trên Desktop hoặc Start Menu.
- App mở cửa sổ riêng (không qua trình duyệt).
- Lần đầu: app tự tìm Chrome. Nếu không tìm thấy → vào **Cài đặt → Nâng cao → Đường dẫn Chrome** điền đường dẫn `chrome.exe`.

---

## 3. Đăng nhập Flow

1. Bấm nút **"Đăng nhập Flow"** (góc trên).
2. Cửa sổ Chrome của tool hiện ra → đăng nhập tài khoản Google.
3. Sau khi đăng nhập, tool tự thu nhỏ Chrome và chạy ngầm.
4. Trạng thái hiển thị **"Đã đăng nhập"**.

> Tool dùng profile Chrome riêng (`data/chrome-profile`), không ảnh hưởng profile cá nhân của bạn.

---

## 4. Quy trình 3 bước

### Bước 1 — Tách trang phục
1. Tải ảnh sản phẩm (ảnh trang phục) vào ô "Ảnh sản phẩm".
2. Sửa prompt tiếng Việt (hoặc dùng mặc định).
3. Bấm **"Chạy"** → tool tạo 4 ảnh trang phục tách nền trắng.
4. Chọn ảnh ưng ý → bấm **"Chọn"**.
5. (Tùy chọn) Bấm **"Làm lại"** trên ảnh để tạo biến thể.

### Bước 2 — Ghép KOC
1. Chọn KOC (nhân vật) từ thư viện KOC.
2. Thêm ảnh phụ kiện (nếu có).
3. Sửa prompt.
4. Bấm **"Chạy"** → tool tạo 4 ảnh KOC mặc trang phục.
5. Chọn ảnh ưng ý → **"Chọn"**.

### Bước 3 — Ghép cảnh thật
1. Thêm cảnh (ảnh nền thực tế).
2. Sửa prompt chung cho mọi cảnh.
3. Bấm **"Chạy tất cả cảnh"** hoặc chạy từng cảnh.
4. Mỗi cảnh tạo 4 ảnh → chọn ảnh → tool tự lưu bản 2K vào thư mục kết quả.
5. Khi tất cả cảnh đã lưu 2K → bấm **"Hoàn tất"** để dọn ảnh trung gian.

---

## 5. Cài đặt (⚙)

| Mục                        | Khuyên dùng        | Mô tả                                                     |
| -------------------------- | ------------------ | --------------------------------------------------------- |
| Thư mục lưu ảnh 2K         | Mặc định (output/) | Mỗi sản phẩm tự tạo thư mục con                           |
| Số lượt Flow chạy cùng lúc | 3–4                | Nhiều quá dễ bị Flow cảnh báo spam                        |
| Số ảnh 2K tải cùng lúc     | 6–8                | Tải bản 2K song song                                      |
| Chế độ nhanh               | Tắt                | Bật khi đã ổn định; nhanh hơn nhưng tăng nguy cơ cảnh báo |
| Giới hạn tab Chrome        | 12                 | Tránh hết RAM                                             |
| Lấy bản 2K nét (bước 1, 2) | Bật                | Ảnh đầu vào nét hơn → kết quả cuối nét hơn                |
| Đường dẫn Chrome           | Để trống           | Tool tự tìm; điền nếu Chrome ở chỗ không mặc định         |

---

## 6. Sao lưu dữ liệu

- Bấm **"Sao lưu dữ liệu"** trong Cài đặt → tool copy toàn bộ `data/` vào `data/backups/<thời gian>/`.
- Thông báo hiện nút **"Mở thư mục sao lưu"** → bấm để mở Explorer.
- Thông báo tự tắt sau 10 giây.
- Backup cũ hơn 2 ngày tự động xóa khi khởi động app hoặc khi sao lưu mới.

---

## 7. Xử lý sự cố

| Vấn đề                          | Cách xử lý                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Không tìm thấy Chrome"         | Kiểm tra đường dẫn Chrome trong Cài đặt → Nâng cao                                             |
| "Flow báo hoạt động bất thường" | Tool tự tạm dừng. Bấm **"Mở Flow"** kiểm tra tài khoản, nghỉ vài phút, bấm **"Tiếp tục chạy"** |
| Ảnh tạo lỗi                     | Bấm **"Thử lại lượt"** trên dòng lỗi                                                           |
| Lượt bị gián đoạn (crash)       | Khởi động lại app → tool tự đánh dấu lỗi → bấm **"Thử lại lượt"**                              |
| App bị đơ                       | Đóng và mở lại app; kiểm tra `data/logs/app.log`                                               |
| Chrome của tool không tắt       | Bấm **"Ngắt kết nối Flow"** trước khi đóng app                                                 |

---

## 8. Log & theo dõi

- Log chung: `data/logs/app.log` (xoay vòng khi > 2 MB).
- Log theo dự án: `data/logs/project-<id>.log`.
- Mỗi pha của lượt chạy được ghi kèm thời gian: `phase="..." +Nms total=...ms`.
- Nếu một lượt lâu, tìm dòng cuối của `run=<id>` để biết đang đứng ở pha nào.

---

## 9. Lưu ý quan trọng

- **Không chạy quá nhiều lượt cùng lúc** (khuyên 3–4) để tránh Flow cảnh báo spam.
- **Không rút USB/ổ ngoài** khi đang tải ảnh 2K.
- **Sao lưu thường xuyên** trước khi chạy lớn.
- Dữ liệu người dùng nằm trong `%APPDATA%\Flow Lookbook\data` (bản cài đặt) hoặc `data/` (bản dev). Xóa thư mục này sẽ mất toàn bộ dự án.

---

## 10. Phiên bản & cập nhật (dành cho người phát triển)

Người dùng **không cần điền gì**. Mọi cấu hình nằm trong mã nguồn.

### Cấu hình hiện tại
- Repo GitHub: `https://github.com/anhtuanta1234-bit/FlowLookbook`
- Link kiểm tra cập nhật (đặt trong `server.js`):  
  `https://raw.githubusercontent.com/anhtuanta1234-bit/FlowLookbook/main/version.json`
- Có thể ghi đè bằng biến môi trường `FLOW_UPDATE_URL` khi chạy dev.

### Phát hành bản mới — 1 lệnh, làm hết

Chuẩn bị **1 lần duy nhất**: tạo GitHub Personal Access Token (classic, quyền `repo`, hạn 90 ngày) rồi chạy:
```
npm run auth:github
```
Token được mã hoá bằng DPAPI, lưu ở `%APPDATA%\Flow Lookbook\github-token.dat` (không lưu dạng plain text, nằm ngoài repo).

Sau mỗi lần sửa code, chỉ cần:
```
npm run release          // tăng patch: 1.1.0 → 1.1.1
npm run release:minor    // 1.1.0 → 1.2.0
npm run release:major    // 1.1.0 → 2.0.0
```

Lệnh đó tự động: tăng version → lấy ghi chú từ mục `## Unreleased` trong `CHANGELOG.md` (nếu trống thì lấy từ `git log`) → cập nhật `version.json` → build installer → commit + push source lên GitHub → tạo Release + upload installer.

Bạn **không cần** vào GitHub sửa gì, không cần tự viết nội dung phiên bản, không cần kéo thả file.

Nội dung thông báo trên app chính là các dòng bạn ghi trong `## Unreleased` của `CHANGELOG.md`. Ví dụ:
```md
## Unreleased
- Sửa lỗi không bấm được nút Cài đặt.
- Thêm chặn trùng tên sản phẩm.
```

Sau khi release, mọi app (máy bạn và máy người khác) tự hiện thông báo kèm nội dung trên, bấm một nút là tự tải → tự cài → tự mở lại, shortcut không cần làm lại.

### File `version.json`
```json
{
  "version": "1.1.0",
  "url": "https://.../Flow%20Lookbook%20Setup%201.1.0.exe",
  "notes": "Sửa lỗi giao diện.\nThêm tự động cập nhật."
}
```
- `version`: phiên bản mới (phải lớn hơn bản đang dùng).
- `url`: link tải installer `.exe`.
- `notes`: nội dung thông báo — ghi rõ sửa lỗi gì / thêm gì. Hỗ trợ xuống dòng bằng `\n`.

### Hành vi trên app người dùng
- Khi mở app: tự kiểm tra bản mới. Nếu có → hiện hộp thoại với **số phiên bản + nội dung `notes`** + nút **"Tải về và cập nhật"**.
- Bấm nút → app tự tải installer, báo `%` tiến độ, tự chạy installer im lặng và đóng app. Dữ liệu (`%APPDATA%\Flow Lookbook\data`) được giữ nguyên.
- Vào **Cài đặt → Kiểm tra cập nhật** để kiểm tra thủ công bất kỳ lúc nào.
- Góc trên bên trái luôn hiển thị phiên bản đang dùng (`v1.0.0`).

### Cập nhật thủ công (khi cần)
Đóng app → chạy installer mới → mở lại app. Không cần gỡ cài đặt cũ.

---

*Flow Lookbook v1.1.0*