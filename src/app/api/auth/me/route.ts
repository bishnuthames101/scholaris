import { handler, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";

export const GET = handler(async () => {
  const session = await requireSession();
  return ok({
    publicId: session.sub,
    tenantId: session.tenantId,
    roles: session.roles,
    superadmin: session.superadmin,
    locale: session.locale,
  });
});
