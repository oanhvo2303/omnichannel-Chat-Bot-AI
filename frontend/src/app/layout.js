import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import "./globals.css";

export const metadata = {
  title: "OmniBot — Quản lý Chat Đa Kênh",
  description: "Nền tảng quản trị chat đa kênh Facebook, Zalo tích hợp AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OmniBot",
  },
  formatDetection: { telephone: false },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#09090b",
    "msapplication-tap-highlight": "no",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#3B82F6" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-screen overflow-hidden font-sans" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
        <Toaster />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}

