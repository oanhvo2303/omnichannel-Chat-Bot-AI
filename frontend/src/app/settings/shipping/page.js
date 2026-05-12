"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Truck, CheckCircle2, ShieldAlert, Package, MapPin, Phone, User, Save, Loader2 } from "lucide-react";
import { API_BASE, authFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════
// VTP Service Types
// ═══════════════════════════════════════
const VTP_SERVICES = [
  // ── Dịch vụ cơ bản ──
  { value: "VCN",  label: "Chuyển Nhanh",        desc: "1-2 ngày",     icon: "⚡", group: "basic" },
  { value: "VTK",  label: "Tiết Kiệm",           desc: "3-5 ngày",     icon: "💰", group: "basic" },
  { value: "VHT",  label: "Hỏa Tốc",             desc: "Nội thành",    icon: "🔥", group: "basic" },
  { value: "PTN",  label: "Phát Trong Ngày",      desc: "Same-day",     icon: "📦", group: "basic" },
  { value: "PHS",  label: "Phát Hàng Sáng",       desc: "Trước 12h",    icon: "🌅", group: "basic" },
  // ── Dịch vụ TMĐT / COD ──
  { value: "LCOD", label: "LCOD - Liên tỉnh COD", desc: "Thu hộ LT",    icon: "💵", group: "tmdt" },
  { value: "NCOD", label: "NCOD - Nội tỉnh COD",  desc: "Thu hộ NT",    icon: "💴", group: "tmdt" },
  { value: "SCOD", label: "SCOD - COD Nhanh",     desc: "COD Express",  icon: "💳", group: "tmdt" },
  { value: "VCOD", label: "VCOD - COD Tiêu chuẩn",desc: "COD Standard", icon: "🏷️", group: "tmdt" },
  // ── Dịch vụ theo hợp đồng (Cam kết sản lượng) ──
  { value: "TMĐT7", label: "Cam kết SL 7",        desc: "TMĐT 7 ngày",  icon: "📋", group: "contract" },
];

// ═══════════════════════════════════════
// GHN Service Types
// ═══════════════════════════════════════
const GHN_SERVICES = [
  { value: 2, label: "Hàng nhẹ",  desc: "E-Commerce Standard" },
  { value: 5, label: "Hàng nặng", desc: "Traditional" },
];

const GHN_REQUIRED_NOTES = [
  { value: "CHOTHUHANG",         label: "Cho thử hàng" },
  { value: "CHOXEMHANGKHONGTHU", label: "Cho xem, không thử" },
  { value: "KHONGCHOXEMHANG",    label: "Không cho xem hàng" },
];

export default function ShippingSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingGhtk, setSavingGhtk] = useState(false);
  const [savingGhn, setSavingGhn] = useState(false);
  const [savingVtp, setSavingVtp] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  
  // Tokens
  const [ghtkToken, setGhtkToken] = useState("");
  const [ghnToken, setGhnToken] = useState("");
  const [vtpToken, setVtpToken] = useState("");
  
  // Statuses
  const [ghtkStatus, setGhtkStatus] = useState("disconnected");
  const [ghnStatus, setGhnStatus] = useState("disconnected");
  const [vtpStatus, setVtpStatus] = useState("disconnected");

  // ─── Cấu hình chung (Sender Info) ───
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderProvince, setSenderProvince] = useState("Hồ Chí Minh");
  const [senderDistrict, setSenderDistrict] = useState("Quận 1");

  // ─── Cấu hình riêng từng hãng ───
  const [vtpService, setVtpService] = useState("VCN");
  const [ghnServiceType, setGhnServiceType] = useState(2);
  const [ghnRequiredNote, setGhnRequiredNote] = useState("CHOXEMHANGKHONGTHU");
  const [defaultWeight, setDefaultWeight] = useState(500);

  // ─── Phí ship mặc định (Shop Settings) ───
  const [defaultShipFee, setDefaultShipFee] = useState(30000);
  const [freeShipThreshold, setFreeShipThreshold] = useState(0);
  const [freeShipMinQty, setFreeShipMinQty] = useState(0);
  const [savingShipFee, setSavingShipFee] = useState(false);

  useEffect(() => {
    fetchIntegrations();
    fetchShippingConfig();
    fetchShipFeeSettings();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/integrations`);
      if (res.ok) {
        const data = await res.json();
        const ghtk = data.integrations.find(i => i.platform === "ghtk");
        const ghn = data.integrations.find(i => i.platform === "ghn");
        const vtp = data.integrations.find(i => i.platform === "viettel_post");
        
        if (ghtk) { setGhtkStatus(ghtk.status); setGhtkToken("••••••••••••••••"); }
        if (ghn) { setGhnStatus(ghn.status); setGhnToken("••••••••••••••••"); }
        if (vtp) { setVtpStatus(vtp.status); setVtpToken("••••••••••••••••"); }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchShippingConfig = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/integrations/shipping-config`);
      if (res.ok) {
        const { config } = await res.json();

        // VTP metadata
        const vtpMeta = config?.viettel_post?.metadata || {};
        if (vtpMeta.service) setVtpService(vtpMeta.service);

        // GHN metadata
        const ghnMeta = config?.ghn?.metadata || {};
        if (ghnMeta.service_type_id) setGhnServiceType(ghnMeta.service_type_id);
        if (ghnMeta.required_note) setGhnRequiredNote(ghnMeta.required_note);

        // Sender Info — có thể lưu ở bất kỳ hãng nào, ưu tiên vtp → ghn → ghtk
        const senderMeta = vtpMeta.sender || ghnMeta.sender || config?.ghtk?.metadata?.sender || {};
        if (senderMeta.name) setSenderName(senderMeta.name);
        if (senderMeta.phone) setSenderPhone(senderMeta.phone);
        if (senderMeta.address) setSenderAddress(senderMeta.address);
        if (senderMeta.province) setSenderProvince(senderMeta.province);
        if (senderMeta.district) setSenderDistrict(senderMeta.district);

        // Default weight
        const weight = vtpMeta.default_weight || ghnMeta.default_weight || 500;
        setDefaultWeight(weight);
      }
    } catch (err) {
      console.error("[ShippingConfig] Lỗi tải cấu hình:", err);
    }
  };

  const fetchShipFeeSettings = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/orders/shop-settings`);
      if (res.ok) {
        const data = await res.json();
        setDefaultShipFee(data.default_shipping_fee ?? 30000);
        setFreeShipThreshold(data.free_shipping_threshold ?? 0);
        setFreeShipMinQty(data.free_shipping_min_quantity ?? 0);
      }
    } catch (err) {
      console.error("[ShipFee] Lỗi tải:", err);
    }
  };

  const saveShipFeeSettings = async () => {
    setSavingShipFee(true);
    try {
      const res = await authFetch(`${API_BASE}/api/orders/shop-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_shipping_fee: defaultShipFee, free_shipping_threshold: freeShipThreshold, free_shipping_min_quantity: freeShipMinQty }),
      });
      if (res.ok) {
        toast({ title: "✅ Đã lưu", description: "Cài đặt phí ship mặc định đã được cập nhật." });
      } else {
        const err = await res.json();
        toast({ title: "Lỗi", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Lỗi", description: "Không thể kết nối server", variant: "destructive" });
    } finally {
      setSavingShipFee(false);
    }
  };

  const saveToken = async (platform, token, setSaving) => {
    if (!token || token === "••••••••••••••••") {
      toast({ title: "Thông báo", description: "Vui lòng nhập Token thật để cập nhật." });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/integrations/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, access_token: token })
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✅ Thành công", description: data.message });
        if (platform === "ghtk") setGhtkStatus("connected");
        if (platform === "ghn") setGhnStatus("connected");
        if (platform === "viettel_post") setVtpStatus("connected");
      } else {
        toast({ title: "Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Lỗi", description: "Không thể kết nối máy chủ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Lưu toàn bộ cấu hình chung ───
  const saveAllConfig = async () => {
    setSavingConfig(true);
    const senderInfo = {
      name: senderName,
      phone: senderPhone,
      address: senderAddress,
      province: senderProvince,
      district: senderDistrict,
    };

    try {
      // Lưu VTP metadata
      await authFetch(`${API_BASE}/api/integrations/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "viettel_post",
          metadata: { service: vtpService, sender: senderInfo, default_weight: defaultWeight },
        }),
      });

      // Lưu GHN metadata
      await authFetch(`${API_BASE}/api/integrations/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "ghn",
          metadata: { service_type_id: ghnServiceType, required_note: ghnRequiredNote, sender: senderInfo, default_weight: defaultWeight },
        }),
      });

      // Lưu GHTK metadata (chỉ sender info)
      await authFetch(`${API_BASE}/api/integrations/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "ghtk",
          metadata: { sender: senderInfo, default_weight: defaultWeight },
        }),
      });

      toast({ title: "✅ Đã lưu cấu hình", description: "Tất cả cài đặt vận chuyển đã được cập nhật." });
    } catch (err) {
      toast({ title: "Lỗi", description: "Không thể lưu cấu hình", variant: "destructive" });
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* ════════════ Header ════════════ */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Truck className="w-6 h-6 text-blue-500" />
          Cấu hình Vận chuyển
        </h1>
        <p className="text-muted-foreground mt-2">
          Kết nối API, cấu hình dịch vụ mặc định và thông tin người gửi cho tất cả đơn hàng.
        </p>
      </div>

      {/* ════════════ Phí Ship Mặc Định ════════════ */}
      <Card className="border-blue-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-600 text-base">
            <Package className="w-5 h-5" />
            Phí Giao Hàng Mặc Định
          </CardTitle>
          <CardDescription>Cài đặt phí ship mặc định áp dụng khi tạo đơn hàng mới. Khách đạt mức miễn phí sẽ tự động được freeship.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phí ship mặc định (VNĐ)</Label>
              <Input 
                type="number" min={0} placeholder="30000"
                value={defaultShipFee || ''}
                onChange={(e) => setDefaultShipFee(parseInt(e.target.value) || 0)}
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Sẽ tự động điền vào form tạo đơn</p>
            </div>
          </div>

          {/* Freeship conditions */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              🎉 Điều kiện Miễn phí ship <span className="text-[10px] font-normal text-emerald-500">(thỏa 1 trong 2 = freeship)</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-emerald-700">💰 Giá trị đơn tối thiểu (VNĐ)</Label>
                <Input 
                  type="number" min={0} placeholder="500000"
                  value={freeShipThreshold || ''}
                  onChange={(e) => setFreeShipThreshold(parseInt(e.target.value) || 0)}
                  className="h-9 text-sm border-emerald-200 focus:ring-emerald-500/20"
                />
                <p className="text-[10px] text-emerald-600">Đơn ≥ mức này = freeship. Đặt 0 = tắt</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-emerald-700">📦 Số lượng tối thiểu (sp)</Label>
                <Input 
                  type="number" min={0} placeholder="3"
                  value={freeShipMinQty || ''}
                  onChange={(e) => setFreeShipMinQty(parseInt(e.target.value) || 0)}
                  className="h-9 text-sm border-emerald-200 focus:ring-emerald-500/20"
                />
                <p className="text-[10px] text-emerald-600">Mua ≥ số lượng này = freeship. Đặt 0 = tắt</p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            onClick={saveShipFeeSettings} disabled={savingShipFee}>
            {savingShipFee ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang lưu...</> : <><Save className="w-3 h-3 mr-1" /> Lưu cài đặt</>}
          </Button>
        </CardFooter>
      </Card>

      {/* ════════════ Token Cards ════════════ */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* GHTK Card */}
        <Card className="border-green-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Truck className="w-16 h-16 text-green-500" />
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-600 text-sm">
              Giao Hàng Tiết Kiệm
              {ghtkStatus === "connected" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API Token</Label>
              <Input 
                type="password" placeholder="Token GHTK..." 
                value={ghtkToken} onChange={(e) => setGhtkToken(e.target.value)}
                disabled={loading} className="h-9 text-sm"
              />
            </div>
            {ghtkStatus !== "connected" && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded-md">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Chế độ Mock (Test)</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white text-xs" 
              onClick={() => saveToken("ghtk", ghtkToken, setSavingGhtk)}
              disabled={savingGhtk || loading}
            >
              {savingGhtk ? "Đang lưu..." : (ghtkStatus === "connected" ? "Cập nhật" : "Lưu Token")}
            </Button>
          </CardFooter>
        </Card>

        {/* GHN Card */}
        <Card className="border-orange-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Truck className="w-16 h-16 text-orange-500" />
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-600 text-sm">
              Giao Hàng Nhanh
              {ghnStatus === "connected" && <CheckCircle2 className="w-4 h-4 text-orange-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API Token (TOKEN|SHOP_ID)</Label>
              <Input
                type="password" placeholder="Token|ShopId..." 
                value={ghnToken} onChange={(e) => setGhnToken(e.target.value)}
                disabled={loading} className="h-9 text-sm"
              />
            </div>
            {ghnStatus !== "connected" && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded-md">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Chế độ Mock (Test)</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs"
              onClick={() => saveToken("ghn", ghnToken, setSavingGhn)}
              disabled={savingGhn || loading || ghnToken === "••••••••••••••••"}
            >
              {savingGhn ? "Đang lưu..." : (ghnStatus === "connected" ? "Cập nhật" : "Lưu Token")}
            </Button>
          </CardFooter>
        </Card>

        {/* VTP Card */}
        <Card className="border-[#EE0033]/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Truck className="w-16 h-16" style={{color: '#EE0033'}} />
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm" style={{color: '#EE0033'}}>
              Viettel Post
              {vtpStatus === "connected" && <CheckCircle2 className="w-4 h-4" style={{color: '#EE0033'}} />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API Token</Label>
              <Input 
                type="password" placeholder="Token Viettel Post..."
                value={vtpToken} onChange={(e) => setVtpToken(e.target.value)}
                disabled={loading} className="h-9 text-sm"
              />
            </div>
            {vtpStatus !== "connected" && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded-md">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Chế độ Mock (Test)</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <Button size="sm" className="w-full text-white hover:opacity-90 text-xs" style={{backgroundColor: '#EE0033'}}
              onClick={() => saveToken("viettel_post", vtpToken, setSavingVtp)}
              disabled={savingVtp || loading || vtpToken === "••••••••••••••••"}
            >
              {savingVtp ? "Đang lưu..." : (vtpStatus === "connected" ? "Cập nhật" : "Lưu Token")}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* ════════════ Cấu hình chung ════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-5 h-5 text-blue-500" />
            Cấu hình mặc định
          </CardTitle>
          <CardDescription>Cài đặt một lần, áp dụng cho tất cả đơn hàng khi đẩy giao.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ─── Thông tin người gửi ─── */}
          <div>
            <h3 className="text-sm font-bold text-zinc-700 flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-indigo-500" />
              Thông tin người gửi (Pick)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><User className="w-3 h-3" /> Tên cửa hàng</Label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="VD: Shop ABC" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" /> SĐT lấy hàng</Label>
                <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="0987654321" className="h-9 text-sm" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Địa chỉ lấy hàng</Label>
                <Input value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} placeholder="123 Đường ABC, Phường XYZ" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tỉnh/Thành phố</Label>
                <Input value={senderProvince} onChange={(e) => setSenderProvince(e.target.value)} placeholder="Hồ Chí Minh" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quận/Huyện</Label>
                <Input value={senderDistrict} onChange={(e) => setSenderDistrict(e.target.value)} placeholder="Quận 1" className="h-9 text-sm" />
              </div>
            </div>
          </div>

          <hr className="border-zinc-200" />

          {/* ─── Cân nặng mặc định ─── */}
          <div>
            <Label className="text-xs font-bold text-zinc-700">Cân nặng mặc định (gram)</Label>
            <Input type="number" value={defaultWeight} onChange={(e) => setDefaultWeight(Number(e.target.value))} min={50} max={50000} className="h-9 text-sm mt-1.5 max-w-[200px]" />
          </div>

          <hr className="border-zinc-200" />

          {/* ─── VTP Loại dịch vụ ─── */}
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-1" style={{color: '#EE0033'}}>
              <Truck className="w-4 h-4" /> Viettel Post — Loại dịch vụ mặc định
            </h3>
            <p className="text-[11px] text-zinc-500 mb-3">Chọn dịch vụ mặc định hoặc nhập mã theo hợp đồng riêng.</p>

            {/* Dịch vụ cơ bản */}
            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Dịch vụ cơ bản</Label>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {VTP_SERVICES.filter(s => s.group === "basic").map((svc) => (
                <button
                  key={svc.value}
                  onClick={() => setVtpService(svc.value)}
                  className={cn(
                    "py-2 px-2 rounded-xl border-2 text-center transition-all",
                    vtpService === svc.value
                      ? "border-[#EE0033] bg-red-50 shadow-sm"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  )}
                >
                  <span className="text-base">{svc.icon}</span>
                  <p className={cn("text-[9px] font-bold mt-0.5", vtpService === svc.value ? "text-[#EE0033]" : "text-zinc-700")}>{svc.label}</p>
                  <p className="text-[7px] text-zinc-400">{svc.desc}</p>
                </button>
              ))}
            </div>

            {/* TMĐT / COD */}
            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">TMĐT / Thu hộ (COD)</Label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {VTP_SERVICES.filter(s => s.group === "tmdt").map((svc) => (
                <button
                  key={svc.value}
                  onClick={() => setVtpService(svc.value)}
                  className={cn(
                    "py-2 px-2 rounded-xl border-2 text-center transition-all",
                    vtpService === svc.value
                      ? "border-[#EE0033] bg-red-50 shadow-sm"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  )}
                >
                  <span className="text-base">{svc.icon}</span>
                  <p className={cn("text-[9px] font-bold mt-0.5", vtpService === svc.value ? "text-[#EE0033]" : "text-zinc-700")}>{svc.label}</p>
                  <p className="text-[7px] text-zinc-400">{svc.desc}</p>
                </button>
              ))}
            </div>

            {/* Hợp đồng / Custom */}
            <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Hợp đồng / Mã dịch vụ tùy chỉnh</Label>
            <div className="flex items-center gap-2">
              {VTP_SERVICES.filter(s => s.group === "contract").map((svc) => (
                <button
                  key={svc.value}
                  onClick={() => setVtpService(svc.value)}
                  className={cn(
                    "py-2 px-3 rounded-xl border-2 text-center transition-all whitespace-nowrap",
                    vtpService === svc.value
                      ? "border-[#EE0033] bg-red-50 shadow-sm"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  )}
                >
                  <span className="text-base">{svc.icon}</span>
                  <p className={cn("text-[9px] font-bold mt-0.5", vtpService === svc.value ? "text-[#EE0033]" : "text-zinc-700")}>{svc.label}</p>
                </button>
              ))}
              <div className="flex-1">
                <Input
                  placeholder="Nhập mã DV riêng (VD: TMDT7, VCN2...)"
                  value={VTP_SERVICES.find(s => s.value === vtpService) ? "" : vtpService}
                  onChange={(e) => setVtpService(e.target.value.toUpperCase())}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5">Mã dịch vụ theo hợp đồng riêng với VTP? Nhập trực tiếp vào ô trên. Liên hệ nhân viên VTP để biết mã chính xác.</p>
          </div>

          <hr className="border-zinc-200" />

          {/* ─── GHN Loại dịch vụ + Yêu cầu giao hàng ─── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-orange-600 flex items-center gap-2">
              <Truck className="w-4 h-4" /> Giao Hàng Nhanh — Cấu hình mặc định
            </h3>

            <div>
              <Label className="text-xs font-bold text-zinc-600 mb-2 block">Loại hình giao hàng</Label>
              <div className="grid grid-cols-2 gap-2 max-w-sm">
                {GHN_SERVICES.map((svc) => (
                  <button
                    key={svc.value}
                    onClick={() => setGhnServiceType(svc.value)}
                    className={cn(
                      "py-2.5 px-3 rounded-xl border-2 text-center transition-all",
                      ghnServiceType === svc.value
                        ? "border-orange-500 bg-orange-50 shadow-sm"
                        : "border-zinc-200 hover:border-zinc-300 bg-white"
                    )}
                  >
                    <p className={cn("text-[11px] font-bold", ghnServiceType === svc.value ? "text-orange-700" : "text-zinc-700")}>
                      {svc.label}
                    </p>
                    <p className="text-[9px] text-zinc-400">{svc.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-zinc-600 mb-2 block">Yêu cầu giao hàng (bắt buộc theo API GHN)</Label>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {GHN_REQUIRED_NOTES.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGhnRequiredNote(opt.value)}
                    className={cn(
                      "py-2.5 px-2 rounded-xl border-2 text-center transition-all",
                      ghnRequiredNote === opt.value
                        ? "border-orange-500 bg-orange-50"
                        : "border-zinc-200 hover:border-zinc-300 bg-white"
                    )}
                  >
                    <p className={cn("text-[10px] font-bold", ghnRequiredNote === opt.value ? "text-orange-700" : "text-zinc-600")}>
                      {opt.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
            onClick={saveAllConfig}
            disabled={savingConfig}
          >
            {savingConfig ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang lưu...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Lưu tất cả cấu hình</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
