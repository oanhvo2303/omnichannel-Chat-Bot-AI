import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata = {
  title: "Omnichannel Bot — Dashboard",
  description: "Trung tâm quản trị chat đa kênh (Facebook, Zalo) tích hợp AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-screen overflow-hidden font-sans" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
