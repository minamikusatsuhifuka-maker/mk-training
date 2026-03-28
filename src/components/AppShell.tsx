"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-h-screen overflow-y-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
