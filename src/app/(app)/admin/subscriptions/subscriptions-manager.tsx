"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  CreditCard,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { api } from "@/lib/client-api";

type Sub = {
  publicId: string;
  status: string;
  billing: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  currentStudents: number;
  currentStaff: number;
  messagesThisMonth: number;
  plan: { publicId: string; name: string; tier: string; maxStudents: number; maxStaff: number };
  tenant: { publicId: string; name: string; slug: string; status: string };
};

type TenantOption = { publicId: string; name: string; slug: string };
type PlanOption = { publicId: string; name: string; tier: string };

const statusTone = {
  active: "success",
  trial: "info",
  past_due: "warning",
  cancelled: "danger",
  expired: "neutral",
} as const;

export function SubscriptionsManager() {
  const router = useRouter();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  useEffect(() => {
    loadSubs();
  }, [page, search]);

  async function loadSubs() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search) q.set("q", search);
      const r = await api<Sub[]>(`/api/subscriptions?${q}`);
      setSubs(r.data);
      setTotal(r.meta?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }

  async function openAssignDialog() {
    setError(null);
    // Load tenants and plans
    const [t, p] = await Promise.all([
      api<TenantOption[]>("/api/tenants"),
      api<PlanOption[]>("/api/plans"),
    ]);
    setTenants(t.data);
    setPlans(p.data);
    setShowAssign(true);
  }

  async function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantPublicId: form.get("tenantId"),
          planPublicId: form.get("planId"),
          billing: form.get("billing"),
          trialDays: Number(form.get("trialDays") || 30),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Something went wrong");
        return;
      }
      setShowAssign(false);
      loadSubs();
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted">Manage school subscriptions and billing</p>
        </div>
        <Button onClick={openAssignDialog}>
          <Plus className="size-4" />
          Assign Plan
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-10"
          placeholder="Search by school name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : subs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-50">
              <CreditCard className="size-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No subscriptions</h2>
            <p className="max-w-sm text-sm text-muted">
              Assign a plan to a school to create their subscription.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted">School</th>
                  <th className="px-4 py-3 text-left font-medium text-muted">Plan</th>
                  <th className="px-4 py-3 text-left font-medium text-muted">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted">Billing</th>
                  <th className="px-4 py-3 text-left font-medium text-muted">Usage</th>
                  <th className="px-4 py-3 text-left font-medium text-muted">Period End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map((sub) => (
                  <tr key={sub.publicId} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{sub.tenant.name}</p>
                        <p className="text-xs text-muted">/{sub.tenant.slug}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={sub.plan.tier === "enterprise" ? "success" : sub.plan.tier === "professional" ? "brand" : "info"}>
                        {sub.plan.name}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[sub.status as keyof typeof statusTone] ?? "neutral"}>
                        {sub.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 capitalize text-foreground">{sub.billing}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {sub.currentStudents}/{sub.plan.maxStudents} students
                      <br />
                      {sub.currentStaff}/{sub.plan.maxStaff} staff
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                      {sub.trialEndsAt && (
                        <p className="text-xs text-muted">
                          Trial ends: {new Date(sub.trialEndsAt).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className="flex justify-center">
              <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Assign subscription dialog */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setShowAssign(false)}
          />
          <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-overlay">
            <button
              className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-surface-muted"
              onClick={() => setShowAssign(false)}
            >
              <X className="size-4.5" />
            </button>
            <h2 className="mb-5 text-lg font-semibold text-foreground">Assign Plan to School</h2>

            <form onSubmit={onAssign} className="space-y-4">
              <Field label="School" htmlFor="tenantId" required>
                <select
                  id="tenantId"
                  name="tenantId"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select a school...</option>
                  {tenants.map((t) => (
                    <option key={t.publicId} value={t.publicId}>
                      {t.name} (/{t.slug})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Plan" htmlFor="planId" required>
                <select
                  id="planId"
                  name="planId"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select a plan...</option>
                  {plans.map((p) => (
                    <option key={p.publicId} value={p.publicId}>
                      {p.name} ({p.tier})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Billing Cycle" htmlFor="billing" required>
                <select
                  id="billing"
                  name="billing"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </Field>

              <Field label="Trial Days" htmlFor="trialDays">
                <Input id="trialDays" name="trialDays" type="number" min={0} defaultValue={30} />
              </Field>

              {error && (
                <div className="rounded-md border border-danger/20 bg-danger-bg px-3 py-2.5 text-sm text-danger">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAssign(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  Assign
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
