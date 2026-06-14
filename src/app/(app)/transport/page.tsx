"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/client-api";

type Route = {
  publicId: string;
  name: string;
  nameNe: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  capacity: number | null;
  isActive: boolean;
  _count: { stops: number; assignments: number };
};

type Stop = { publicId: string; name: string; sortOrder: number; pickupTime: string | null; dropTime: string | null };

type Tab = "routes" | "assignments";

export default function TransportPage() {
  const t = useTranslations("transport");
  const tc = useTranslations("common");
  const [tab, setTab] = useState<Tab>("routes");
  const [error, setError] = useState<string | null>(null);

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
        {(["routes", "assignments"] as Tab[]).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t2
                ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t2 === "routes" ? t("tabRoutes") : t("tabAssignments")}
          </button>
        ))}
      </div>

      {tab === "routes" && <RoutesTab onError={setError} />}
      {tab === "assignments" && <AssignmentsTab onError={setError} />}
    </div>
  );
}

function RoutesTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("transport");
  const tc = useTranslations("common");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stops, setStops] = useState<Record<string, Stop[]>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState({
    name: "", vehicleNo: "", driverName: "", driverPhone: "", capacity: "",
  });
  const [saving, setSaving] = useState(false);

  // Stop form
  const [stopForm, setStopForm] = useState({ name: "", pickupTime: "", dropTime: "", sortOrder: "0" });
  const [addingStop, setAddingStop] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    api<Route[]>("/api/transport/routes")
      .then((r) => setRoutes(r.data))
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  async function toggleExpand(routeId: string) {
    if (expanded === routeId) { setExpanded(null); return; }
    setExpanded(routeId);
    if (!stops[routeId]) {
      try {
        const r = await api<{ stops: Stop[] }>(`/api/transport/routes/${routeId}`);
        setStops((prev) => ({ ...prev, [routeId]: r.data.stops }));
      } catch (e) {
        onError(e instanceof Error ? e.message : tc("error"));
      }
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/transport/routes", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          vehicleNo: form.vehicleNo || undefined,
          driverName: form.driverName || undefined,
          driverPhone: form.driverPhone || undefined,
          capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
        }),
      });
      setShowAdd(false);
      setForm({ name: "", vehicleNo: "", driverName: "", driverPhone: "", capacity: "" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStop(routeId: string) {
    try {
      await api(`/api/transport/routes/${routeId}/stops`, {
        method: "POST",
        body: JSON.stringify({
          name: stopForm.name,
          pickupTime: stopForm.pickupTime || undefined,
          dropTime: stopForm.dropTime || undefined,
          sortOrder: parseInt(stopForm.sortOrder, 10) || 0,
        }),
      });
      setAddingStop(null);
      setStopForm({ name: "", pickupTime: "", dropTime: "", sortOrder: "0" });
      // Refresh stops
      const r = await api<{ stops: Stop[] }>(`/api/transport/routes/${routeId}`);
      setStops((prev) => ({ ...prev, [routeId]: r.data.stops }));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  async function handleDeleteRoute(id: string) {
    try {
      await api(`/api/transport/routes/${id}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={() => setShowAdd(!showAdd)} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          {t("addRoute")}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
          <input required placeholder={t("routeName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("vehicleNo")} value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("driverName")} value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder={t("driverPhone")} value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <div className="flex items-end gap-2">
            <input type="number" min="1" max="200" placeholder={t("capacity")} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm" />
            <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? tc("saving") : tc("save")}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">{tc("cancel")}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : routes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noRoutes")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noRoutesHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((r) => (
            <div key={r.publicId} className="rounded-lg border border-border bg-surface">
              <button onClick={() => toggleExpand(r.publicId)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <div>
                  <span className="font-medium">{r.name}</span>
                  {r.vehicleNo && <span className="ml-2 text-sm text-muted-foreground">{r.vehicleNo}</span>}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{r._count.stops} {t("stops")}</span>
                  <span>{t("studentsAssigned", { count: r._count.assignments })}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteRoute(r.publicId); }} className="text-xs text-red-600 hover:underline">{tc("delete")}</button>
                </div>
              </button>
              {expanded === r.publicId && (
                <div className="border-t border-border px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{t("stops")}</span>
                    <button onClick={() => setAddingStop(addingStop === r.publicId ? null : r.publicId)} className="text-xs text-brand-600 hover:underline">{t("addStop")}</button>
                  </div>
                  {addingStop === r.publicId && (
                    <div className="mb-3 flex flex-wrap items-end gap-2">
                      <input required placeholder={t("stopName")} value={stopForm.name} onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-sm" />
                      <input placeholder={t("pickupTime")} value={stopForm.pickupTime} onChange={(e) => setStopForm({ ...stopForm, pickupTime: e.target.value })} className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm" />
                      <input placeholder={t("dropTime")} value={stopForm.dropTime} onChange={(e) => setStopForm({ ...stopForm, dropTime: e.target.value })} className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm" />
                      <button onClick={() => handleAddStop(r.publicId)} className="rounded-md bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-700">{tc("save")}</button>
                    </div>
                  )}
                  {stops[r.publicId]?.length ? (
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-muted-foreground"><th className="pb-1 text-left">#</th><th className="pb-1 text-left">{t("stopName")}</th><th className="pb-1 text-left">{t("pickupTime")}</th><th className="pb-1 text-left">{t("dropTime")}</th></tr></thead>
                      <tbody>
                        {stops[r.publicId].map((s) => (
                          <tr key={s.publicId}><td>{s.sortOrder}</td><td>{s.name}</td><td>{s.pickupTime ?? "—"}</td><td>{s.dropTime ?? "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No stops yet</p>
                  )}
                  {r.driverName && <p className="mt-2 text-sm text-muted-foreground">{t("driverName")}: {r.driverName} {r.driverPhone && `(${r.driverPhone})`}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentsTab({ onError }: { onError: (e: string | null) => void }) {
  const t = useTranslations("transport");
  const tc = useTranslations("common");
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    onError(null);
    api<Record<string, unknown>[]>(`/api/transport/assignments?page=${page}&pageSize=20`)
      .then((r) => { setAssignments(r.data); setTotal(r.meta?.total ?? 0); })
      .catch((e) => onError(e instanceof Error ? e.message : tc("error")))
      .finally(() => setLoading(false));
  }, [page, refreshKey, onError, tc]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(id: string) {
    try {
      await api(`/api/transport/assignments/${id}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : tc("error"));
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>
      ) : assignments.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">{t("noAssignments")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noAssignmentsHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{tc("name")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("route")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("stop")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assignments.map((a) => {
                const student = a.student as { publicId: string; name: string } | undefined;
                const route = a.route as { publicId: string; name: string } | undefined;
                const stop = a.stop as { publicId: string; name: string } | undefined;
                return (
                  <tr key={a.publicId as string} className="hover:bg-muted/30">
                    <td className="px-4 py-3">{student?.name ?? "—"}</td>
                    <td className="px-4 py-3">{route?.name ?? "—"}</td>
                    <td className="px-4 py-3">{stop?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleRemove(a.publicId as string)} className="text-xs text-red-600 hover:underline">{tc("delete")}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{tc("page")} {page} / {totalPages} ({total} {tc("total")})</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("prev")}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-40">{tc("next")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
