# Lịch sử phiên bản

## Unreleased

## v1.1.23 - 2026-11-23
- Dọn luôn đoạn prompt phong cách chụp 35mm/film grain và danh sách "Tránh: da nhựa, CGI..." trong các DỰ ÁN CŨ: prompt được lưu riêng trong project.json nên đổi mẫu mặc định trước đây không có tác dụng với dự án đã tạo. Giờ tự migrate lúc mở app, cả bản tiếng Việt lẫn tiếng Anh (kể cả prompt đã lưu trong các lượt chạy).
- Mẫu prompt đã lưu trong templates.json cũng được dọn khi đọc, không chỉ mẫu mặc định.


## v1.1.22 - 2026-11-23
- Sửa triệt để lỗi tải xong 100% nhưng đóng app rồi mở lại vẫn không lên phiên bản: helper đọc sai định dạng lock (app ghi JSON, helper so sánh như chuỗi thường) nên luôn abort trước khi chạy installer — từ v1.1.17 đến v1.1.21 không lượt nào cài được.
- App giờ xác nhận helper bằng file "ready" ghi sau khi đã qua kiểm tra token, không còn tin câu log ghi trước đó; helper báo lỗi ngay thay vì thoát im lặng, và không cài khi app vẫn còn mở sau 60s.
- Khi mở lại app: huỷ helper còn sót của phiên trước, xoá lock/ready cũ; nếu marker báo sẽ lên bản mới nhưng phiên bản không tăng thì hiện lỗi rõ ràng và dọn marker để lần sau thử lại được ngay.
- Sửa thêm lỗi PowerShell 5.1 ghi file ready/status kèm BOM làm Node so sai token và JSON.parse lỗi — helper giờ ghi UTF-8 không BOM, app cũng bỏ BOM khi đọc (kể cả file cũ).
- Dọn luôn file marker `.complete` đi kèm installer sau khi cập nhật thành công.
- Thêm test chạy thật script PowerShell với đúng lock JSON / lock sai token, và test luồng ready-rollback trong main.


## v1.1.21 - 2026-11-23
- Bỏ nốt đoạn phong cách chụp 35mm/film grain và danh sách "Tránh: da nhựa, CGI..." khỏi mẫu prompt mặc định của bước 2 và bước 3 (trước đây mới chỉ bỏ ở bước 1); thêm test chặn tái diễn ở mọi bước.


## v1.1.20 - 2026-11-23
- Bỏ hẳn thông báo timeout khi tải/cài bản cập nhật: cứ hiện tiến độ bình thường, chỉ báo lỗi khi file cài thật sự lỗi hoặc NSIS cài thất bại.


## v1.1.19 - 2026-11-23
- Sửa lỗi báo "Tải bản cài đặt quá lâu (quá 30 giây)" dù file vẫn tải tiếp: giờ timeout theo tiến độ, 30s không có tiến độ mới báo lỗi, tối đa 10 phút.
- Tận dụng file installer đã tải trọn vẹn trong Downloads (so kích thước với GitHub) nên bấm Thử lại không phải tải lại 118 MB; chặn 2 lượt tải chồng nhau.


## v1.1.18 - 2026-11-22
- Bỏ đoạn prompt phong cách chụp 35mm/film grain và danh sách "Tránh: da nhựa, CGI..." khỏi mẫu prompt mặc định của bước 1; không thêm vào các bước khác.


## v1.1.17 - 2026-11-22
- Sửa lỗi sao lưu không chứa dự án: loại Chrome profile (bị khoá gây lỗi EBUSY) ra khỏi backup, copy vào thư mục tạm rồi đổi tên, có manifest và kiểm tra trước khi báo thành công.
- Sửa lỗi bấm shortcut lần 2 làm đóng nhầm Chrome/hàng đợi của app đang chạy.
- Sửa lỗi cửa sổ nhỏ nhất 1000px không bấm được nút Cài đặt (header tự xuống dòng từ 1120px).
- Sửa lỗi mất job dọn installer cũ khi mở lại app quá sớm; giữ job lại đến khi phiên bản tăng thật.
- Cập nhật báo lỗi cài đặt thất bại (UAC/NSIS) cho người dùng ở lần mở app tiếp theo.
- Thêm timeout và reset nút cho kiểm tra/tải cập nhật; phím Esc đóng đúng hộp thoại; không mất các ô Cài đặt chưa Lưu.
- Sửa lỗi gõ prompt xong bấm sang bước khác trong 600ms làm lưu nhầm nội dung sang bước mới.
- Chặn đường dẫn dự án lạ (path traversal) và bỏ định nghĩa trùng route sao lưu.
- Chốt cứng thư mục dữ liệu, không để app đọc nhầm dataset cũ giữa hai thư mục AppData.
- Thay test soi nội dung bằng test chạy thật các hàm cập nhật; cập nhật thông báo "Mở lại sau 10–20 giây...".


## v1.1.16 - 2026-11-22
- Thêm viền xanh kiểu outline cho nút “Kiểm tra phiên bản mới” trong Cài đặt.
- Khi đếm ngược đóng app sau 3s, thêm dòng nhỏ “Mở lại app sau khoảng 10 giây.”


## v1.1.15 - 2026-11-22
- Đưa “Phiên bản hiện tại” và nút kiểm tra lên đầu hộp Cài đặt; đổi tên nút thành “Kiểm tra phiên bản mới”.


## v1.1.14 - 2026-11-22
- Dọn luôn file `.exe.blockmap` của các bản cũ trong `dist` (Explorer giấu đuôi `.blockmap` nên nhìn tưởng là file `.exe` cũ chưa được xóa).
- Thêm test kiểm tra xóa cả blockmap bản cũ nhưng vẫn giữ blockmap của bản hiện tại.


## v1.1.13 - 2026-11-22
- Bản đích để kiểm tra trực tiếp luồng “một nút Tải về và cập nhật” trên máy phát triển.


## v1.1.12 - 2026-11-22
- Sửa lỗi Windows hiện hộp “Chọn một ứng dụng để mở 'TA'” khi bấm cập nhật: `Start-Process -ArgumentList` tách đường dẫn `C:\Users\TA ANH TUAN\...` tại dấu cách.
- Helper giờ đọc toàn bộ đường dẫn từ file JSON trong `%TEMP%`, không truyền qua đối số dòng lệnh; thêm test với đường dẫn có dấu cách thật.
- Gộp thành một nút “Tải về và cập nhật”: tải 100% → hiện “Đang cập nhật…” → đếm ngược “Đóng sau 3s… Mở lại app để dùng phiên bản v…” → app tự đóng để hoàn tất cài đặt. Không còn nút “Tải lại để cập nhật”.
- Nếu không khởi được tiến trình cập nhật, app không đóng, hiện nút “Thử lại” và xoá marker để không báo thành công sai.


## v1.1.11 - 2026-11-22
- Bản đích để kiểm tra trực tiếp luồng cập nhật đếm ngược 3 giây trên máy phát triển.


## v1.1.10 - 2026-11-22
- Đổi sang luồng cập nhật đếm ngược 3 giây: bấm “Tải lại để cập nhật” → app tắt để cài im lặng → bạn mở lại bằng shortcut, không còn phụ thuộc helper tự khởi chạy app.
- Thông báo “Cập nhật … thành công” chỉ hiện khi phiên bản thật đã khớp bản đích; mở app quá sớm sẽ giữ thông báo cho lần mở sau.
- Bỏ `shell.openPath()` trong luồng cập nhật để Windows không hiện hộp thoại “Chọn một ứng dụng để mở”.


## v1.1.9 - 2026-11-22
- Bản đích để kiểm tra trực tiếp luồng tự cập nhật đã sửa helper trên máy phát triển.


## v1.1.8 - 2026-11-22
- Sửa triệt để lỗi helper không chạy: `spawn(detached: true)` trên Windows làm PowerShell thoát ngay mà không chạy script — chuyển sang `Start-Process` trung gian, helper sống sót sau khi app đóng.
- App chỉ đóng sau khi helper ghi xác nhận đã chạy (có token riêng từng lần), không còn cảnh bấm cập nhật xong app tắt mà bản mới vẫn không được cài.
- Thêm test tích hợp kiểm tra helper thực sự chạy và tiếp tục chạy sau khi tiến trình cha thoát.


## v1.1.7 - 2026-11-22
- Đổi luồng cập nhật: bấm “Tải về và cập nhật” chỉ tải, app không tắt; hiện hộp thoại bắt buộc với nút “Tải lại để cập nhật”.
- Chỉ khi bấm nút “Tải lại để cập nhật” mới cài im lặng, đóng app ngắn rồi tự mở lại bản mới.
- Sau khi mở lại, hiện thông báo “Cập nhật phiên bản vX thành công!” — đối chiếu với phiên bản thật đang chạy, không báo sai.
- Thêm test chặn việc cài/đóng app ngay lúc tải xong và đảm bảo thông báo thành công khớp phiên bản.


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
