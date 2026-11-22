# Lịch sử phiên bản

## Unreleased

## v1.1.6 - 2026-11-22
- Sau khi app mới tự mở lại thành công, tự xóa installer vừa tải và các installer cũ trong `dist` (giữ lại bản mới nhất), ghi rõ vào `update.log`.
- Thêm công tắc “Tự dọn file cài đặt cũ” trong Cài đặt, bật mặc định; không đụng vào dự án hay thư mục app đang chạy.


## v1.1.5 - 2026-11-22
- Sửa lỗi tải xong bản mới nhưng app không tự cài/tự mở lại: helper PowerShell bị ghi nhầm thành chuỗi `@'...'@` nên không chạy.
- Thêm test ngăn helper tự cập nhật bị ghi sai dạng here-string.


## v1.1.4 - 2026-11-22
- Cố định thư mục nhận ảnh trên máy phát triển thành `E:\FlowLookbook\output` — kể cả bản cài đặt, đổi trong Cài đặt cũng không bị lệch.
- Máy khác lần đầu mở app nếu chưa chọn thư mục lưu ảnh sẽ có thông báo kèm nút “Chọn thư mục…”.


## v1.1.3 - 2026-11-22
- Sửa lỗi tải xong bản mới nhưng app không tự cài/tự mở lại: dùng helper PowerShell riêng, chờ app đóng hẳn rồi mới cài im lặng và mở lại.
- Thêm file log `update.log` để kiểm tra từng bước tự cập nhật khi có sự cố.


## v1.1.2 - 2026-11-22
- Thêm cache-buster khi kiểm tra phiên bản: app luôn đọc `version.json` mới nhất, không bị CDN trả bản cũ.


## v1.1.1 - 2026-11-22
- Tự động tắt app, cài bản mới im lặng rồi **tự mở lại** — không cần bấm lại shortcut hay cài lại tay.
- Chặn đặt tên sản phẩm trùng nhau (không phân biệt hoa/thường), có thông báo ngay khi trùng.
- Giữ nguyên shortcut Desktop/Start Menu qua mỗi lần nâng cấp.
- Tự động đẩy mã nguồn, tạo bản phát hành và viết ghi chú phiên bản lên GitHub.
- Thêm file `AGENTS.md` / `CLAUDE.md`: AI khác mở thư mục sẽ tự hỏi “Đưa phiên bản mới này lên Git/GitHub nhé?” rồi publish qua 1 lệnh.
- Sửa link tải bản mới cho đúng tên asset trên GitHub (không còn 404).


## v1.1.0 - 2026-11-22
- Sửa lỗi giao diện không bấm được nút, không hiện dự án.
- Hiện phiên bản ngay góc trên bên trái.
- Tự kiểm tra bản mới khi mở app.
- Thêm nút “Kiểm tra cập nhật” trong Cài đặt.
- Tự tải và cài đặt bản mới chỉ với 1 nút bấm.
