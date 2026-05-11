import Link from 'next/link';

export const metadata = {
  title: 'Xóa Dữ Liệu Người Dùng — OmniBot',
  description: 'Hướng dẫn yêu cầu xóa dữ liệu Facebook khỏi OmniBot',
};

export default function DataDeletionPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1877F2', padding: '32px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🗑️</div>
          <div>
            <h1 style={{ color: '#fff', margin: 0, fontSize: 28, fontWeight: 700 }}>OmniBot</h1>
            <p style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>Yêu Cầu Xóa Dữ Liệu</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '48px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          
          <h1 style={{ fontSize: 30, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Xóa Dữ Liệu Người Dùng</h1>
          <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 40 }}>
            Bạn có quyền yêu cầu xóa toàn bộ dữ liệu cá nhân mà OmniBot đã lưu trữ liên quan đến tài khoản Facebook của bạn.
          </p>

          {/* What we store */}
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: '24px', marginBottom: 32 }}>
            <h2 style={{ color: '#0369A1', fontSize: 18, fontWeight: 700, margin: '0 0 12px 0' }}>📋 Dữ liệu chúng tôi lưu trữ</h2>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', lineHeight: 2 }}>
              <li>Tên và ảnh đại diện công khai của bạn (khi bạn nhắn tin cho Fanpage)</li>
              <li>Nội dung tin nhắn giữa bạn và Fanpage</li>
              <li>Lịch sử tương tác với bot</li>
              <li>Thông tin đơn hàng (nếu có)</li>
            </ul>
          </div>

          {/* Step-by-step instructions */}
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1877F2', marginBottom: 20, paddingBottom: 8, borderBottom: '2px solid #E7F3FF' }}>
            Cách yêu cầu xóa dữ liệu
          </h2>

          {/* Option 1: Via Facebook */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1877F2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>1</div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Xóa qua Facebook Settings (Nhanh nhất)</h3>
            </div>
            <div style={{ marginLeft: 48, color: '#374151', lineHeight: 1.8 }}>
              <ol style={{ paddingLeft: 20 }}>
                <li>Truy cập <strong>Facebook.com</strong> → <strong>Settings & Privacy → Settings</strong></li>
                <li>Chọn <strong>"Security and Login"</strong> hoặc <strong>"Apps and Websites"</strong></li>
                <li>Tìm <strong>"OmniBot"</strong> trong danh sách ứng dụng</li>
                <li>Nhấn <strong>"Remove"</strong> → Chọn <strong>"Remove and delete all activity"</strong></li>
              </ol>
              <p style={{ background: '#F0FDF4', padding: '10px 14px', borderRadius: 8, fontSize: 14, color: '#166534' }}>
                ✅ Facebook sẽ tự động gửi yêu cầu xóa đến chúng tôi và xử lý trong <strong>72 giờ</strong>.
              </p>
            </div>
          </div>

          {/* Option 2: Via Email */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1877F2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>2</div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Gửi yêu cầu qua Email</h3>
            </div>
            <div style={{ marginLeft: 48, color: '#374151', lineHeight: 1.8 }}>
              <p>Gửi email đến <a href="mailto:support@pgquangngai.io.vn" style={{ color: '#1877F2', fontWeight: 600 }}>support@pgquangngai.io.vn</a> với tiêu đề:</p>
              <div style={{ background: '#F3F4F6', padding: '12px 16px', borderRadius: 8, fontFamily: 'monospace', fontSize: 14, marginBottom: 12 }}>
                [XÓA DỮ LIỆU] Yêu cầu xóa dữ liệu Facebook — [Tên của bạn]
              </div>
              <p style={{ fontSize: 14, color: '#6b7280' }}>Bao gồm: Tên Facebook, Facebook User ID (nếu có). Chúng tôi xử lý trong <strong>72 giờ</strong>.</p>
            </div>
          </div>

          {/* What happens after */}
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
            <h3 style={{ color: '#9A3412', fontSize: 16, fontWeight: 700, margin: '0 0 12px 0' }}>⏱️ Quy trình xử lý</h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', lineHeight: 2, fontSize: 14 }}>
              <li>Nhận yêu cầu → Xác nhận trong <strong>24 giờ</strong></li>
              <li>Xóa tin nhắn, thông tin khách hàng → <strong>72 giờ</strong></li>
              <li>Xóa logs và dữ liệu backup → <strong>30 ngày</strong></li>
              <li>Gửi email xác nhận hoàn tất</li>
            </ul>
          </div>

          {/* Check status */}
          <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '20px 24px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>📬 Kiểm tra trạng thái yêu cầu</h3>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              Sau khi gửi yêu cầu, bạn sẽ nhận được mã xác nhận (confirmation code) qua email.
              Liên hệ <strong>support@pgquangngai.io.vn</strong> để kiểm tra tiến độ.
            </p>
          </div>

        </div>

        <p style={{ textAlign: 'center', marginTop: 24, color: '#9ca3af', fontSize: 13 }}>
          <Link href="/privacy" style={{ color: '#1877F2', textDecoration: 'none' }}>Chính sách quyền riêng tư</Link>
          {' · '}
          <Link href="/" style={{ color: '#1877F2', textDecoration: 'none' }}>Trang chủ</Link>
        </p>
      </div>
    </div>
  );
}
