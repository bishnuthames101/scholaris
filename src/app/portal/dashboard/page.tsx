"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CalendarCheck, Receipt, GraduationCap, ChevronRight } from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type Child = {
  publicId: string;
  name: string;
  nameNe: string | null;
  admissionNo: string;
  photoUrl: string | null;
  status: string;
  relation: string;
  isPrimary: boolean;
  class: string | null;
  gradeLevel: number | null;
  attendance: { totalDays: number; absentDays: number; presentDays: number };
  fees: { totalDuePaisa: number; totalPaidPaisa: number; balancePaisa: number };
};

export default function PortalDashboard() {
  const t = useTranslations("portal");
  const tc = useTranslations("common");
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Child[]>("/api/portal/children")
      .then((r) => setChildren(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-medium text-foreground">{t("noChildren")}</p>
        <p className="text-sm text-muted">{t("noChildrenHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>

      <div className="space-y-4">
        {children.map((child) => (
          <ChildCard key={child.publicId} child={child} />
        ))}
      </div>
    </div>
  );
}

function ChildCard({ child }: { child: Child }) {
  const t = useTranslations("portal");
  const attendanceRate =
    child.attendance.totalDays > 0
      ? Math.round((child.attendance.presentDays / child.attendance.totalDays) * 100)
      : 0;

  const balanceRupees = Math.round(child.fees.balancePaisa / 100);
  const hasDue = child.fees.balancePaisa > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border bg-surface-raised px-5 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
          {child.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-foreground">{child.name}</h2>
          <div className="flex items-center gap-2 text-sm text-muted">
            {child.class && <span>{child.class}</span>}
            <span className="text-xs">#{child.admissionNo}</span>
          </div>
        </div>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium capitalize text-brand-700">
          {child.relation}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {/* Attendance */}
        <Link
          href={`/portal/attendance?student=${child.publicId}`}
          className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <CalendarCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted">{t("attendance")}</p>
              <p className="text-xl font-bold text-foreground">{attendanceRate}%</p>
              <p className="text-xs text-muted">
                {child.attendance.presentDays}/{child.attendance.totalDays} {t("days")}
              </p>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>

        {/* Fees */}
        <Link
          href={`/portal/fees?student=${child.publicId}`}
          className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised/50"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              hasDue ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600",
            )}>
              <Receipt className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted">{t("feeBalance")}</p>
              <p className={cn("text-xl font-bold", hasDue ? "text-red-600" : "text-green-600")}>
                {hasDue ? `Rs ${balanceRupees.toLocaleString()}` : t("cleared")}
              </p>
              {hasDue && <p className="text-xs text-muted">{t("duePending")}</p>}
            </div>
          </div>
          <ChevronRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>

        {/* Results */}
        <Link
          href={`/portal/results?student=${child.publicId}`}
          className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <GraduationCap className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted">{t("examResults")}</p>
              <p className="text-xl font-bold text-foreground">{t("viewResults")}</p>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      </div>
    </div>
  );
}
