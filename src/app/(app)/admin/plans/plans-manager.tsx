"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Package,
  Users,
  Briefcase,
  MessageSquare,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client-api";

const ALL_MODULES = [
  { key: "sis", label: "Student Information" },
  { key: "attendance", label: "Attendance & RFID" },
  { key: "fees", label: "Fees & Finance" },
  { key: "exams", label: "Exams & Grading" },
  { key: "communication", label: "Communication Hub" },
  { key: "notices", label: "Notices" },
  { key: "timetable", label: "Timetable" },
  { key: "homework", label: "Homework" },
  { key: "library", label: "Library" },
  { key: "transport", label: "Transport" },
  { key: "hr", label: "HR & Payroll" },
  { key: "admissions", label: "Admissions CRM" },
];

type Plan = {
  publicId: string;
  name: string;
  nameNe?: string;
  tier: string;
  description?: string;
  monthlyPricePaisa: number;
  annualPricePaisa: number;
  maxStudents: number;
  maxStaff: number;
  maxMessagesPerMonth: number;
  includedCredits: number;
  modules: string[];
  isActive: boolean;
  isDefault: boolean;
  trialDays: number;
  _count?: { subscriptions: number };
};

const tierTone = {
  free: "neutral",
  starter: "info",
  professional: "brand",
  enterprise: "success",
} as const;

function formatNPR(paisa: number): string {
  return `रू ${(paisa / 100).toLocaleString("en-NP")}`;
}

export function PlansManager() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(["sis", "attendance", "fees", "exams", "communication", "notices"]),
  );

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const r = await api<Plan[]>("/api/plans");
      setPlans(r.data);
    } finally {
      setLoading(false);
    }
  }

  function toggleModule(key: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onCreatePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          nameNe: form.get("nameNe") || undefined,
          tier: form.get("tier"),
          description: form.get("description") || undefined,
          monthlyPricePaisa: Number(form.get("monthlyPrice")) * 100,
          annualPricePaisa: Number(form.get("annualPrice")) * 100,
          maxStudents: Number(form.get("maxStudents")),
          maxStaff: Number(form.get("maxStaff")),
          maxMessagesPerMonth: Number(form.get("maxMessages")),
          includedCredits: Number(form.get("includedCredits") || 0),
          modules: Array.from(selectedModules),
          trialDays: Number(form.get("trialDays") || 30),
          isDefault: form.get("isDefault") === "on",
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Something went wrong");
        return;
      }
      setShowCreate(false);
      loadPlans();
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Plans</h1>
          <p className="mt-1 text-sm text-muted">Manage subscription plans for schools</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          Create Plan
        </Button>
      </div>

      {/* Plan cards */}
      {plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-50">
              <Package className="size-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No plans yet</h2>
            <p className="max-w-sm text-sm text-muted">Create your first subscription plan to start onboarding schools.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.publicId} className={`relative transition-shadow hover:shadow-raised ${!plan.isActive ? "opacity-60" : ""}`}>
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{plan.name}</h3>
                    {plan.description && (
                      <p className="mt-0.5 text-xs text-muted">{plan.description}</p>
                    )}
                  </div>
                  <Badge tone={tierTone[plan.tier as keyof typeof tierTone] ?? "neutral"}>
                    {plan.tier}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <p className="text-xl font-semibold text-foreground">
                    {formatNPR(plan.monthlyPricePaisa)}
                    <span className="text-sm font-normal text-muted">/mo</span>
                  </p>
                  {plan.annualPricePaisa > 0 && (
                    <p className="text-xs text-muted">
                      {formatNPR(plan.annualPricePaisa)}/yr
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-sm text-muted">
                  <div className="flex items-center gap-2">
                    <Users className="size-3.5" />
                    <span>Up to {plan.maxStudents} students</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="size-3.5" />
                    <span>Up to {plan.maxStaff} staff</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-3.5" />
                    <span>{plan.maxMessagesPerMonth} messages/mo</span>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted">Modules</p>
                  <div className="flex flex-wrap gap-1">
                    {plan.modules.map((m) => (
                      <span
                        key={m}
                        className="inline-block rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{plan._count?.subscriptions ?? 0} subscriptions</span>
                  <div className="flex gap-2">
                    {plan.isDefault && <Badge tone="success">Default</Badge>}
                    {!plan.isActive && <Badge tone="warning">Inactive</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create plan dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-6 shadow-overlay">
            <button
              className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-surface-muted"
              onClick={() => setShowCreate(false)}
            >
              <X className="size-4.5" />
            </button>
            <h2 className="mb-5 text-lg font-semibold text-foreground">Create Plan</h2>

            <form onSubmit={onCreatePlan} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Plan Name" htmlFor="name" required>
                  <Input id="name" name="name" required placeholder="Starter" />
                </Field>
                <Field label="Name (Nepali)" htmlFor="nameNe">
                  <Input id="nameNe" name="nameNe" lang="ne" />
                </Field>
              </div>

              <Field label="Description" htmlFor="description">
                <Input id="description" name="description" placeholder="For small schools..." />
              </Field>

              <Field label="Tier" htmlFor="tier" required>
                <select
                  id="tier"
                  name="tier"
                  required
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monthly Price (NPR)" htmlFor="monthlyPrice" required>
                  <Input
                    id="monthlyPrice"
                    name="monthlyPrice"
                    type="number"
                    min={0}
                    required
                    placeholder="999"
                  />
                </Field>
                <Field label="Annual Price (NPR)" htmlFor="annualPrice" required>
                  <Input
                    id="annualPrice"
                    name="annualPrice"
                    type="number"
                    min={0}
                    required
                    placeholder="9999"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Max Students" htmlFor="maxStudents" required>
                  <Input id="maxStudents" name="maxStudents" type="number" min={1} required defaultValue={100} />
                </Field>
                <Field label="Max Staff" htmlFor="maxStaff" required>
                  <Input id="maxStaff" name="maxStaff" type="number" min={1} required defaultValue={20} />
                </Field>
                <Field label="Max Msgs/Mo" htmlFor="maxMessages" required>
                  <Input id="maxMessages" name="maxMessages" type="number" min={0} required defaultValue={500} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Included Credits" htmlFor="includedCredits">
                  <Input id="includedCredits" name="includedCredits" type="number" min={0} defaultValue={0} />
                </Field>
                <Field label="Trial Days" htmlFor="trialDays">
                  <Input id="trialDays" name="trialDays" type="number" min={0} defaultValue={30} />
                </Field>
              </div>

              {/* Module selection */}
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Included Modules</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_MODULES.map((mod) => (
                    <label
                      key={mod.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-muted has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModules.has(mod.key)}
                        onChange={() => toggleModule(mod.key)}
                        className="sr-only"
                      />
                      <div
                        className={`flex size-4 items-center justify-center rounded border ${
                          selectedModules.has(mod.key)
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-border"
                        }`}
                      >
                        {selectedModules.has(mod.key) && <Check className="size-3" />}
                      </div>
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" className="rounded border-border" />
                <span>Set as default plan for new schools</span>
              </label>

              {error && (
                <div className="rounded-md border border-danger/20 bg-danger-bg px-3 py-2.5 text-sm text-danger">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  Create Plan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
