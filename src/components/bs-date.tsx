import { useLocale } from "next-intl";
import { formatBs } from "@/lib/dates/bs";

/**
 * Dual-calendar date display: BS primary, AD secondary (§3.6).
 * e.g.  १५ साउन २०८२ · 31 Jul 2025
 */
export function BsDate({
  date,
  showAd = true,
  className,
}: {
  date: Date | string;
  showAd?: boolean;
  className?: string;
}) {
  const locale = useLocale() as "en" | "ne";
  const d = typeof date === "string" ? new Date(date) : date;
  const ad = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <span className={className}>
      <span className="font-medium">{formatBs(d, locale)}</span>
      {showAd && <span className="ml-1.5 text-xs text-muted">· {ad}</span>}
    </span>
  );
}
