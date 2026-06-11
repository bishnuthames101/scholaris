"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Receipt,
  GraduationCap,
  MessageSquare,
  Megaphone,
  Settings,
  School,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";

type NavItem = { href: string; key: string; icon: React.ComponentType<{ className?: string }> };

const schoolNav: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/students", key: "students", icon: Users },
  { href: "/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/fees", key: "fees", icon: Receipt },
  { href: "/exams", key: "exams", icon: GraduationCap },
  { href: "/messages", key: "messages", icon: MessageSquare },
  { href: "/notices", key: "notices", icon: Megaphone },
  { href: "/settings", key: "settings", icon: Settings },
];

const superadminNav: NavItem[] = [{ href: "/admin/schools", key: "schools", icon: School }];

export function AppShell({
  user,
  children,
}: {
  user: { roles: string[]; superadmin: boolean };
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = user.superadmin ? superadminNav : schoolNav;

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
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-overlay">
            <button
              className="absolute right-3 top-5 rounded-md p-1.5 text-muted hover:bg-surface-muted"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              className="rounded-md p-1.5 text-muted hover:bg-surface-muted"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
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
