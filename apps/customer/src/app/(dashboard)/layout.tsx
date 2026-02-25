import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full bg-muted p-0 md:p-2 overflow-hidden flex flex-col md:flex-row">
      {/* Mobile header - phone only */}
      <MobileHeader />

      {/* Sidebar - hidden on phone, visible on tablet and desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="flex-1 bg-background md:rounded-xl md:border md:border-border md:shadow-sm overflow-y-auto h-full pt-14 md:pt-0">
        <div className="max-w-[1600px] mx-auto min-h-full p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
