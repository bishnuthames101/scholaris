import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PlansManager } from "./plans-manager";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const session = await getSession();
  if (!session?.superadmin) redirect("/dashboard");

  return <PlansManager />;
}
