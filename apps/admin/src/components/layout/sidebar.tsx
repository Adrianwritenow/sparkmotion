"use client";

import React, { createElement, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import { SmLogotype } from "@/components/sm-logotype";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Megaphone,
  Disc3,
  Users,

  Sun,
  Moon,
  Monitor,
  LogOut,
  PanelLeft,
  PanelRight,
  User,
} from "lucide-react";

interface SidebarProps {
  isMobile?: boolean;
}

export function Sidebar({ isMobile = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const themeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  const { data: flaggedCount } = trpc.bands.flaggedCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/organizations", label: "Organizations", icon: Building2 },
    { href: "/events", label: "Events", icon: CalendarDays },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/bands", label: "Activity", icon: Disc3, showAlert: (flaggedCount ?? 0) > 0 },
    { href: "/users", label: "Users", icon: Users },
  ];

  return (
    <aside
      className={`
        flex-shrink-0 bg-transparent flex flex-col h-full transition-all duration-200 ease-in-out
        ${isMobile ? "w-full" : collapsed ? "w-[64px] md:w-[64px] lg:w-[64px]" : "w-[260px] md:w-[64px] lg:w-[260px]"}
      `}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-transparent">
        {isMobile || (!collapsed && !isMobile) ? (
          <div className="flex items-center gap-2.5 cursor-pointer hover:bg-accent/50 p-1.5 rounded-md transition-colors overflow-hidden">
            <SmLogotype className="h-6 w-auto text-foreground flex-shrink-0" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-full">
            <img
              src="/sparkmotion_icon_gradient.svg"
              alt="SparkMotion"
              className="w-7 h-7 flex-shrink-0"
            />
          </div>
        )}
        {!isMobile && !collapsed && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent/50 transition-colors md:hidden lg:block"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapse toggle when collapsed - below header */}
      {!isMobile && collapsed && (
        <div className="flex justify-center py-2 md:hidden lg:flex">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent/50 transition-colors"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scrollable Nav Content */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive}
                collapsed={collapsed}
                isMobile={isMobile}
                showAlert={item.showAlert}
              />
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="mt-auto border-t border-border/50">
        {/* Theme Toggles */}
        {mounted ? (
          <div
            className={`flex items-center px-2 py-2 ${isMobile || (!collapsed && !isMobile) ? "gap-1" : "justify-center"}`}
          >
            {isMobile || (!collapsed && !isMobile) ? (
              <div className={`flex w-full bg-muted/50 rounded-lg p-1 gap-1 ${isMobile ? "flex" : "hidden md:hidden lg:flex"}`}>
                <button
                  onClick={() => setTheme("light")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors text-xs font-medium ${theme === "light" ? "text-foreground bg-background shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span className={isMobile ? "inline" : "hidden lg:inline"}>Light</span>
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors text-xs font-medium ${theme === "dark" ? "text-foreground bg-background shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span className={isMobile ? "inline" : "hidden lg:inline"}>Dark</span>
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors text-xs font-medium ${theme === "system" ? "text-foreground bg-background shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span className={isMobile ? "inline" : "hidden lg:inline"}>System</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  setTheme(
                    theme === "light"
                      ? "dark"
                      : theme === "dark"
                        ? "system"
                        : "light"
                  )
                }
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                title={`Theme: ${theme}`}
              >
                {createElement(themeIcon, { className: "w-4 h-4" })}
              </button>
            )}
          </div>
        ) : (
          <div className="px-2 py-2 h-10" />
        )}

        {/* Avatar / Profile Row */}
        <div
          className={`flex items-center px-3 py-3 ${isMobile || (!collapsed && !isMobile) ? "gap-3" : "justify-center"} cursor-pointer hover:bg-accent/30 transition-colors`}
          onClick={() => router.push("/settings")}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF9D1D] to-[#FF4220] flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          {(isMobile || !collapsed) && (
            <>
              <div className={`flex-1 min-w-0 ${isMobile ? "block" : "hidden md:hidden lg:block"}`}>
                <p className="text-sm font-medium text-foreground truncate">
                  {session?.user?.name || "Admin User"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {session?.user?.email || "admin@sparkmotion.io"}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  signOut({ callbackUrl: "/auth/signin" });
                }}
                className={`text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent/50 transition-colors flex-shrink-0 ${isMobile ? "inline-flex" : "hidden lg:inline-flex"}`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  isMobile?: boolean;
  showAlert?: boolean;
}

function NavItem({ href, icon: Icon, label, active, collapsed, isMobile = false, showAlert }: NavItemProps) {
  return (
    <Link
      href={href}
      title={collapsed && !isMobile ? label : undefined}
      className={`
        w-full flex items-center gap-3 py-2 text-sm rounded-xl transition-colors
        ${isMobile ? "px-3" : collapsed ? "justify-center px-0" : "px-3"}
        ${active ? "font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"}
      `}
      style={{
        ...(active
          ? {
              background:
                "linear-gradient(to right, rgba(255, 157, 29, 0.1), rgba(255, 66, 32, 0.1))",
            }
          : { backgroundColor: "transparent" }),
        paddingTop: "16px",
        paddingBottom: "16px",
      }}
    >
      <span className="relative flex-shrink-0">
        <Icon
          className="w-4 h-4"
          style={active ? { color: "#FF6B28" } : undefined}
        />
        {showAlert && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </span>
      {(isMobile || !collapsed) && (
        <span
          className={`whitespace-nowrap overflow-hidden ${isMobile ? "inline" : "inline md:hidden lg:inline"}`}
          style={
            active
              ? {
                  background: "linear-gradient(to right, #FF9D1D, #FF4220)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }
              : undefined
          }
        >
          {label}
        </span>
      )}
    </Link>
  );
}
