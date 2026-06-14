import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Get Started" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.superadmin) redirect("/admin/overview");

  return <OnboardingWizard />;
}
