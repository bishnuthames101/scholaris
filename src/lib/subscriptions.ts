/**
 * Subscription & plan gating utilities (§9, Phase 10).
 * Checks tenant's plan limits before allowing resource creation.
 */

import type { PlanTier } from "@prisma/client";
import { ApiError } from "./api";

/** All gatable modules in the system. */
export const ALL_MODULES = [
  "sis",
  "attendance",
  "fees",
  "exams",
  "communication",
  "notices",
  "timetable",
  "homework",
  "library",
  "transport",
  "hr",
  "admissions",
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

/** Human-readable module names for UI. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  sis: "Student Information",
  attendance: "Attendance & RFID",
  fees: "Fees & Finance",
  exams: "Exams & Grading",
  communication: "Communication Hub",
  notices: "Notices",
  timetable: "Timetable",
  homework: "Homework",
  library: "Library",
  transport: "Transport",
  hr: "HR & Payroll",
  admissions: "Admissions CRM",
};

// Minimal tx client type for subscription queries
type SubTxClient = {
  subscription: {
    findUnique: (args: {
      where: { tenantId: bigint };
      include?: { plan: boolean };
    }) => Promise<{
      status: string;
      trialEndsAt: Date | null;
      currentStudents: number;
      currentStaff: number;
      messagesThisMonth: number;
      plan: {
        tier: PlanTier;
        maxStudents: number;
        maxStaff: number;
        maxMessagesPerMonth: number;
        modules: string[];
        features: unknown;
      };
    } | null>;
  };
};

export type PlanLimits = {
  maxStudents: number;
  maxStaff: number;
  maxMessagesPerMonth: number;
  modules: string[];
  features: Record<string, unknown>;
  tier: PlanTier;
};

export type UsageSnapshot = {
  currentStudents: number;
  currentStaff: number;
  messagesThisMonth: number;
};

/**
 * Get the tenant's plan limits. Returns null if no subscription exists
 * (treat as free/unlimited during initial setup).
 */
export async function getPlanLimits(
  tx: SubTxClient,
  tenantId: bigint,
): Promise<(PlanLimits & UsageSnapshot & { status: string; trialEndsAt: Date | null }) | null> {
  const sub = await tx.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!sub) return null;

  return {
    tier: sub.plan.tier,
    maxStudents: sub.plan.maxStudents,
    maxStaff: sub.plan.maxStaff,
    maxMessagesPerMonth: sub.plan.maxMessagesPerMonth,
    modules: sub.plan.modules,
    features: (sub.plan.features as Record<string, unknown>) ?? {},
    currentStudents: sub.currentStudents,
    currentStaff: sub.currentStaff,
    messagesThisMonth: sub.messagesThisMonth,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
  };
}

/**
 * Check if tenant has access to a module. Throws 403 if not.
 * If no subscription exists (pre-setup), access is allowed.
 */
export async function requireModuleAccess(
  tx: SubTxClient,
  tenantId: bigint,
  moduleKey: ModuleKey,
): Promise<void> {
  const limits = await getPlanLimits(tx, tenantId);
  if (!limits) return; // no subscription = unrestricted (initial setup)

  // Check subscription is active
  if (limits.status === "cancelled" || limits.status === "expired") {
    throw new ApiError(
      "SUBSCRIPTION_INACTIVE",
      "Your subscription is inactive. Please renew to continue.",
      403,
    );
  }

  // Check trial expiry
  if (limits.status === "trial" && limits.trialEndsAt && limits.trialEndsAt < new Date()) {
    throw new ApiError(
      "TRIAL_EXPIRED",
      "Your trial has expired. Please subscribe to continue.",
      403,
    );
  }

  // Check module access
  if (!limits.modules.includes(moduleKey)) {
    throw new ApiError(
      "MODULE_NOT_AVAILABLE",
      `The ${MODULE_LABELS[moduleKey]} module is not included in your plan. Please upgrade.`,
      403,
    );
  }
}

/**
 * Check if tenant can add more students. Throws 403 if limit reached.
 */
export async function checkStudentLimit(
  tx: SubTxClient,
  tenantId: bigint,
): Promise<void> {
  const limits = await getPlanLimits(tx, tenantId);
  if (!limits) return;

  if (limits.currentStudents >= limits.maxStudents) {
    throw new ApiError(
      "STUDENT_LIMIT_REACHED",
      `Your plan allows up to ${limits.maxStudents} students. Please upgrade for more.`,
      403,
    );
  }
}

/**
 * Check if tenant can add more staff. Throws 403 if limit reached.
 */
export async function checkStaffLimit(
  tx: SubTxClient,
  tenantId: bigint,
): Promise<void> {
  const limits = await getPlanLimits(tx, tenantId);
  if (!limits) return;

  if (limits.currentStaff >= limits.maxStaff) {
    throw new ApiError(
      "STAFF_LIMIT_REACHED",
      `Your plan allows up to ${limits.maxStaff} staff members. Please upgrade for more.`,
      403,
    );
  }
}

/**
 * Check if tenant can send more messages this month. Throws 403 if limit reached.
 */
export async function checkMessageLimit(
  tx: SubTxClient,
  tenantId: bigint,
): Promise<void> {
  const limits = await getPlanLimits(tx, tenantId);
  if (!limits) return;

  if (limits.messagesThisMonth >= limits.maxMessagesPerMonth) {
    throw new ApiError(
      "MESSAGE_LIMIT_REACHED",
      `Your plan allows ${limits.maxMessagesPerMonth} messages/month. Please upgrade or purchase credits.`,
      403,
    );
  }
}
