<img width="300" height="130" alt="image" src="https://github.com/user-attachments/assets/091e1827-0c3f-4052-9b48-3229819beb10" />

<br>

<img width="206" height="45" alt="image" src="https://github.com/user-attachments/assets/9d2c03d7-40ab-4abd-938c-82687d93f819" />

# Extention hỗ trợ xuất dữ liệu điểm danh

<br>

## 📌Hướng dẫn cài đặt, sử dụng:

### ***I. Hướng dẫn cài đặt***
1. *Giải nén toàn bộ file ZIP Giữ nguyên thư mục `hanet-mttq-tool-cuongnnb`.*
2. *Mở trang quản lý tiện ích của trình duyệt: `edge://extensions` (thay bằng `chrome` nếu dùng Chrome.*
3. *Bật **Developer mode**.*
4. *Chọn **Load unpacked**. browse đến thư mục `hanet-mttq-tool-cuongnnb`.*
5. *Đăng nhập [HANNET](https://connect.hanet.ai/) (nếu đã đăng nhập rồi thì nhấn F5 để tải lại trang).*

### ***II. Thông tin***
- *Đây là bản thử nghiệm v0.1.3, lưu hành nội bộ trên địa điểm code `997606`.*
- *Tiện ích truy cập, theo dõi điều hướng nội bộ. Giao diện bổ sung chỉ xuất hiện ở **Tổng quan** và **Face ID/Vào ra** của địa điểm 997606.*
- *~~Nếu trình duyệt do cơ quan quản lý không cho phép cài tiện ích ngoài kho, chuyển bộ mã này cho bộ phận công nghệ thông tin để triển khai theo cấu hình của cơ quan.~~*

### ***III. Các tính năng, mô tả và trạng thái hoạt động***
| **Tính năng** | **Mô tả chức năng** | **Trạng thái** |
| :--- | :--- | :---: |
| Xuất dữ liệu | Xuất dữ liệu vào ra (đã hỗ trợ xuất theo từng ban, bản web hiện tại của Hannet đang không có | ✅ |
| Sắp xếp FaceID theo giờ | Sắp xếp FaceID theo giờ xuất hiện | ✅ | 
| Sắp xếp FaceID theo phòng ban | Đổi thứ tự sắp xếp của FaceID (hiện tại đang sắp xếp theo thứ tự thêm vào của các FaceID | ✅ |
| Tải xuống video | Tải xuống video (của FaceID cụ thể được chọn) theo từng mối giờ, từng ngày, hoặc tất cả | ✅ |

#### 🔍 3.1 Tính năng xuất dữ liệu
1. *Vào **Face ID => Vào ra***
2. *Chọn ngày hoặc khoảng ngày bằng bộ chọn thời gian có sẵn của HANET.* (có thể áp dụng single filter với FaceID cụ thể)
3. *Bấm **1. Đọc đủ các trang**. Có thể chọn 50 hàng/trang trên HANET trước để giảm số lần chuyển trang. Đợi thông báo đã đọc đủ danh sách. Tiện ích tự lần lượt đọc các trang và sẽ trở về trang đầu.*
5. *Ở mục **2. Phòng ban**, chọn Phòng, ban cần xuất ở menu dropdown và kiểm tra số FaceID.*
6. *Bấm **3. Xuất Excel**. File `.xlsx` chỉ chứa người thuộc phòng ban đã chọn. Các ban khác làm tương tự.*

> [!Note]
> *File có hai sheets*
> - ***Điểm danh theo ban:** mã FaceID, họ tên, mã nhân viên, phòng ban, chức vụ và các cột ngày. Giữ nguyên cặp giờ trong bảng HANET.*
> - **Thông tin báo cáo:** phòng ban, số người, nguồn, nhãn ngày và thời điểm lấy dữ liệu.*
> - *Các nhãn ngày-tháng được giữ nguyên như HANET; tiện ích không đoán năm của báo cáo. Đây là bản xuất **bảng Vào ra** với một cặp giờ/người/ngày, chưa phải bản xuất tất cả các lượt camera nhận diện trong ngày. Cặp giờ gần nhất cũng không tự xác nhận một người đã ra về kết thúc ngày làm việc.*
> - *Không gộp người theo tên. Hai người trùng tên vẫn được giữ riêng theo mã FaceID. Không bỏ người chưa có giờ điểm danh (`--`). Phòng ban trống được thể hiện thành nhóm **Chưa phân phòng ban** nếu có.*
> - *Khi đổi ngày, tìm kiếm hoặc thao tác trên bộ lọc HANET, cần đọc lại trước khi xuất. File phản ánh thời điểm đọc, không phải luồng dữ liệu thời gian thực.*

#### 🔍 3.2 Tính năng Sắp xếp FaceID đi sớm

1. *Vào **Tổng quan**, chọn ngày.*
2. *Bấm **Cập nhật đi sớm**.*
3. *Thẻ **FaceID đi sớm** sẽ hiển thị 5 người có giờ đến mới nhất trong nhóm (Ví dụ: **07:59:42 => 07:59:17 => 07:50:00 => 06:30:00**)*. Bấm **Xem thêm** để xem đủ danh sách đã sắp xếp. Có thể đổi giữa **Mới nhất trước** và **Sớm nhất trước** ngay trong bảng chi tiết.

> [!Warning]
> - Nếu mở **Xem thêm** trực tiếp thì extention cũng nhận danh sách đầy đủ và tự áp dụng thứ tự đã chọn. Khi thay ngày hoặc số người thay đổi cần bấm **Cập nhật đi sớm** để cập nhật lại lại.
> - Thứ tự áp dụng cho **giờ HANET đang hiển thị trong nhóm đi sớm**. Tiện ích không đổi giờ làm việc, phân loại đi sớm/đi trễ hoặc thay giờ ghi nhận của một người.

#### 🔍 3.3 Tính năng Tải xuống video.
1. *Vào **FaceID** => **Danh sách** hoặc **Phòng ban***
2. *Chọn một FaceID cụ thể, và chọn ngày muốn lấy dữ liệu*
3. *Thao tác ở menu pop-up*

<br>

## 📌Dữ liệu, phạm vi truy cập và cập nhật thay đổi

### ***1. Dữ liệu***
- *Không cần nhập mật khẩu hay API key vào tiện ích.*
- *Không có máy chủ riêng, không gửi dữ liệu sang dịch vụ khác, không tải thư viện từ Internet.*
- *Chỉ đọc các thông tin trong bảng đang hiển thị. Dữ liệu đọc được giữ trong bộ nhớ của tab và được xóa khi tải lại, chuyển màn hình hoặc đóng tab.*
- *Không đọc cookie, token, biểu mẫu đăng nhập, ảnh khuôn mặt hay mẫu sinh trắc học.*
- *Các thao tác với HANET chỉ gồm mở/đóng bảng chi tiết và chuyển trang. Thứ tự mới là phần hiển thị trên trình duyệt có cài tiện ích.*
- *Quyền nạp mã được giới hạn ở `https://connect.hanet.ai/*` để hỗ trợ ứng dụng chuyển trang nội bộ; mã chỉ hoạt động trên hai đường dẫn của địa điểm `997606` nêu trên.*

### ***2. Trạng thái kiểm thử (cá nhân)***
- *Đã khảo sát trực tiếp giao diện HANET Connect **v4.1.1 ngày 08/09/2026** sau khi đăng nhập: bảng Vào ra có cột phòng ban, phân trang 20–50 hàng, danh sách đi sớm đầy đủ nằm trong bảng chi tiết.*
- *Đã kiểm tra logic sắp xếp, xử lý 276 người qua nhiều trang, chống thiếu/trùng mã, lọc phòng ban và cấu trúc file Excel.*
- ***Chưa cài và chạy tiện ích tích hợp trực tiếp trên hệ thống HANET thật.** Đây là bản thử nghiệm đầu tiên; khi cài trên máy, đối chiếu một ban nhỏ và thứ tự giờ trước khi dùng file để lập báo cáo. Nếu HANET thay giao diện hoặc phân trang, bộ nhận diện có thể cần cập nhật.*
- *File Excel kiểm thử được tạo trong `tests/generated sau khi thử:* 
    ```javascript
    node --test tests/core.test.cjs
    ```
### ***3. Các phiên bản, cập nhật thay đổi***
#### v0.1.0 | Bản thử nghiệm đầu tiên cùng 2 tính năng chính của tiện ích - [Link](https://github.com/nnbaocuong99/hanet-mttq-tool-cuongnnb/releases/tag/0.1.0)
- *Hỗ trợ xuất file dữ liệu điểm danh dưới dạng file Excel theo từng ban: đọc đủ các trang, giữ nguyên cặp giờ vào/ra theo ngày trong bảng.*
- *Sắp xếp FaceID đi sớm: giờ đến mới nhất đứng đầu, có thể đổi chiều sắp xếp.*

#### v0.1.1 - [Link](https://github.com/nnbaocuong99/hanet-mttq-tool-cuongnnb/releases/tag/0.1.1)
- *Sửa lại tính năng Sắp xếp FaceID*
