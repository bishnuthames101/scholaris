import { cn } from "@/lib/cn";

/** Scholaris mark — open book forming an "S" curve, teal gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill="url(#scholaris-g)" />
      <path
        d="M11 13.5c3.2-1.8 6.2-1.8 9 0v13c-2.8-1.8-5.8-1.8-9 0v-13Z"
        fill="white"
        fillOpacity="0.92"
      />
      <path
        d="M29 13.5c-3.2-1.8-6.2-1.8-9 0v13c2.8-1.8 5.8-1.8 9 0v-13Z"
        fill="white"
        fillOpacity="0.7"
      />
      <defs>
        <linearGradient id="scholaris-g" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Scholaris
        </span>
      )}
    </span>
  );
}
