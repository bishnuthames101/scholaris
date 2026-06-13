import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { PortalShell } from "@/components/shell/portal-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const isPortalUser =
    session.roles.includes("parent") || session.roles.includes("student");
  if (!isPortalUser && !session.superadmin) redirect("/dashboard");

  // Resolve user name for display
  let userName = "User";
  if (session.tenantDbId) {
    const user = await withTenant(
      null,
      (tx) =>
        tx.user.findFirst({
          where: { publicId: session.sub, deletedAt: null },
          select: { name: true },
        }),
      { superadmin: true },
    );
    if (user) userName = user.name;
  }

  return (
    <PortalShell user={{ name: userName, roles: session.roles }}>
      {children}
    </PortalShell>
  );
}
