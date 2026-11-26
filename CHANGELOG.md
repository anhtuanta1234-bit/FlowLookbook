# Lịch sử phiên bản

## Unreleased

## v1.1.41 - 2026-11-26
- Làm gọn 2 ô ảnh Bước 4 (mỗi ô tối đa ~210px chiều rộng) nhưng vẫn giữ cùng khung 9:16 và cùng kích thước để so sánh/căn tọa độ.


## v1.1.40 - 2026-11-26
- Sửa nhận diện hết lượt Firefly: chỉ tin banner thật sự hiển thị (`Hôm nay còn 0 lượt tạo`, `Nâng cấp để tiếp tục tạo`), không còn đếm tooltip ẩn hay mã JS trong shadow DOM thành hết lượt.
- Bước 4: ảnh gốc và khung chiếu Firefly giờ cùng kích thước, cùng khung 9:16; ảnh gốc khít viền (không bị `max-height` cắt), dễ so sánh và căn tọa độ 1:1.
- Kiểm tra trực tiếp theo nghi ngờ của bạn: cửa sổ Firefly bị thu nhỏ làm canvas mask co lại dưới ngưỡng, tool bỏ qua canvas mask rồi chấm nhầm canvas nền — giờ ưu tiên `mask-canvas` tuyệt đối dù rất nhỏ, mỗi lần thử chấm tính lại tọa độ theo box mới, và `showWindow()` tự phóng cửa sổ Firefly về tối thiểu 1100×760.
- Giữ đăng nhập Firefly khi tách Chrome: lần đầu mở dùng riêng sẽ sao chép profile cũ sang `chrome-firefly-profile`, không bắt đăng nhập lại Gmail.
- Test live xác nhận tọa độ chấm logo (tâm 93% / 96% ảnh gốc → 93% / 96,4% khung 9:16) đã xóa đúng; sửa lỗi Firefly đôi khi không nhận nét cọ khi vừa đóng hộp cài đặt (bấm lại tối đa 3 lần).
- Ô chiếu trực tiếp Firefly giờ chụp đúng vùng ảnh 9:16, chất lượng cao và 2x pixel, không cắt khung 16:9; khi Firefly báo xong mà chưa bấm “Ổn” thì đóng băng khung hình, không bật lên tắt xuống nữa.


## v1.1.39 - 2026-11-26
- Tách Firefly ra Chrome riêng (profile + cổng CDP riêng) để đổi Gmail liên tục không làm mất session Google đang dùng ở Flow; Firefly chỉ bật cửa sổ của Firefly.
- Firefly báo lỗi / hết lượt / tạm dừng thì đóng ngay tab và tắt luôn process Chrome Firefly khi hết việc, giải phóng RAM; ảnh bị chặn sẽ tạo lại đúng ảnh đó bằng Gmail mới, không làm lại những ảnh đã xong.


## v1.1.38 - 2026-11-26
- Chốt tọa độ vùng xóa logo theo tâm (93%, 96%) — lùi trái 2%, xuống 4% từ điểm cũ (95%, 92%); sửa giá trị dự phòng cũ trong server về đúng 89.940 / 94.329 để không lệch khi config mất trường mask.


## v1.1.37 - 2026-11-26
- Thiết kế lại Bước 4: khung phải bỏ hàng chờ trùng, mỗi cảnh chia 2 ô — ảnh gốc chưa xóa logo và ảnh Firefly chiếu trực tiếp trên app.
- Ô Firefly hiện “đang xóa logo” lúc chạy, “đã xóa xong logo” khi xong; nút Ổn / Làm lại / Thử lại nằm chung một hàng ngang.
- Chụp tab Firefly qua CDP để chiếu lên app: không bật cửa sổ, không chiếm tab hay làm đụng lượt Flow đang chạy; ảnh lỗi thì chỉ hiện ô trống, không báo lỗi giả.
- Đưa nút bật/tắt “Xóa logo” ra thanh công cụ trên cùng, mặc định TẮT và chỉ lưu khi bạn bấm; Cài đặt giờ chỉ còn chức năng của app.
- Cỡ cọ và vùng logo chuyển thành phần “Tùy chỉnh Firefly” ngay trong Bước 4, có nút Lưu riêng; rút gọn dòng báo hết lượt free.
- Vẫn giữ nguyên luồng Firefly đã kiểm tra (9:16 → Chấm sửa và xóa → cọ 14 → chấm logo → Xóa → chờ Firefly báo xong → bạn bấm Ổn → tool tải ảnh sạch vào anhdaxoalogo).


## v1.1.36 - 2026-11-26
- Gọn giao diện Bước 4: chỉ còn một nút Firefly trên thanh điều khiển; hướng dẫn dài được gập lại.
- Nút “Đã đổi Gmail khác, tiếp tục” chỉ hiện trên đúng ảnh bị chặn; mỗi ảnh giờ có một nút chính (Ổn / làm lại / tiếp tục), các thao tác phụ gấp vào menu “Thêm”; bỏ nút trùng và rút ngắn tiến trình, hàng chờ, nhật ký.


## v1.1.35 - 2026-11-26
- Sửa lại thao tác xóa logo Firefly theo đúng cách bạn vừa hướng dẫn: cắt 9:16 xong bấm “Chấm sửa và xóa”, mở “Cài đặt cọ vẽ”, chỉnh cỡ 14, chấm đúng 1 lần vào logo rồi mới bấm “Xóa”.
- Chọn đúng canvas ảnh 9:16 thay vì canvas nền, nên cọ không còn chấm ngoài ảnh (canvas mask chỉ rộng ~199px nên trước đây bị ngưỡng 200px loại).
- Thêm ô “Cỡ cọ Firefly” trong Cài đặt (mặc định 14) và hiện rõ cỡ cọ đang dùng trên Bước 4.
- Bước 4 giờ xử lý tuần tự từng ảnh một: ảnh trước chưa bấm “Ổn” / chưa tải xong thì tool không mở ảnh kế, hết lượt báo rõ tên ảnh bị chặn.
- Thêm hàng chờ xóa logo trên giao diện: thấy ảnh đang xóa, ảnh còn chờ và ảnh hết lượt free Firefly.
- Không để ảnh chờ “Ổn” làm kẹt hàng chờ sau khi tool khởi động lại.
- Sửa bước cắt 9:16 theo giao diện Firefly hiện tại: dùng đúng picker “Thêm” và bấm “Xác nhận cắt”, nên ảnh đầu ra đúng chuẩn 9:16 thay vì giữ nguyên tỷ lệ gốc.
- Đóng thông báo “Không đủ dung lượng lưu trữ” nếu Firefly hiện ra làm chắn thao tác.
- Đợi đúng câu “Đã hoàn tất thao tác tạo sinh” trên ảnh mới cho phép tải; không còn bấm “Tải xuống” quá sớm như nút cũ còn sót lại.
- Chỉnh tâm vùng chấm logo về (93%, 96%) trên ảnh 2K theo tọa độ đã chốt trên máy thật.
- Sửa lỗi Bước 4 báo sai “khác kích thước gốc”: ảnh đã cắt 9:16 thấp hơn vài px giờ được chấp nhận.
- Tăng tốc Bước 4: vào thẳng trình sửa ảnh, chờ theo trạng thái nút thật thay vì ngủ cố định và chỉ đợi 5 giây một lần; vẫn chờ Firefly báo hoàn tất và bấm Ổn mới tải.
- Nhận diện cả màn hình Firefly mời “nâng cấp gói trả phí / mua thêm lượt”: báo đang dùng lượt free hàng ngày và nhắc đổi mail khác, không hiểu nhầm là lỗi hệ thống.
- Firefly free chỉ cho 3 ảnh/ngày: tool tự đếm, chạy đúng 3 ảnh thì dừng và báo đổi mail thay vì mở ảnh thứ 4; giao diện hiện “Lượt free hôm nay: x/3”.
- Bấm “Đã đổi Gmail khác, tiếp tục” thì reset bộ đếm cho tài khoản mới, làm tiếp đúng ảnh bị chặn, không làm lại ảnh cũ; qua nửa đêm bộ đếm tự reset.
- Chốt cứng thứ tự ảnh 01, 02, 03,… từ Bước 3: ảnh sạch trong <code>anhdaxoalogo</code> giữ cùng số. Đổi Gmail giữa chừng thì tool căn cứ vào số ảnh đã có ảnh sạch để lấy đúng ảnh kế tiếp (xong 1-2-3 thì chỉ làm ảnh 4), không chạy lại 3 ảnh đầu. Hàng chờ và banner hết lượt cũng hiện đúng số ảnh.


## v1.1.34 - 2026-11-25
- Sửa đúng lỗi dừng ở bước tải ảnh lên Firefly: tool chỉ quét 10 lớp shadow root nên tưởng editor chưa tải và báo nhầm “Chưa đăng nhập Adobe Firefly”, giờ quét 26 lớp và vào thẳng trang chỉnh sửa.
- Thêm chọn khung hình chuẩn 9:16 trong Firefly (Cắt và mở rộng → Thêm → 9:16 → Cắt) ngay sau khi tải ảnh 2K lên, trước khi tô vùng logo, và tự xác nhận hộp “Confirm crop” nếu Adobe hiện ra.
- Cọ xóa logo giờ tự chỉnh cỡ đủ phủ và quét nhiều lượt kín vùng logo, không sót chữ ở góc ảnh.
- Thêm Bước 4 “Xóa logo” thành một bước riêng ngay sau Bước 3: dọn xong ảnh 2K là app tự chuyển sang Bước 4, xem được từng thao tác Firefly đang chạy (9:16 → Chấm sửa và xóa → cọ → Xóa → bạn bấm Ổn → tool bấm Tải xuống) theo thời gian thực.
- Bước 4 hiện trạng thái từng cảnh, nhật ký thao tác, nút Ổn / làm lại / bỏ qua / tiếp tục sau đổi Gmail ngay trong giao diện.


## v1.1.33 - 2026-11-25
- Sửa lỗi không tải được ảnh 2K lên Firefly: giao diện hiện ghi nút là “Tải lên” thay vì “Tải ảnh lên”, tool giờ nhận diện cả hai ở bước kiểm tra editor lẫn bước bấm upload.
- Lỗi upload giờ báo kèm trạng thái Firefly (địa chỉ, có input file, số nút active) để dễ tra cứu khi giao diện Adobe đổi tiếp.


## v1.1.32 - 2026-11-25
- Sửa luồng hết lượt Firefly/tool chỉ chạy tiếp từ ảnh đang bị chặn (ảnh 4), không làm lại các ảnh đã xong (ảnh 1–3) sau khi bạn đăng nhập Gmail khác.
- Firefly vẫn hiện banner “hết lượt” trên ảnh đã tạo xong: tool giờ ưu tiên tải ảnh đó, không đánh dấu nhầm rồi tốn thêm một lượt free để tạo lại.
- Ảnh đã tạo nhưng tải bị chặn thì tool giữ phiên Firefly; đổi Gmail xong bạn chỉ cần bấm “Ổn” để tải lại, không tạo lại ảnh.
- Khi hết lượt tool mở sẵn cửa sổ Firefly và thêm nút “Mở Firefly để đổi Gmail” để bạn đăng nhập mail khác ngay.
- Xóa dự án trong tool giờ xóa luôn thư mục ảnh tương ứng trong `output`, có hộp thoại cảnh báo rõ ràng trước khi xóa.
- Bước 3 có nút mới “Tải hết ảnh về & Dọn dẹp”: xóa thư mục `_tam` của các dự án đã xong Bước 3, chỉ giữ lại ảnh 2K đã chọn.
- Bước 4 không còn tự chạy ngay lúc bạn chọn từng ảnh 2K; chỉ bắt đầu sau khi bấm “Tải hết ảnh về & Dọn dẹp” và đã bật tính năng xóa logo.
- Đổi ảnh, bỏ chọn ảnh hoặc lưu lại ảnh 2K ở Bước 3 sẽ khóa lại Bước 4 cho đến khi tải/dọn lại.
- Sửa Bước 4: hàm kiểm tra Firefly giờ đọc cả shadow DOM, nhận diện đúng các nút web component thay vì báo sai “Firefly chưa sẵn sàng”.
- Khi chưa đăng nhập Adobe hoặc editor Firefly chỉ render khung vỏ, app báo rõ “Chưa đăng nhập Firefly” để bạn tự đăng nhập, không báo lỗi chung chung.
- Sửa dứt điểm nút “Kiểm tra phiên bản mới”: app lấy bản mới từ GitHub Releases API trước, file `version.json` trên raw GitHub chỉ làm nguồn dự phòng. Đây là cách duy nhất chặn triệt để trường hợp CDN trả biến thể nén cũ dù đã thêm tham số chống cache.
- Nếu GitHub API tạm lỗi/rate-limit và raw cũng không có bản mới, app hiện “Chưa xác nhận được bản mới nhất” thay vì báo sai “Bạn đang dùng bản mới nhất”.


## v1.1.31 - 2026-11-25
- Sửa Bước 4 trên giao diện Firefly hiện tại: nhận diện đúng menu “Chỉnh sửa hình ảnh” dạng web component, tự tải ảnh vào input ẩn và chỉ bấm các nút đang active.
- Firefly giờ được chờ 5–10 giây sau khi mở để xác nhận tài khoản/giao diện; vào trình chỉnh sửa cũng chờ sẵn sàng trước khi thao tác, hết lượt vẫn dừng và báo đúng.
- Tô vùng logo quy đổi theo đúng khung ảnh 9:16 thay vì toàn bộ canvas; tab Firefly luôn được đóng sau khi tải xong hoặc khi lỗi.
- Thêm dự phòng GitHub Releases API khi file `version.json` trên raw GitHub bị CDN cache cũ.


## v1.1.30 - 2026-11-25
- Thêm Bước 4 (tùy chọn, tắt mặc định): sau khi Bước 3 lưu xong toàn bộ ảnh 2K, app mở Adobe Firefly bằng chung cửa sổ Chrome/hồ sơ với Flow để xóa logo; bạn tự đăng nhập Adobe, app không lưu mật khẩu Gmail/Adobe.
- Firefly đi theo luồng Hình ảnh → Chỉnh sửa hình ảnh → tải ảnh → Chấm sửa và xóa → tô vùng logo → Xóa. App chỉ tải xuống và lưu ảnh sạch khi bạn bấm “Ổn” (có nút “Xem trên Firefly” để kiểm tra trước).
- Ảnh sạch lưu vào `output/<dự án>/anhdaxoalogo/`; ảnh gốc có logo chỉ bị xóa sau khi mọi cảnh đã duyệt xong (có thể “Bỏ qua” từng cảnh để giữ ảnh gốc).
- Cho phép chỉnh vùng logo bằng 4 ô phần trăm X/Y/Rộng/Cao trong Cài đặt; tự giới hạn để vùng tô luôn nằm trong khung ảnh.
- Gặp giới hạn free Firefly thì dừng xóa logo, giữ nguyên ảnh gốc, báo “Đã hết lượt free Firefly. Hãy kết nối lại bằng Gmail khác rồi tiếp tục.” và chỉ tiếp tục khi bạn bấm “Đã kết nối Gmail khác”; không tự đổi tài khoản.
- Chọn lại/bỏ chọn ảnh ở Bước 3 thì hủy kết quả xóa logo của ảnh cũ; lỗi/quota là trạng thái cuối do bạn quản lý, không tự chạy lại.


## v1.1.29 - 2026-11-23
- Sửa lỗi kẹt cờ hộp thoại cập nhật: nếu dialog "Có phiên bản mới" bị modal khác thay thế, nút "Kiểm tra phiên bản mới" có thể im lặng; giờ reset cờ đúng và chỉ chặn khi dialog cập nhật thật sự đang mở.
- Làm rõ lỗi chọn/làm lại ảnh khi thiếu `runId/imageId` hoặc ảnh không còn trong lượt chạy, thay vì báo chung "Không tìm thấy ảnh".
- Đóng tab Flow xong tự tính lại các lượt nâng 2K đang treo; tránh trùng lượt nâng 2K cùng lúc và tự tiếp tục các lượt bị treo trạng thái nâng cấp.
- Cải thiện khả năng truy cập danh sách dự án: mục dự án có vai trò nút và nhãn mở dự án rõ ràng.


## v1.1.28 - 2026-11-23
- Bước 3 (cách 1): gặp "hoạt động bất thường" thì đóng tab Flow của cảnh, mở tab Flow/dự án mới và chạy lại cảnh đó; không tạm dừng toàn tool, các cảnh khác vẫn chạy.
- Nếu bị chặn lặp lại, tool giãn nhẹ thời gian chờ ở các lần sau (lần đầu vẫn nhanh), tối đa 5 lần; hết 5 lần báo đúng "Cảnh <số> hiện không thực hiện được do lỗi Flow, hãy kiểm tra lại" kèm nút "Mở Flow".


## v1.1.27 - 2026-11-23
- Bước 3: khi Flow báo "hoạt động bất thường" ở một cảnh, tool tự đóng tab Flow của cảnh đó, mở cửa sổ Flow mới với dự án mới rồi chạy tiếp; tối đa 5 lần.
- Sau 5 lần vẫn lỗi, hiện đúng thông báo "Cảnh <số> hiện không thực hiện được do lỗi Flow, hãy kiểm tra lại" kèm nút "Mở Flow" mở đúng dự án của cảnh đó. Các cảnh khác và bước 1/2 không bị dừng theo.


## v1.1.26 - 2026-11-23
- Cắt sát ảnh từ bản 2K giờ vẫn được tính là ảnh 2K dùng cho bước sau (cạnh ngắn chỉ cần 512px, thay vì 1024px), không còn báo "chưa đạt 2K" với ảnh như 716×2246.
- Ảnh đã cắt từ trước đang báo lỗi tự hết khi mở lại dự án; chuẩn 2K của ảnh tải về và ảnh tự tải vẫn giữ nguyên.


## v1.1.25 - 2026-11-23
- Sửa lỗi bộ dọn prompt cũ xóa mất đoạn "Phong cách ảnh chụp đời thực… KOL/KOC" khi mở lại dự án hoặc đọc mẫu prompt.
- Máy cài mới để trống ô prompt cả 3 bước; 3 prompt riêng của chủ máy nằm trong `data/templates.json`, không đóng gói vào installer.
- Ô tiếng Anh vẫn tự dịch bằng Google ngay khi sửa ô tiếng Việt (và tự dịch lúc mở nếu ô Anh còn trống).


## v1.1.24 - 2026-11-23
- Sửa lỗi không thêm được ảnh KOC: Electron không hỗ trợ hộp nhập tên của trình duyệt, giờ thay bằng ô nhập ngay trong hộp thoại của app, điền sẵn tên file.
- Bấm Hủy / Esc / bấm ra nền khi đặt tên KOC giờ hiện lại thư viện KOC, không để hộp thoại treo.


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
