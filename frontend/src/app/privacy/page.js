import Link from 'next/link';

export const metadata = {
  title: 'Chính Sách Quyền Riêng Tư — OmniBot',
  description: 'Chính sách quyền riêng tư của OmniBot - Nền tảng quản lý chat đa kênh',
};

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1877F2', padding: '32px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24
          }}>🤖</div>
          <div>
            <h1 style={{ color: '#fff', margin: 0, fontSize: 28, fontWeight: 700 }}>OmniBot</h1>
            <p style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>Nền tảng quản lý Chat Đa Kênh</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '48px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>
            Chính Sách Quyền Riêng Tư
          </h1>
          <p style={{ color: '#6b7280', marginBottom: 40, fontSize: 15 }}>
            Cập nhật lần cuối: 05/05/2026
          </p>

          <Section title="1. Giới Thiệu">
            <p>OmniBot ("chúng tôi", "của chúng tôi") là nền tảng SaaS quản lý chat đa kênh, tích hợp Facebook Messenger, Zalo OA, Instagram và các kênh thương mại điện tử. Chính sách này mô tả cách chúng tôi thu thập, sử dụng và bảo vệ thông tin của bạn khi sử dụng dịch vụ.</p>
            <p>Bằng cách sử dụng OmniBot, bạn đồng ý với các điều khoản trong chính sách này.</p>
          </Section>

          <Section title="2. Thông Tin Chúng Tôi Thu Thập">
            <SubTitle>2.1 Thông Tin Tài Khoản</SubTitle>
            <ul>
              <li>Địa chỉ email đăng ký</li>
              <li>Tên cửa hàng / doanh nghiệp</li>
              <li>Thông tin thanh toán (được xử lý qua bên thứ ba an toàn)</li>
            </ul>

            <SubTitle>2.2 Dữ Liệu Facebook (Thông qua Facebook API)</SubTitle>
            <p>Khi bạn kết nối Facebook Fanpage với OmniBot, chúng tôi truy cập:</p>
            <ul>
              <li><strong>Page Access Token</strong>: Để gửi/nhận tin nhắn qua Messenger API</li>
              <li><strong>Danh sách Fanpage</strong>: Để hiển thị danh sách trang bạn quản lý</li>
              <li><strong>Tin nhắn Messenger</strong>: Nội dung tin nhắn giữa Fanpage và khách hàng</li>
              <li><strong>Bình luận bài viết</strong>: Để tự động phản hồi bình luận</li>
              <li><strong>Thông tin profile khách hàng</strong>: Tên, ảnh đại diện (công khai)</li>
            </ul>
            <p style={{ background: '#FFF3CD', padding: '12px 16px', borderRadius: 8, borderLeft: '4px solid #F59E0B', fontSize: 14 }}>
              ⚠️ Chúng tôi <strong>KHÔNG</strong> lưu trữ mật khẩu Facebook, không truy cập tin nhắn cá nhân, không đăng bài thay mặt bạn nếu không có lệnh rõ ràng.
            </p>

            <SubTitle>2.3 Dữ Liệu Sử Dụng</SubTitle>
            <ul>
              <li>Địa chỉ IP, loại trình duyệt</li>
              <li>Thống kê tương tác trong nền tảng</li>
              <li>Logs hệ thống (để xử lý lỗi)</li>
            </ul>
          </Section>

          <Section title="3. Mục Đích Sử Dụng Dữ Liệu">
            <p>Chúng tôi sử dụng thông tin thu thập để:</p>
            <ul>
              <li>✅ Cung cấp dịch vụ nhắn tin tự động qua Messenger</li>
              <li>✅ Phân tích và hiển thị thống kê cho chủ cửa hàng</li>
              <li>✅ Cải thiện tính năng và trải nghiệm người dùng</li>
              <li>✅ Gửi thông báo kỹ thuật, cập nhật dịch vụ</li>
              <li>✅ Hỗ trợ kỹ thuật khi có yêu cầu</li>
              <li>❌ KHÔNG bán dữ liệu cho bên thứ ba</li>
              <li>❌ KHÔNG dùng dữ liệu cho quảng cáo của bên thứ ba</li>
            </ul>
          </Section>

          <Section title="4. Chia Sẻ Thông Tin">
            <p>Chúng tôi <strong>không bán, không trao đổi</strong> thông tin cá nhân của bạn cho bên thứ ba, ngoại trừ:</p>
            <ul>
              <li><strong>Meta Platforms (Facebook)</strong>: Để gửi tin nhắn qua Graph API theo yêu cầu của bạn</li>
              <li><strong>Nhà cung cấp dịch vụ</strong>: Hosting, database (có ký thỏa thuận bảo mật)</li>
              <li><strong>Yêu cầu pháp lý</strong>: Khi có lệnh của cơ quan nhà nước có thẩm quyền</li>
            </ul>
          </Section>

          <Section title="5. Bảo Mật Dữ Liệu">
            <ul>
              <li>Mã hóa HTTPS/TLS cho mọi kết nối</li>
              <li>Access Token được mã hóa và lưu trữ an toàn</li>
              <li>Xác thực JWT cho mọi API request</li>
              <li>Phân quyền đa tầng (multi-tenant isolation)</li>
              <li>Giám sát và log bảo mật 24/7</li>
            </ul>
          </Section>

          <Section title="6. Lưu Trữ và Xóa Dữ Liệu">
            <ul>
              <li>Dữ liệu tin nhắn được lưu tối đa <strong>12 tháng</strong></li>
              <li>Khi ngắt kết nối Fanpage, dữ liệu liên quan bị xóa trong 30 ngày</li>
              <li>Khi đóng tài khoản, toàn bộ dữ liệu bị xóa vĩnh viễn trong 30 ngày</li>
              <li>Bạn có thể yêu cầu xóa dữ liệu bất kỳ lúc nào qua email hỗ trợ</li>
            </ul>
          </Section>

          <Section title="7. Quyền Của Người Dùng">
            <p>Bạn có quyền:</p>
            <ul>
              <li>📋 <strong>Truy cập</strong>: Yêu cầu xem dữ liệu chúng tôi lưu về bạn</li>
              <li>✏️ <strong>Chỉnh sửa</strong>: Cập nhật thông tin tài khoản</li>
              <li>🗑️ <strong>Xóa</strong>: Yêu cầu xóa toàn bộ dữ liệu</li>
              <li>🔌 <strong>Ngắt kết nối</strong>: Hủy ủy quyền Facebook bất kỳ lúc nào trong cài đặt Facebook</li>
              <li>📤 <strong>Xuất dữ liệu</strong>: Tải xuống dữ liệu của bạn theo định dạng CSV</li>
            </ul>
          </Section>

          <Section title="8. Xóa Dữ Liệu Facebook">
            <p>Để xóa dữ liệu Facebook khỏi hệ thống OmniBot:</p>
            <ol>
              <li>Vào <strong>Facebook Settings</strong> → Business Integrations</li>
              <li>Tìm <strong>OmniBot</strong> → Remove</li>
              <li>Hoặc liên hệ trực tiếp qua email: <strong>support@pgquangngai.io.vn</strong></li>
            </ol>
            <p>Chúng tôi sẽ xử lý yêu cầu trong vòng <strong>72 giờ</strong>.</p>
          </Section>

          <Section title="9. Cookie">
            <p>Chúng tôi sử dụng cookie cần thiết để:</p>
            <ul>
              <li>Duy trì phiên đăng nhập (session)</li>
              <li>Nhớ cài đặt giao diện</li>
            </ul>
            <p>Chúng tôi <strong>không</strong> sử dụng cookie quảng cáo hay theo dõi hành vi.</p>
          </Section>

          <Section title="10. Trẻ Em">
            <p>Dịch vụ OmniBot không dành cho người dưới 18 tuổi. Chúng tôi không cố ý thu thập thông tin của trẻ em.</p>
          </Section>

          <Section title="11. Thay Đổi Chính Sách">
            <p>Chúng tôi có thể cập nhật chính sách này theo thời gian. Khi có thay đổi quan trọng, chúng tôi sẽ thông báo qua email hoặc thông báo trong ứng dụng ít nhất <strong>7 ngày trước</strong> khi có hiệu lực.</p>
          </Section>

          <Section title="12. Liên Hệ">
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 12, padding: '20px 24px' }}>
              <p style={{ margin: 0, fontWeight: 600, color: '#166534', marginBottom: 12 }}>📬 Liên hệ về quyền riêng tư:</p>
              <ul style={{ margin: 0, color: '#166534' }}>
                <li>Email: <strong>support@pgquangngai.io.vn</strong></li>
                <li>Website: <strong>https://pgquangngai.io.vn</strong></li>
                <li>Địa chỉ: Việt Nam</li>
              </ul>
            </div>
          </Section>

        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af', fontSize: 13 }}>
        © 2026 OmniBot. Mọi quyền được bảo lưu. |{' '}
        <Link href="/" style={{ color: '#1877F2', textDecoration: 'none' }}>Trang chủ</Link>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1877F2', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #E7F3FF' }}>
        {title}
      </h2>
      <div style={{ color: '#374151', lineHeight: 1.8, fontSize: 15 }}>{children}</div>
    </div>
  );
}

function SubTitle({ children }) {
  return <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginTop: 20, marginBottom: 8 }}>{children}</h3>;
}
