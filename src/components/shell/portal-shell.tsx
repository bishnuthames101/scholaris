"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CalendarCheck,
  Receipt,
  GraduationCap,
  Megaphone,
  BookOpen,
  LogOut,
  Menu,
  X,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";

type NavItem = { href: string; key: string; icon: React.ComponentType<{ className?: string }> };

const parentNav: NavItem[] = [
  { href: "/portal/dashboard", key: "portalDashboard", icon: LayoutDashboard },
  { href: "/portal/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/portal/fees", key: "fees", icon: Receipt },
  { href: "/portal/results", key: "results", icon: GraduationCap },
  { href: "/portal/homework", key: "homework", icon: BookOpen },
  { href: "/portal/notices", key: "notices", icon: Megaphone },
];

const studentNav: NavItem[] = [
  { href: "/portal/dashboard", key: "portalDashboard", icon: LayoutDashboard },
  { href: "/portal/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/portal/results", key: "results", icon: GraduationCap },
  { href: "/portal/homework", key: "homework", icon: BookOpen },
  { href: "/portal/notices", key: "notices", icon: Megaphone },
];

export function PortalShell({
  user,
  children,
}: {
  user: { name: string; roles: string[] };
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isStudent = user.roles.includes("student");
  const nav = isStudent ? studentNav : parentNav;

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      {/* User badge */}
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          <User className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="text-xs text-brand-600">{isStudent ? t("studentPortal") : t("parentPortal")}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-800"
                  : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4.5 shrink-0", active && "text-brand-700")} />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-danger-bg hover:text-danger"
        >
          <LogOut className="size-4.5" />
          {tAuth("logout")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block">
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-overlay">
            <button className="absolute right-3 top-5 rounded-md p-1.5 text-muted hover:bg-surface-muted" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button className="rounded-md p-1.5 text-muted hover:bg-surface-muted" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <LogoMark className="size-7" />
          </div>
          <div className="hidden lg:block" />
          <LocaleSwitcher />
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
