# Lịch sử phiên bản

## Unreleased

## v1.4.2 - 2026-11-27
## v1.4.1 - 2026-11-27
- Khung Firefly bên trái giờ cập nhật ngay theo tiến độ từng cảnh qua SSE; ảnh 07, 08 không còn bị kẹt ở nhãn cũ “chờ / làm lại” dù đã chạy xong.
- Trạng thái từng cảnh dùng chung một bảng nhãn: đang chạy / lỗi / chờ hàng đợi / đang làm lại / hết lượt — không còn gộp nhầm các trạng thái với nhau.
- Ảnh xem trước sau khi Firefly báo xong giờ có thêm bản lưu riêng và tự thử lại nếu chưa tải được; mất RAM hoặc reload app vẫn hiện trong khung “Ảnh đã xóa logo”, không cần bấm Chọn lại hay làm lại Firefly.
- Nút “Xóa” cảnh giờ xóa được cả khi đang chờ hoặc đang chạy Firefly: tool hỏi xác nhận, hủy riêng lượt của cảnh đó, đóng tab và nhả khóa để ảnh kế tiếp chạy tiếp (không ảnh hưởng các cảnh khác).


## v1.3.10 - 2026-11-27
- Nút “Xóa logo” bật được ngay cả khi chưa xong Bước 3: hiện ngay cạnh “Ghép cảnh thật” dưới dạng khóa như các bước chưa mở; dọn xong Bước 3 thì mở khóa, tích xanh, chữ xanh và tự sang Bước 4.
- Firefly báo “Đã hoàn tất thao tác tạo sinh” thì ảnh hiện ngay trong khung “Ảnh đã xóa logo” để xem trước; chỉ khi bấm “Chọn” ảnh mới được tải vào `anhdaxoalogo`.
- Sửa lỗi `download.saveAs ... ENOENT ... playwright-artifacts ... .part`: ảnh được giữ trong bộ nhớ thay vì copy từ file tạm của Chrome.
- Chip “Free n/3” trên Bước 4 giờ tự nhảy 0/3 → 1/3 → 2/3 ngay sau mỗi ảnh Firefly xong, không còn bị kẹt ở 0/3 cho tới khi đổi bước.


## v1.3.9 - 2026-11-27
- Ô chiếu Firefly giờ chụp từ surface của tab: khi tool dời cửa sổ ra ngoài màn hình, khung vẫn lên đều (~0,5s thay vì ~4s), không còn mất hình hay giật/delay.
- Chốt cứng tọa độ xóa logo sau khi test thật trên Chrome: tâm (93%, 96,02%), sát mép phải dưới của ảnh 2K.
- Cỡ cọ xóa logo tăng từ 14 lên 16 để phủ kín vùng logo.
- Đồng bộ tọa độ/cỡ cọ đã chốt vào mọi giá trị dự phòng (server, giao diện cài đặt và Firefly) để không bao giờ tụt lại bản cũ.


## v1.3.8 - 2026-11-27
- Dấu × của banner hết lượt và banner tạm dừng giờ nằm sát mép bên phải của dòng thông báo, không dính ngay sau chữ.
- Bấm “Kết nối Firefly” giờ đọc trực tiếp trang Firefly để check lượt free của Gmail hiện tại — kể cả Gmail đã dùng hết 3 lượt ở nơi khác trong khi bộ đếm của tool vẫn hiện 0/3. Không tạo ảnh, không tốn lượt.
- Phát hiện Gmail hết lượt ngay lúc bấm Kết nối thì hiện luôn banner hết lượt trên Bước 4 (với dấu × sát mép phải) và đổi chip Firefly, không cần đợi tool chạy ảnh.


## v1.3.7 - 2026-11-27
- Nhật ký Bước 4 lưu từ bản cũ tự đổi nhãn nút duyệt ảnh thành “Chọn” ngay khi mở dự án; câu “ảnh sạch được giữ trong anhdaxoalogo” giữ nguyên, không cần làm lại ảnh.
- Dấu × của banner hết lượt và banner tạm dừng chuyển xuống ngay cuối dòng chữ, không còn nằm ở góc trên bên phải.
- Bấm “Kết nối Firefly” giờ kiểm tra luôn Gmail hiện tại đã dùng lượt free hôm nay chưa; hết 3/3 thì báo ngay “Gmail này hôm nay đã hết lượt free”, còn dùng 1–2 lượt thì báo số lượt còn lại.


## v1.3.6 - 2026-11-27
- Banner hết lượt Firefly có thêm dấu × để tắt; tắt xong không hiện lại khi app tự làm mới.
- Đổi Gmail giờ làm lại đúng ảnh đầu tiên CHƯA bấm Chọn (kể cả ảnh vừa hết lượt giữa chừng); ảnh đã Chọn giữ nguyên, không nhảy sang ảnh kế.
- Chấm xanh nhấp nháy của chip Firefly và chữ “chiếu trực tiếp” đổi thành đúng kiểu pulse của chip “Flow: đã kết nối”.
- Bỏ hết chữ “bấm Ổn” trong giao diện và nhật ký: dùng “Chọn”, sửa lại các câu cho đúng luồng tool tự tải ảnh trước khi bạn duyệt.


## v1.3.5 - 2026-11-27
- Bấm Chạy tất cả/xóa logo thì cửa sổ Firefly bị dời ra ngoài màn hình ngay từ lúc khởi động, chỉ thấy màn hình app; vẫn giữ đúng kích thước full màn hình nên canvas không co. Bấm Kết nối/Xem trên Firefly mới hiện lại.


## v1.3.4 - 2026-11-27
- Chrome Firefly giờ luôn mở full màn hình, kể cả khi chạy ngầm; không còn thu nhỏ hay ép cỡ 1000×700 làm canvas co và chấm lệch logo.
- Chuyển thông báo “Firefly hết lượt free/ngày — đổi mail” từ chip Flow sang chip Firefly; chip “Flow: đã kết nối” chỉ còn nói chuyện Flow.
- Bỏ chữ “so sánh với ảnh gốc” ở ô “Ảnh đã xóa logo” cho gọn; ảnh vẫn nằm cạnh ảnh gốc để bạn tự so sánh.
- Gọn banner hết lượt Firefly: còn tên cảnh, số ảnh, giới hạn/ngày và “Đổi Gmail rồi bấm Tiếp tục”, bỏ đoạn dài cũ về tab đã đóng.


## v1.3.3 - 2026-11-27
- Bước 4 dùng chung kiểu nút với Bước 1-3: dưới ảnh sạch chỉ còn đúng 2 nút “Làm lại / Chọn” (đã chọn thì hiện “Đã chọn” + mác xanh), các thao tác hiếm dời xuống chân ô Firefly.
- Khung chiếu trực tiếp Firefly giờ cao bằng ảnh gốc; nguyên tab vẫn hiện trọn (contain), không cắt canvas, không kéo giãn.


## v1.3.2 - 2026-11-27
- Ảnh đã xóa logo giờ được ép đúng chiều rộng/cao của ảnh gốc (crop giữa theo tỷ lệ 9:16 rồi scale), không còn thấp hơn vài px như trước.


## v1.3.1 - 2026-11-27
## v1.2.10 - 2026-11-27
- Khung chiếu giờ chụp ĐÚNG tab Firefly của từng cảnh (không vớt tab Firefly gốc), poll 500ms/cache 180ms để xem từ đầu đến cuối mượt hơn.
- Giữ process Chrome ấm giữa các ảnh kế tiếp, không tắt rồi khởi động lại làm mất khung; hết lượt/lỗi vẫn đóng ngay.
- Thêm ô thứ 3 “Ảnh đã xóa logo” ngay cạnh khung chiếu trực tiếp: Firefly xong là ảnh sạch hiện ra để so sánh với ảnh gốc, nếu ổn mới bấm “Ổn” (không tải lại lần 2).
- Bước 3 không còn nút/badge/banner hay thông báo nào về xóa logo: “Ổn”, “Đổi Gmail”, “Làm lại xóa logo”, thư mục ảnh sạch chỉ còn ở Bước 4.
- Ảnh đã xóa logo dùng chung khung 9:16 với ảnh gốc (2 cột cùng cố định 210px): mọi cảnh cùng chiều rộng, cùng chiều cao, không còn ảnh sạch cao hơn ảnh gốc.
- Nút “Ổn”, “Làm lại”, “Đổi Gmail…” giờ nằm ngay dưới ảnh đã xóa logo; bỏ hết chữ “chưa có ảnh sạch / sẵn sàng — nếu ổn hãy bấm Ổn”.


## v1.2.9 - 2026-11-27
- Khung “chiếu trực tiếp” giờ rộng chạm đẹt mép khung, hết thanh đen hai bên; ảnh tự co theo đúng tỷ lệ tab Chrome nên không cắt canvas, không kéo giãn.
- Bấm “Chạy tất cả” hoặc bắt đầu xóa logo là Chrome tự gập về nền ngay, không nổi lên che app (kể cả lúc đang mở để đổi Gmail).
- Giữ trang Firefly ở trạng thái focus khi chạy nền nên thu nhỏ cửa sổ cũng không làm khung chiếu bị đen/đứng; ảnh vẫn mượt.


## v1.2.8 - 2026-11-27
- Khi bật chế độ **Xóa logo**, tab “Xóa logo” (đứng ngay sau “Ghép cảnh thật”) luôn hiện vòng tích xanh + chữ xanh, dù bạn đang ở bước 3 hay bước 4.


## v1.2.7 - 2026-11-27
- Danh sách dự án giờ xếp lần lượt theo số trong tên: dự án 1, dự án 2, dự án 3… (DA1, DA2, DA3…), không còn phụ thuộc ngày tạo.


## v1.2.6 - 2026-11-27
- Thanh **Xóa logo** bỏ hẳn số 4: dùng vòng tích; sang bước này hoặc làm xong thì vòng tích và chữ đều xanh như bước đã xong.


## v1.2.5 - 2026-11-27
- Sidebar thu gọn: tên “dự án 2” giờ rút gọn thành **DA2** nằm trọn trong khung; chữ dài không còn tràn ra ngoài.
- Thanh bước **Xóa logo** dùng chung kiểu với **Ghép cảnh thật** (cùng vòng số, cùng màu), chỉ khác chữ.


## v1.2.4 - 2026-11-27
- Sidebar thu gọn giờ hiện **đúng tên dự án** (dự án tên DA2 thì hiện DA2), bỏ hẳn vòng tròn bên trong, chỉ giữ khung ngoài; dự án đang mở có khung sáng.
- Dòng xóa logo đứng sau ghép ảnh thật: chỉ ghi **Xóa logo**, bỏ số 4.
- Khung chiếu trực tiếp chiếu nguyên tab Chrome đang xóa (không phóng to/cắt ảnh gốc), rộng 100% ô, cao bằng ảnh gốc; ảnh mới giải mã xong mới thay nên không bị giật.
- Bắt đầu chiếu ngay từ lúc tạo tab/chờ xử lý và đóng băng đúng lúc Firefly báo đã hoàn tất thao tác tạo sinh.
- Khi bấm chạy xóa logo, Chrome giữ ở nền, không nổi lên màn hình; chỉ nút Kết nối/Đổi Gmail mới mở cửa sổ để đăng nhập.


## v1.2.3 - 2026-11-27
- Khung chiếu Firefly: ảnh từ Chrome rộng **100% ô chiếu**, cao bằng ảnh gốc chưa xóa logo (~373px), lấp đầy khung không còn khoảng trống hai bên.
- Sidebar mở rộng trở lại kiểu bản đầu: vòng tròn chữ cái đầu + tên dự án + dòng trạng thái + nút xóa.
- Sidebar thu gọn về thanh 62px, vòng tròn hiện **DA1, DA2, DA3…**; dự án đang mở có vòng tròn xanh + chấm xanh góc phải.


## v1.2.2 - 2026-11-27
- Sửa chip Firefly không lên “đã kết nối”: trạng thái đang đọc nhầm cổng của Flow (9333) thay vì cổng riêng Firefly (9334).
- Bấm **Kết nối Firefly** thì cập nhật chip ngay (có chờ vài giây), không phải đợi vòng quét 6 giây; chấm xanh nhấp nháy ngay khi có kết nối.
- Sidebar thu gọn: số dự án trước đây bị ẩn hẳn do CSS, giờ hiện lại rõ; dự án đang mở có viền sáng + nhãn “đang mở” (ví dụ đang làm dự án 2 thì biết ngay).
- Số dự án giờ ổn định theo thứ tự tạo (dự án đầu tiên là 1), không đổi khi sửa tên hay chạy dự án.
- Khung chiếu Firefly cao bằng ảnh gốc chưa xóa logo; ảnh chiếu từ Chrome căn giữa, vừa khung, không phóng to/cắt; chấm “chiếu trực tiếp” nhấp nháy xanh lúc đang chiếu.


## v1.2.1 - 2026-11-27
- Bước 4: nút **Kết nối Firefly** đứng ngay cạnh chip trạng thái; chip “chưa kết nối” chuyển thành “đã kết nối” với chấm xanh nhấp nháy.
- Bước 4: nút **Chạy tất cả** chuyển xuống chính giữa, to hơn; vẫn chạy từng ảnh một, ảnh 1 xong mới mở tab ảnh 2.
- Hết lượt free Firefly: hiện nút **Đổi Gmail khác để tiếp tục**; sau khi mở Firefly đổi Gmail thì nút thành **Đã đổi Gmail, tiếp tục**.
- Ô chiếu Firefly lấp đầy chiều rộng khung, cao theo ảnh 9:16 để nhìn to và rõ; không phóng to, không cắt.
- Bỏ chấm riêng ở góc ô Firefly: chỉ giữ chấm nhấp nháy ngay trong chữ “chiếu trực tiếp”.
- Nút **Xóa logo** bật lên nền xanh giống nút **Tự động: Bật**; tắt thì viền/nền giống nút đang tắt. Bật sau khi xong Bước 3 là chuyển thẳng sang Bước 4.
- Đổi tên nút thành **Thư mục ảnh đã xóa logo**, dùng chung kiểu với nút **Mở thư mục kết quả**.
- Bỏ nút **Tải lại** trên header; giữ riêng mục “Tải lại giao diện” trong menu chuột phải.
- Đổi quy ước phiên bản: bản tới là **1.2.1**; mỗi nhánh đi từ .1 đến .10 rồi sang minor kế tiếp (1.2.10 → 1.3.1), không có patch .11.
- Sidebar thu gọn thiết kế lại: lưới 2 ô số theo thứ tự dự án (1, 2, 3…), thêm ô “+” để tạo dự án mới.


## v1.1.48 - 2026-11-26
- Bước 4 thêm nút **Chạy tất cả**: xếp mọi ảnh chưa xong vào hàng chờ, tool chạy từng ảnh một theo số 01, 02, 03…; đúng 3 ảnh/mỗi Gmail, hết lượt thì nhắc đổi Gmail rồi làm tiếp ảnh kế tiếp, không làm lại ảnh đã xong.
- Khung trái đổi nút thành **Kết nối Firefly** và thêm chip báo trạng thái kết nối Firefly.
- Chữ “chiếu trực tiếp” trên ô Firefly cũng chuyển **xanh nhấp nháy** cùng chấm tròn khi đang chiếu thật.


## v1.1.47 - 2026-11-26
- Tắt “Xóa logo” thì tab **Bước 4** biến mất hẳn, chỉ còn 1-2-3; bật lại thì Bước 4 hiện ngay sau Bước 3. Chưa xong Bước 3 thì bấm bật cũng không chuyển nút sang trạng thái BẬT.
- Ô chiếu trực tiếp Firefly có chấm tròn: đang chiếu thì **xanh lá nhấp nháy**, dừng/chờ Ổn thì tắt.


## v1.1.46 - 2026-11-26
- Bỏ ô “Ảnh Bước 4” thừa trong khung điều khiển bên trái (ngay dưới mục Hướng dẫn); khung phải — tải ảnh lên và chiếu trực tiếp Firefly — giữ nguyên.


## v1.1.45 - 2026-11-26
- Bỏ dòng note/error dài bên dưới 2 khung Bước 4 (kể cả câu báo hết lượt free) — không còn chiếm chỗ; trạng thái vẫn hiện trên badge và tiến trình trong ô Firefly.
- Mỗi cảnh Bước 4 có thêm nút **Xóa** ở góc phải trên cùng để bỏ cảnh đó; đang chạy Firefly thì chặn xóa và đóng luôn tab Firefly khi xóa xong.


## v1.1.44 - 2026-11-26
- Sửa ô chiếu trực tiếp Firefly: ảnh giữ nguyên khung 9:16 (`contain`), không còn bị phóng to/cắt hay mờ; khung vẫn rộng ngang nhưng không kéo dài xuống.
- Chiếu trực tiếp mượt hơn: poll 650ms, dùng lại 1 session CDP, cache box canvas và cache ảnh ngắn, bật chụp nhanh `optimizeForSpeed`.
- Khi Firefly chưa có canvas 9:16 thì ô chiếu để trống thay vì chụp cả trang — không còn hiện giao diện đầu Firefly lên app.
- Cửa sổ Chrome Firefly mở cỡ ~1000×700, lệch góc trên, vẫn hiện thanh tab; bỏ màn hình chào lần đầu.


## v1.1.43 - 2026-11-26
- Bước 4: ô Firefly giờ rộng ngang gần tới mép phải, chiều cao cố ~373px bằng ô gốc nên không còn kéo dài xuống; ảnh giữ tỉ lệ, không giãn méo hay mờ.
- Ảnh chiếu trực tiếp Firefly căn theo đáy để vùng logo luôn nằm trong tầm mắt; chiều cao cố định nên khung không bị nhảy/giật khi ảnh tải về.


## v1.1.42 - 2026-11-26
- Bước 4: ô ảnh gốc giữ gọn ~210px, ô Firefly kéo dài sang phải để nhìn rõ vùng đã xóa; cả 2 vẫn khung 9:16 nên căn tọa độ 1:1.
- Tiến trình Firefly chuyển từ dưới 2 ô vào ngay dưới ô Firefly, chỉ hiện từng bước một theo thời gian thực.


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
