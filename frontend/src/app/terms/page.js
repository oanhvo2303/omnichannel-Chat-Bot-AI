import Link from 'next/link';

export const metadata = {
  title: 'Điều Khoản Dịch Vụ — OmniBot',
  description: 'Điều khoản sử dụng dịch vụ OmniBot - Nền tảng quản lý chat đa kênh',
};

export default function TermsPage() {
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
            Điều Khoản Dịch Vụ
          </h1>
          <p style={{ color: '#666', marginBottom: 40, fontSize: 15 }}>
            Cập nhật lần cuối: 11/05/2026 | Hiệu lực từ: 01/01/2026
          </p>

          <Section title="1. Giới Thiệu">
            <p>Chào mừng bạn đến với <strong>OmniBot</strong> — nền tảng quản lý chat đa kênh dành cho doanh nghiệp
            Việt Nam. Bằng cách sử dụng dịch vụ của chúng tôi, bạn đồng ý tuân thủ các điều khoản và điều kiện được
            nêu trong tài liệu này.</p>
          </Section>

          <Section title="2. Định Nghĩa">
            <ul style={{ paddingLeft: 24, lineHeight: 1.8 }}>
              <li><strong>"Dịch vụ"</strong>: Nền tảng OmniBot bao gồm dashboard quản lý, chatbot AI, webhook Facebook/Zalo.</li>
              <li><strong>"Người dùng"</strong>: Cá nhân hoặc doanh nghiệp đăng ký và sử dụng dịch vụ.</li>
              <li><strong>"Dữ liệu khách hàng"</strong>: Thông tin của khách hàng cuối được thu thập qua nền tảng.</li>
              <li><strong>"Trang Facebook"</strong>: Trang doanh nghiệp Facebook được kết nối vào hệ thống.</li>
            </ul>
          </Section>

          <Section title="3. Điều Kiện Sử Dụng">
            <p>Để sử dụng OmniBot, bạn phải:</p>
            <ul style={{ paddingLeft: 24, lineHeight: 1.8 }}>
              <li>Từ 18 tuổi trở lên hoặc có sự đồng ý của người giám hộ hợp pháp.</li>
              <li>Cung cấp thông tin đăng ký chính xác và đầy đủ.</li>
              <li>Có quyền quản trị hợp lệ đối với các Trang Facebook được kết nối.</li>
              <li>Tuân thủ Chính sách Sử dụng của Meta (Facebook) và các nền tảng liên quan.</li>
              <li>Không sử dụng dịch vụ cho mục đích bất hợp pháp hoặc vi phạm quyền của bên thứ ba.</li>
            </ul>
          </Section>

          <Section title="4. Quyền Truy Cập Facebook">
            <p>Khi kết nối Trang Facebook với OmniBot, bạn cấp cho chúng tôi quyền:</p>
            <ul style={{ paddingLeft: 24, lineHeight: 1.8 }}>
              <li>Nhận và gửi tin nhắn Messenger thay mặt Trang của bạn (<code>pages_messaging</code>).</li>
              <li>Đọc và phản hồi comment trên bài viết (<code>pages_manage_engagement</code>).</li>
              <li>Xem danh sách Trang bạn quản lý (<code>pages_show_list</code>).</li>
              <li>Quản lý cài đặt webhook (<code>pages_manage_metadata</code>).</li>
              <li>Đọc thông tin cơ bản của người dùng tương tác với Trang (<code>Business Asset User Profile Access</code>).</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Bạn có thể thu hồi các quyền này bất kỳ lúc nào trong cài đặt Facebook của mình.
            </p>
          </Section>

          <Section title="5. Giới Hạn Trách Nhiệm">
            <p>OmniBot được cung cấp "nguyên trạng". Chúng tôi không chịu trách nhiệm về:</p>
            <ul style={{ paddingLeft: 24, lineHeight: 1.8 }}>
              <li>Sự gián đoạn dịch vụ do lỗi của Facebook/Meta, Zalo hoặc nhà cung cấp hạ tầng.</li>
              <li>Phản hồi của AI không phù hợp với ngữ cảnh kinh doanh của bạn nếu chưa được cấu hình đúng.</li>
              <li>Thiệt hại gián tiếp phát sinh từ việc sử dụng dịch vụ.</li>
            </ul>
          </Section>

          <Section title="6. Bảo Mật Dữ Liệu">
            <p>
              Chúng tôi áp dụng các biện pháp bảo mật phù hợp để bảo vệ dữ liệu của bạn.
              Xem thêm tại <a href="/privacy" style={{ color: '#1877F2' }}>Chính Sách Quyền Riêng Tư</a>.
            </p>
          </Section>

          <Section title="7. Thanh Toán & Hoàn Tiền">
            <ul style={{ paddingLeft: 24, lineHeight: 1.8 }}>
              <li>Phí dịch vụ được tính theo gói đã đăng ký.</li>
              <li>Không hoàn tiền cho các kỳ đã sử dụng.</li>
              <li>Hủy đăng ký có thể thực hiện bất kỳ lúc nào; hiệu lực đến cuối kỳ thanh toán hiện tại.</li>
            </ul>
          </Section>

          <Section title="8. Chấm Dứt Dịch Vụ">
            <p>Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản nếu phát hiện vi phạm điều khoản này.
            Bạn có thể yêu cầu xóa tài khoản bất kỳ lúc nào bằng cách liên hệ với chúng tôi.</p>
          </Section>

          <Section title="9. Thay Đổi Điều Khoản">
            <p>Chúng tôi có thể cập nhật điều khoản này định kỳ. Mọi thay đổi sẽ được thông báo qua email
            hoặc thông báo trong ứng dụng ít nhất 7 ngày trước khi có hiệu lực.</p>
          </Section>

          <Section title="10. Liên Hệ">
            <p>Mọi thắc mắc về điều khoản, vui lòng liên hệ:</p>
            <div style={{
              background: '#f0f7ff', borderRadius: 12, padding: '20px 24px',
              marginTop: 12, borderLeft: '4px solid #1877F2'
            }}>
              <p style={{ margin: '4px 0' }}>📧 Email: <strong>support@pgquangngai.io.vn</strong></p>
              <p style={{ margin: '4px 0' }}>🌐 Website: <strong>https://pgquangngai.io.vn</strong></p>
              <p style={{ margin: '4px 0' }}>📍 Địa chỉ: Quảng Ngãi, Việt Nam</p>
            </div>
          </Section>

          {/* Footer links */}
          <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eee', textAlign: 'center' }}>
            <Link href="/privacy" style={{ color: '#1877F2', marginRight: 24, textDecoration: 'none', fontSize: 14 }}>
              Chính Sách Quyền Riêng Tư
            </Link>
            <Link href="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>
              Quay về Trang Chủ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1877F2', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #e8f0fe' }}>
        {title}
      </h2>
      <div style={{ color: '#444', lineHeight: 1.8, fontSize: 15 }}>
        {children}
      </div>
    </div>
  );
}
