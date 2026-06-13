"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type AttendanceRecord = {
  publicId: string;
  date: string;
  status: string;
  source: string;
  firstTapAt: string | null;
  section: { name: string; class: { name: string } } | null;
};

export default function PortalAttendancePage() {
  const t = useTranslations("portal");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const studentId = params.get("student");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: "30" });
    if (studentId) qs.set("student", studentId);
    api<AttendanceRecord[]>(`/api/portal/attendance?${qs}`)
      .then((r) => {
        setRecords(r.data);
        setTotal(r.meta?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, studentId]);

  const totalPages = Math.ceil(total / 30);

  if (!studentId) {
    return <p className="py-12 text-center text-sm text-muted">{t("selectChild")}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t("attendanceHistory")}</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted">{t("noAttendanceRecords")}</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {["present", "absent", "late"].map((status) => {
              const count = records.filter((r) => r.status === status).length;
              const colors: Record<string, string> = {
                present: "bg-green-50 text-green-700 border-green-200",
                absent: "bg-red-50 text-red-700 border-red-200",
                late: "bg-yellow-50 text-yellow-700 border-yellow-200",
              };
              return (
                <div key={status} className={cn("rounded-lg border p-3 text-center", colors[status])}>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs font-medium capitalize">{t(`status_${status}`)}</p>
                </div>
              );
            })}
          </div>

          {/* Records */}
          <div className="space-y-2">
            {records.map((r) => (
              <div
                key={r.publicId}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <StatusDot status={r.status} />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(r.date).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {r.section && (
                      <p className="text-xs text-muted">
                        {r.section.class.name} {r.section.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={r.status} />
                  {r.source === "rfid" && r.firstTapAt && (
                    <p className="mt-0.5 text-xs text-muted">
                      {new Date(r.firstTapAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{total} {t("records")}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-border px-3 py-1 disabled:opacity-30"
                >
                  {tc("previous")}
                </button>
                <span className="px-3 py-1">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-border px-3 py-1 disabled:opacity-30"
                >
                  {tc("next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    present: "bg-green-500",
    absent: "bg-red-500",
    late: "bg-yellow-500",
    holiday: "bg-gray-400",
  };
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", colors[status] ?? "bg-gray-400")} />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    present: "bg-green-100 text-green-800",
    absent: "bg-red-100 text-red-800",
    late: "bg-yellow-100 text-yellow-800",
    holiday: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", colors[status] ?? "bg-gray-100 text-gray-700")}>
      {status}
    </span>
  );
}
