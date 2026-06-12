"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

const LOCALE_COOKIE = "scholaris_locale";

function writeLocaleCookie(next: "en" | "ne") {
  document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLocale(next: "en" | "ne") {
    writeLocaleCookie(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface p-0.5 text-xs font-medium",
        pending && "opacity-60",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {(["en", "ne"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors",
            locale === l ? "bg-brand-600 text-white" : "text-muted hover:text-foreground",
          )}
        >
          {l === "en" ? "EN" : "ने"}
        </button>
      ))}
    </div>
  );
}
