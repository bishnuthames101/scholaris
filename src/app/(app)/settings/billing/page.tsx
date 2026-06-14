import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { BillingSettings } from "./billing-settings";

export const metadata: Metadata = { title: "Billing & Plan" };

export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.superadmin) redirect("/admin/overview");

  return <BillingSettings />;
}
