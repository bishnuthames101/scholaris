"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Tab = "attendance" | "leaves" | "salary" | "payroll";

type StaffRow = {
  publicId: string;
  name: string;
  nameNe: string | null;
  designation: string | null;
  attendance: { publicId: string; status: string; note: string | null } | null;
};

type LeaveRequest = {
  publicId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  staff: { publicId: string; name: string; designation: string | null };
};

export default function HRPage() {
  const t = useTranslations("hr");
  const [tab, setTab] = useState<Tab>("attendance");
  const [error, setError] = useState<string | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: "attendance", label: t("tabAttendance") },
    { key: "leaves", label: t("tabLeaves") },
    { key: "salary", label: t("tabSalary") },
    { key: "payroll", label: t("tabPayroll") },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {tabs.map((t2) => (
          <button
            key={t2.key}
            onClick={() => setTab(t2.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t2.key
                ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t2.label}
          </button>
        ))}
      </div>

      {tab === "attendance" && <AttendanceTab onError={setError} />}
      {tab === "leaves" && <LeavesTab onError={setError} />}
      {tab === "salary" && <SalaryTab onError={setError} />}
      {tab === "payroll" && <PayrollTab onError={setError} />}
    </div>
  );
}

function AttendanceTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("hr");
  const tc = useTranslations("common");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setSaved(false);
    onError(null);
    api<StaffRow[]>(`/api/hr/attendance?date=${date}`)
      .then((r) => {
        setStaff(r.data);
        const map: Record<string, string> = {};
        r.data.forEach((s) => { map[s.publicId] = s.attendance?.status ?? "present"; });
        setStatuses(map);
      })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [date, onError, tc]);

  useEffect(() => { load(); }, [load]);

  function markAllPresent() {
    const map: Record<string, string> = {};
    staff.forEach((s) => { map[s.publicId] = "present"; });
    setStatuses(map);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api("/api/hr/attendance", {
        method: "POST",
        body: JSON.stringify({
          date,
          records: Object.entries(statuses).map(([staffId, status]) => ({ staffId, status })),
        }),
      });
      setSaved(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  const statusOptions = ["present", "absent", "late", "leave", "half_day"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        <button onClick={markAllPresent} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">{t("markAllPresent")}</button>
        <button onClick={handleSave} disabled={saving} className="ml-auto rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? tc("saving") : tc("save")}
        </button>
        {saved && <span className="text-sm text-green-600">{t("saved")}</span>}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("staffMember")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.map((s) => (
                <tr key={s.publicId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span>{s.name}</span>
                    {s.designation && <span className="ml-1 text-xs text-muted-foreground">({s.designation})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {statusOptions.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setStatuses((prev) => ({ ...prev, [s.publicId]: opt }))}
                          className={`rounded-md px-2 py-1 text-xs transition-colors ${
                            statuses[s.publicId] === opt
                              ? opt === "present" ? "bg-green-600 text-white" :
                                opt === "absent" ? "bg-red-600 text-white" :
                                opt === "late" ? "bg-yellow-600 text-white" :
                                opt === "leave" ? "bg-blue-600 text-white" :
                                "bg-orange-600 text-white"
                              : "border border-input hover:bg-muted"
                          }`}
                        >
                          {t(opt)}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeavesTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("hr");
  const tc = useTranslations("common");
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    api<LeaveRequest[]>(`/api/hr/leaves?page=${page}&pageSize=20&status=${statusFilter}`)
      .then((r) => { setLeaves(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, statusFilter, refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    try {
      await api(`/api/hr/leaves/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  const totalPages = Math.ceil(total / 20);

  const statusBadge: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {["pending", "approved", "rejected", "cancelled"].map((s) => (
            <option key={s} value={s}>{t(`status_${s}`)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : leaves.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noLeaves")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("staffMember")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("leaveType")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("startDate")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("endDate")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("days")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
                {statusFilter === "pending" && <th className="px-4 py-3 text-right font-medium">{tc("actions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leaves.map((lv) => (
                <tr key={lv.publicId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{lv.staff.name}</td>
                  <td className="px-4 py-3">{t(`type_${lv.leaveType}`)}</td>
                  <td className="px-4 py-3">{new Date(lv.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{new Date(lv.endDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-center">{lv.days}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusBadge[lv.status] ?? ""}`}>
                      {t(`status_${lv.status}`)}
                    </span>
                  </td>
                  {statusFilter === "pending" && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleAction(lv.publicId, "approve")} className="mr-2 text-xs text-green-600 hover:underline">{t("approve")}</button>
                      <button onClick={() => handleAction(lv.publicId, "reject")} className="text-xs text-red-600 hover:underline">{t("reject")}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{tc("page")} {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("prev")}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("next")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SalaryTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("hr");
  const tc = useTranslations("common");
  const [salaries, setSalaries] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    api<Record<string, unknown>[]>(`/api/hr/salary?page=${page}&pageSize=20`)
      .then((r) => { setSalaries(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, onError, tc]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 20);
  const formatNPR = (paisa: number) => `Rs ${(paisa / 100).toLocaleString()}`;

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : salaries.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noSalary")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noSalaryHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("staffMember")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("basicSalary")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("allowances")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("deductions")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("netSalary")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("effectiveFrom")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {salaries.map((s) => {
                const staff = s.staff as { name: string } | undefined;
                return (
                  <tr key={s.publicId as string} className="hover:bg-muted/30">
                    <td className="px-4 py-3">{staff?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{formatNPR(s.basicPaisa as number)}</td>
                    <td className="px-4 py-3 text-right">{formatNPR(s.allowancesPaisa as number)}</td>
                    <td className="px-4 py-3 text-right">{formatNPR(s.deductionsPaisa as number)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatNPR((s.basicPaisa as number) + (s.allowancesPaisa as number) - (s.deductionsPaisa as number))}</td>
                    <td className="px-4 py-3">{new Date(s.effectiveFrom as string).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{tc("page")} {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("prev")}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("next")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PayrollTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("hr");
  const tc = useTranslations("common");
  const [payrolls, setPayrolls] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    api<Record<string, unknown>[]>(`/api/hr/payroll?page=${page}&pageSize=20`)
      .then((r) => { setPayrolls(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, onError, tc]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 20);
  const formatNPR = (paisa: number) => `Rs ${(paisa / 100).toLocaleString()}`;

  const statusBadge: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    approved: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : payrolls.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noPayrolls")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noPayrollsHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t("bsYear")}/{t("bsMonth")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("staffCount")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("totalGross")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("totalDeductions")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("totalNet")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payrolls.map((p) => (
                <tr key={p.publicId as string} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{p.bsYear as number}/{p.bsMonth as number}</td>
                  <td className="px-4 py-3 text-center">{p.staffCount as number}</td>
                  <td className="px-4 py-3 text-right">{formatNPR(p.totalGross as number)}</td>
                  <td className="px-4 py-3 text-right">{formatNPR(p.totalDeduct as number)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatNPR(p.totalNet as number)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusBadge[p.status as string] ?? ""}`}>
                      {t(`status_${p.status as string}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{tc("page")} {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("prev")}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("next")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
