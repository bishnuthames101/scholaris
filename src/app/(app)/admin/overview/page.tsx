import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { OverviewDashboard } from "./overview-dashboard";

export const metadata: Metadata = { title: "Platform Overview" };

export default async function OverviewPage() {
  const session = await getSession();
  if (!session?.superadmin) redirect("/dashboard");

  return <OverviewDashboard />;
}
