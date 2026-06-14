"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Receipt,
  MessageSquare,
  AlertTriangle,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client-api";

type Analytics = {
  counts: { students: number; staff: number; guardians: number };
  attendance: {
    overallRate: number;
    trend: { date: string; present: number; absent: number; late: number; total: number; rate: number }[];
  };
  fees: {
    totalInvoicedPaisa: number;
    totalCollectedPaisa: number;
    totalPendingPaisa: number;
    collectionTrend: { date: string; amountPaisa: number }[];
  };
  atRisk: {
    count: number;
    students: {
      publicId: string;
      name: string;
      admissionNo: string;
      reasons: string[];
    }[];
  };
  messages: { sentLast30d: number };
};

function formatNPR(paisa: number): string {
  return `रू ${(paisa / 100).toLocaleString("en-NP", { minimumFractionDigits: 0 })}`;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-surface-muted">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  iconColor: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Analytics>("/api/analytics?days=30")
      .then((r) => setData(r.data))
      .catch(() => {})
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
    return <div className="py-20 text-center text-muted">Unable to load dashboard data.</div>;
  }

  const collectionRate =
    data.fees.totalInvoicedPaisa > 0
      ? Math.round((data.fees.totalCollectedPaisa / data.fees.totalInvoicedPaisa) * 100)
      : 0;

  // Last 7 days of attendance trend for sparkline
  const recentAttendance = data.attendance.trend.slice(-7);

  return (
    <div className="space-y-8">
      {/* Key stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Students"
          value={data.counts.students.toLocaleString()}
          iconColor="bg-brand-50 text-brand-600"
        />
        <StatCard
          icon={UserCheck}
          label="Attendance Rate"
          value={`${data.attendance.overallRate}%`}
          sub="Last 30 days"
          iconColor={
            data.attendance.overallRate >= 80
              ? "bg-success-bg text-success"
              : "bg-warning-bg text-warning"
          }
        />
        <StatCard
          icon={Receipt}
          label="Fee Collection"
          value={formatNPR(data.fees.totalCollectedPaisa)}
          sub={`${collectionRate}% collected`}
          iconColor="bg-info-bg text-info"
        />
        <StatCard
          icon={AlertTriangle}
          label="At-Risk Students"
          value={data.atRisk.count}
          sub="Low attendance or overdue fees"
          iconColor={
            data.atRisk.count > 0 ? "bg-danger-bg text-danger" : "bg-success-bg text-success"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Attendance trend */}
        <Card>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Attendance (Last 7 Days)</h3>
              <Link href="/attendance" className="text-xs text-brand-600 hover:underline">
                View all <ArrowRight className="inline size-3" />
              </Link>
            </div>
            {recentAttendance.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">No attendance data yet</p>
            ) : (
              <div className="space-y-2">
                {recentAttendance.map((day) => (
                  <div key={day.date} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 text-xs text-muted">
                      {new Date(day.date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex-1">
                      <MiniBar value={day.present + day.late} max={day.total} color="bg-success" />
                    </div>
                    <span className={`w-12 text-right text-xs font-medium ${day.rate >= 80 ? "text-success" : "text-warning"}`}>
                      {day.rate}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fee collection summary */}
        <Card>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Fee Collection</h3>
              <Link href="/fees" className="text-xs text-brand-600 hover:underline">
                View all <ArrowRight className="inline size-3" />
              </Link>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted">Collected</span>
                  <span className="font-medium text-foreground">{formatNPR(data.fees.totalCollectedPaisa)}</span>
                </div>
                <MiniBar
                  value={data.fees.totalCollectedPaisa}
                  max={data.fees.totalInvoicedPaisa}
                  color="bg-success"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted">Pending</span>
                  <span className="font-medium text-warning">{formatNPR(data.fees.totalPendingPaisa)}</span>
                </div>
                <MiniBar
                  value={data.fees.totalPendingPaisa}
                  max={data.fees.totalInvoicedPaisa}
                  color="bg-warning"
                />
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">Total Invoiced</span>
                <span className="font-semibold text-foreground">{formatNPR(data.fees.totalInvoicedPaisa)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* At-risk students */}
      {data.atRisk.count > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">
                <AlertTriangle className="mr-2 inline size-4 text-warning" />
                At-Risk Students
              </h3>
              <Badge tone="warning">{data.atRisk.count} flagged</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="pb-2 text-left font-medium text-muted">Student</th>
                    <th className="pb-2 text-left font-medium text-muted">Adm. No.</th>
                    <th className="pb-2 text-left font-medium text-muted">Risk Factors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.atRisk.students.map((s) => (
                    <tr key={s.publicId}>
                      <td className="py-2.5 font-medium text-foreground">{s.name}</td>
                      <td className="py-2.5 font-mono text-xs text-muted">{s.admissionNo}</td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.reasons.map((r) => (
                            <Badge key={r} tone={r.includes("attendance") ? "warning" : "danger"}>
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick stats footer */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <Briefcase className="size-5 text-brand-600" />
            <div>
              <p className="text-sm text-muted">Staff Members</p>
              <p className="text-lg font-semibold text-foreground">{data.counts.staff}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <Users className="size-5 text-brand-600" />
            <div>
              <p className="text-sm text-muted">Guardians</p>
              <p className="text-lg font-semibold text-foreground">{data.counts.guardians}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <MessageSquare className="size-5 text-brand-600" />
            <div>
              <p className="text-sm text-muted">Messages (30d)</p>
              <p className="text-lg font-semibold text-foreground">{data.messages.sentLast30d}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
