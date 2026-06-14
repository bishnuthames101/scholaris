"use client";

import { useEffect, useState } from "react";
import {
  Package,
  Users,
  Briefcase,
  MessageSquare,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client-api";

type Subscription = {
  publicId: string;
  status: string;
  billing: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  currentStudents: number;
  currentStaff: number;
  messagesThisMonth: number;
  plan: {
    publicId: string;
    name: string;
    nameNe: string | null;
    tier: string;
    description: string | null;
    monthlyPricePaisa: number;
    annualPricePaisa: number;
    maxStudents: number;
    maxStaff: number;
    maxMessagesPerMonth: number;
    modules: string[];
  };
};

type CreditBalance = {
  balance: number;
  totalUsed: number;
};

function formatNPR(paisa: number): string {
  return `रू ${(paisa / 100).toLocaleString("en-NP")}`;
}

function UsageMeter({
  icon: Icon,
  label,
  current,
  max,
  warning,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  current: number;
  max: number;
  warning?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const color = pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warning" : "bg-success";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Icon className="size-4 text-muted" />
          {label}
        </div>
        <span className={`font-medium ${pct >= 90 ? "text-danger" : "text-foreground"}`}>
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-muted">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {warning && pct >= 90 && (
        <p className="flex items-center gap-1 text-xs text-danger">
          <AlertTriangle className="size-3" />
          Approaching limit — consider upgrading
        </p>
      )}
    </div>
  );
}

const statusConfig = {
  active: { label: "Active", tone: "success" as const, icon: CheckCircle2 },
  trial: { label: "Trial", tone: "info" as const, icon: Zap },
  past_due: { label: "Past Due", tone: "warning" as const, icon: AlertTriangle },
  cancelled: { label: "Cancelled", tone: "danger" as const, icon: AlertTriangle },
  expired: { label: "Expired", tone: "neutral" as const, icon: AlertTriangle },
};

export function BillingSettings() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Subscription>("/api/subscriptions").catch(() => ({ data: null })),
      api<CreditBalance>("/api/notifications/credits").catch(() => ({ data: null })),
    ])
      .then(([s, c]) => {
        setSub(s.data);
        setCredits(c.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Billing & Plan</h1>
        <p className="mt-1 text-sm text-muted">View your current plan, usage, and message credits</p>
      </div>

      {!sub ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-50">
              <Package className="size-6 text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No active subscription</h2>
            <p className="max-w-sm text-sm text-muted">
              Your school doesn&apos;t have an active plan yet. Contact your administrator to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Current plan */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{sub.plan.name}</h3>
                    <Badge tone={statusConfig[sub.status as keyof typeof statusConfig]?.tone ?? "neutral"}>
                      {statusConfig[sub.status as keyof typeof statusConfig]?.label ?? sub.status}
                    </Badge>
                  </div>
                  {sub.plan.description && (
                    <p className="mt-1 text-sm text-muted">{sub.plan.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-foreground">
                    {formatNPR(
                      sub.billing === "annual" ? sub.plan.annualPricePaisa : sub.plan.monthlyPricePaisa,
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    per {sub.billing === "annual" ? "year" : "month"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 text-sm text-muted">
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  <span>
                    Period: {new Date(sub.currentPeriodStart).toLocaleDateString()} —{" "}
                    {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
                {sub.trialEndsAt && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="size-3.5 text-info" />
                    <span>Trial ends: {new Date(sub.trialEndsAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Usage meters */}
          <Card>
            <CardContent className="space-y-5 pt-5">
              <h3 className="font-semibold text-foreground">Usage</h3>
              <UsageMeter
                icon={Users}
                label="Students"
                current={sub.currentStudents}
                max={sub.plan.maxStudents}
                warning
              />
              <UsageMeter
                icon={Briefcase}
                label="Staff"
                current={sub.currentStaff}
                max={sub.plan.maxStaff}
                warning
              />
              <UsageMeter
                icon={MessageSquare}
                label="Messages this month"
                current={sub.messagesThisMonth}
                max={sub.plan.maxMessagesPerMonth}
                warning
              />
            </CardContent>
          </Card>

          {/* Included modules */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-3 font-semibold text-foreground">Included Modules</h3>
              <div className="flex flex-wrap gap-2">
                {sub.plan.modules.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1.5 rounded-md bg-success-bg px-2.5 py-1 text-xs font-medium text-success"
                  >
                    <CheckCircle2 className="size-3" />
                    {m}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Message credits */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Message Credits</h3>
            <CreditCard className="size-5 text-muted" />
          </div>
          {credits ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-brand-50 px-4 py-3 text-center">
                <p className="text-2xl font-semibold text-brand-800">{credits.balance.toLocaleString()}</p>
                <p className="text-xs text-brand-600">Available credits</p>
              </div>
              <div className="rounded-lg bg-surface-muted px-4 py-3 text-center">
                <p className="text-2xl font-semibold text-foreground">{credits.totalUsed.toLocaleString()}</p>
                <p className="text-xs text-muted">Total used</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No credit information available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
