"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close drawer when navigation changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border h-14 flex items-center justify-between px-4">
      {/* Left: Hamburger menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="text-foreground hover:text-foreground/80 p-2 -ml-2">
            <Menu className="w-5 h-5" />
            <span className="sr-only">Toggle menu</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0">
          <Sidebar isMobile />
        </SheetContent>
      </Sheet>

      {/* Center: Logo */}
      <div className="flex items-center gap-2">
        <img
          src="/sparkmotion_icon_gradient.svg"
          alt="SparkMotion"
          className="w-6 h-6"
        />
        <span className="text-sm font-semibold">SparkMotion</span>
      </div>

      {/* Right: Empty spacer for visual centering */}
      <div className="w-9" />
    </header>
  );
}
