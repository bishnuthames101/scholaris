import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SubscriptionsManager } from "./subscriptions-manager";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const session = await getSession();
  if (!session?.superadmin) redirect("/dashboard");

  return <SubscriptionsManager />;
}
