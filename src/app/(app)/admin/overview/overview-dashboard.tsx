"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  TrendingUp,
  MessageSquare,
  CreditCard,
  UserPlus,
  GraduationCap,
  Briefcase,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client-api";

type Overview = {
  schools: { total: number; active: number; trial: number; suspended: number };
  subscriptions: { total: number; active: number };
  revenue: { mrrPaisa: number };
  usage: { students: number; staff: number; users: number; messagesLast30d: number };
  growth: { signupsLast30d: number };
  planDistribution: { plan: string; tier: string; count: number }[];
};

function formatNPR(paisa: number): string {
  return `रू ${(paisa / 100).toLocaleString("en-NP", { minimumFractionDigits: 0 })}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "brand",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "brand" | "success" | "info" | "warning";
}) {
  const iconBg = {
    brand: "bg-brand-50 text-brand-600",
    success: "bg-success-bg text-success",
    info: "bg-info-bg text-info",
    warning: "bg-warning-bg text-warning",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start gap-4 pt-5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Overview>("/api/admin/overview")
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-muted">Failed to load overview data.</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Platform Overview</h1>
        <p className="mt-1 text-sm text-muted">Your SaaS metrics at a glance</p>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CreditCard}
          label="Monthly Recurring Revenue"
          value={formatNPR(data.revenue.mrrPaisa)}
          tone="success"
        />
        <StatCard
          icon={Building2}
          label="Total Schools"
          value={data.schools.total}
          sub={`${data.schools.active} active · ${data.schools.trial} trial`}
          tone="brand"
        />
        <StatCard
          icon={UserPlus}
          label="New Signups (30d)"
          value={data.growth.signupsLast30d}
          tone="info"
        />
        <StatCard
          icon={MessageSquare}
          label="Messages Sent (30d)"
          value={data.usage.messagesLast30d.toLocaleString()}
          tone="warning"
        />
      </div>

      {/* Usage & Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform usage */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-4 font-semibold text-foreground">Platform Usage</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GraduationCap className="size-4.5 text-brand-600" />
                  <span className="text-sm text-foreground">Total Students</span>
                </div>
                <span className="font-semibold text-foreground">{data.usage.students.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Briefcase className="size-4.5 text-brand-600" />
                  <span className="text-sm text-foreground">Total Staff</span>
                </div>
                <span className="font-semibold text-foreground">{data.usage.staff.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="size-4.5 text-brand-600" />
                  <span className="text-sm text-foreground">Total Users</span>
                </div>
                <span className="font-semibold text-foreground">{data.usage.users.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plan distribution */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-4 font-semibold text-foreground">Plan Distribution</h3>
            {data.planDistribution.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No subscriptions yet</p>
            ) : (
              <div className="space-y-3">
                {data.planDistribution.map((pd) => (
                  <div key={pd.plan} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{pd.plan}</span>
                      <Badge tone="brand">{pd.tier}</Badge>
                    </div>
                    <span className="font-semibold text-foreground">
                      {pd.count} {pd.count === 1 ? "school" : "schools"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* School breakdown */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 font-semibold text-foreground">School Status Breakdown</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            {(
              [
                { label: "Active", value: data.schools.active, tone: "success" },
                { label: "Trial", value: data.schools.trial, tone: "info" },
                { label: "Suspended", value: data.schools.suspended, tone: "warning" },
                { label: "Subscribed", value: data.subscriptions.active, tone: "brand" },
              ] as const
            ).map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-center"
              >
                <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                <p className="text-xs text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
