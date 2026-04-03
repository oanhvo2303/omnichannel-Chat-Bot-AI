---
description: Quy trình tự động thiết kế, lập trình và review chéo một tính năng mới cho hệ thống Omnichannel.
---

steps:
  - step: 1
    name: "🧠 System Architecture (Thiết kế Kiến trúc)"
    model: "claude-opus" # Hoặc "claude-3.5-sonnet" tùy danh sách của Antigravity
    instruction: |
      Vai trò: Senior Solutions Architect.
      Nhiệm vụ: Đọc yêu cầu của Sếp, vạch ra cấu trúc Database, các API endpoints cần thiết và cấu trúc UI Components. 
      Yêu cầu: Phân tích sâu các rủi ro về Multi-tenant (dữ liệu chéo giữa các shop) trước khi chuyển sang bước code.
      Output: Bản thiết kế Markdown chi tiết.

  - step: 2
    name: "💻 Lập trình Backend (Core Logic)"
    model: "gemini-3.1-pro" # Thợ code tốc độ cao, bọc context rộng
    instruction: |
      Vai trò: Backend Developer.
      Nhiệm vụ: Đọc bản thiết kế từ Step 1 và viết code Node.js/Express/SQLite.
      Yêu cầu: 
      1. Áp dụng JWT Authentication và try/catch cho mọi route.
      2. Code KHÔNG DÙNG PLACEHOLDER, phải chạy được ngay.
      3. Tối ưu hiệu suất query Database.

  - step: 3
    name: "🎨 Lập trình Frontend (UI/UX)"
    model: "gemini-3.1-pro"
    instruction: |
      Vai trò: Frontend Developer.
      Nhiệm vụ: Dựa vào API từ Step 2, code UI bằng Shadcn/UI và Tailwind CSS.
      Yêu cầu: Giao diện phải mượt mà, xử lý loading state, và có toast notifications đầy đủ.

  - step: 4
    name: "🕵️ Security & Bug Audit (Review Chéo)"
    model: "claude-opus" # Gọi lại chuyên gia suy luận để vạch lá tìm sâu
    instruction: |
      Vai trò: Hacker mũ trắng / Senior QA.
      Nhiệm vụ: Rà soát toàn bộ code do Gemini sinh ra ở Step 2 và Step 3.
      Yêu cầu:
      1. Tìm lỗ hổng bảo mật (thiếu check shop_id, hở token).
      2. Tìm lỗi logic (vòng lặp vô hạn, render UI sai).
      Hành động: NẾU CÓ LỖI -> Tự động sửa lại code. NẾU KHÔNG -> Báo cáo Sếp nghiệm thu.