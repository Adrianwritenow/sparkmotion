"use client";

import { CalendarDays, Disc3, LayoutDashboard, Megaphone } from "lucide-react";
import { MobileHeader, Sidebar, type NavItem } from "@sparkmotion/ui/layout";
import { signOut, useSession } from "next-auth/react";

import { trpc } from "@/lib/trpc";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { data: flaggedCount } = trpc.bands.flaggedCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const navItems: NavItem[] = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/events", label: "Events", icon: CalendarDays },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/activity", label: "Activity", icon: Disc3, showAlert: (flaggedCount ?? 0) > 0 },
  ];

  const user = {
    name: session?.user?.name,
    email: session?.user?.email,
  };

  const handleSignOut = () => signOut({ callbackUrl: "/auth/signin" });

  return (
    <div className="h-screen w-full bg-muted p-0 md:p-2 overflow-hidden flex flex-col md:flex-row">
      {/* Mobile header - phone only */}
      <MobileHeader navItems={navItems} user={user} onSignOut={handleSignOut} />

      {/* Sidebar - hidden on phone, visible on tablet and desktop */}
      <div className="hidden md:block">
        <Sidebar navItems={navItems} user={user} onSignOut={handleSignOut} />
      </div>

      {/* Main content */}
      <main className="flex-1 bg-background md:rounded-xl md:border md:border-border md:shadow-sm overflow-y-auto h-full pt-14 md:pt-0">
        <div className="max-w-[1600px] min-h-full p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
