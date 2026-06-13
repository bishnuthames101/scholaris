/**
 * Portal helpers — resolve the current authenticated user to their linked
 * Guardian, Student, or Staff record for portal scoping.
 */

import { ApiError } from "./api";
import { requireRole } from "./auth/session";
import type { AccessClaims } from "./auth/jwt";
import { withTenant } from "./db";

export type PortalParent = {
  session: AccessClaims;
  tenantId: bigint;
  guardianId: bigint;
  guardian: { id: bigint; publicId: string; name: string; phone: string };
};

export type PortalStudent = {
  session: AccessClaims;
  tenantId: bigint;
  studentId: bigint;
  student: { id: bigint; publicId: string; name: string; admissionNo: string };
};

export type PortalTeacher = {
  session: AccessClaims;
  tenantId: bigint;
  staffId: bigint;
  staff: { id: bigint; publicId: string; name: string };
};

async function resolveUserId(session: AccessClaims): Promise<{ userId: bigint; tenantId: bigint }> {
  if (!session.tenantDbId)
    throw new ApiError("NO_TENANT", "This action requires a school account", 403);
  const tenantId = BigInt(session.tenantDbId);

  // User table lookup — must use superadmin since RLS is enforced
  const user = await withTenant(
    null,
    (tx) =>
      tx.user.findFirst({
        where: { publicId: session.sub, deletedAt: null },
        select: { id: true },
      }),
    { superadmin: true },
  );
  if (!user) throw new ApiError("USER_NOT_FOUND", "User account not found", 404);
  return { userId: user.id, tenantId };
}

/** Require a parent portal session. Resolves the logged-in user to their Guardian record. */
export async function requireParent(): Promise<PortalParent> {
  const session = await requireRole("parent");
  const { userId, tenantId } = await resolveUserId(session);

  const g = await withTenant(tenantId, (tx) =>
    tx.guardian.findFirst({
      where: { tenantId, userId, deletedAt: null },
      select: { id: true, publicId: true, name: true, phone: true },
    }),
  );
  if (!g) throw new ApiError("GUARDIAN_NOT_LINKED", "No guardian profile linked to this account", 403);
  return { session, tenantId, guardianId: g.id, guardian: g };
}

/** Require a student portal session. Resolves the logged-in user to their Student record. */
export async function requireStudent(): Promise<PortalStudent> {
  const session = await requireRole("student");
  const { userId, tenantId } = await resolveUserId(session);

  const s = await withTenant(tenantId, (tx) =>
    tx.student.findFirst({
      where: { tenantId, userId, deletedAt: null },
      select: { id: true, publicId: true, name: true, admissionNo: true },
    }),
  );
  if (!s) throw new ApiError("STUDENT_NOT_LINKED", "No student profile linked to this account", 403);
  return { session, tenantId, studentId: s.id, student: s };
}

/** Require a teacher portal session. Resolves the logged-in user to their Staff record. */
export async function requireTeacher(): Promise<PortalTeacher> {
  const session = await requireRole("teacher", "class_teacher");
  const { userId, tenantId } = await resolveUserId(session);

  const st = await withTenant(tenantId, (tx) =>
    tx.staff.findFirst({
      where: { tenantId, userId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    }),
  );
  if (!st) throw new ApiError("STAFF_NOT_LINKED", "No staff profile linked to this account", 403);
  return { session, tenantId, staffId: st.id, staff: st };
}
