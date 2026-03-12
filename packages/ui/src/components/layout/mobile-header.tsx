"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { Sidebar, type NavItem, type SidebarUser } from "./sidebar";

export interface MobileHeaderProps {
  navItems: NavItem[];
  user?: SidebarUser;
  onSignOut?: () => void;
}

export function MobileHeader({ navItems, user, onSignOut }: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border h-14 flex items-center justify-between px-4">
      {/* Left: Hamburger menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="p-2 -ml-2 hover:bg-accent rounded-md transition-colors">
            <Menu className="w-5 h-5" />
            <span className="sr-only">Toggle menu</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0">
          <Sidebar navItems={navItems} isMobile user={user} onSignOut={onSignOut} />
        </SheetContent>
      </Sheet>

      {/* Center: Logo + text */}
      <div className="flex items-center gap-2">
        <img
          src="/sparkmotion_icon_gradient.svg"
          alt="SparkMotion"
          className="w-6 h-6"
        />
        <span className="font-semibold text-sm">SparkMotion</span>
      </div>

      {/* Right: Empty spacer for visual centering */}
      <div className="w-10" />
    </header>
  );
}
