"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const noSidebarPaths = ["/login", "/register"];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const hideSidebar = noSidebarPaths.includes(pathname);

  if (hideSidebar) return <>{children}</>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
