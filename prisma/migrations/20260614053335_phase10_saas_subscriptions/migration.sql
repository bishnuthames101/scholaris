-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'starter', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'past_due', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "plans" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "tier" "PlanTier" NOT NULL DEFAULT 'starter',
    "description" TEXT,
    "description_ne" TEXT,
    "monthly_price_paisa" INTEGER NOT NULL DEFAULT 0,
    "annual_price_paisa" INTEGER NOT NULL DEFAULT 0,
    "max_students" INTEGER NOT NULL DEFAULT 100,
    "max_staff" INTEGER NOT NULL DEFAULT 20,
    "max_messages_per_month" INTEGER NOT NULL DEFAULT 500,
    "included_credits" INTEGER NOT NULL DEFAULT 0,
    "modules" TEXT[] DEFAULT ARRAY['sis', 'attendance', 'fees', 'exams', 'communication', 'notices']::TEXT[],
    "features" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "trial_days" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "plan_id" BIGINT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "billing" TEXT NOT NULL DEFAULT 'monthly',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "current_students" INTEGER NOT NULL DEFAULT 0,
    "current_staff" INTEGER NOT NULL DEFAULT 0,
    "messages_this_month" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "subscription_id" BIGINT NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL DEFAULT 0,
    "tax_paisa" INTEGER NOT NULL DEFAULT 0,
    "total_paisa" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_configs" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NPR',
    "currency_symbol" TEXT NOT NULL DEFAULT 'रू',
    "locale" TEXT NOT NULL DEFAULT 'ne',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kathmandu',
    "calendar_system" TEXT NOT NULL DEFAULT 'bikram_sambat',
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 4,
    "default_grade_scale" TEXT NOT NULL DEFAULT 'neb_4.0',
    "payment_providers" TEXT[] DEFAULT ARRAY['esewa', 'khalti']::TEXT[],
    "tax_config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_public_id_key" ON "plans"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_public_id_key" ON "subscriptions"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_public_id_key" ON "subscription_invoices"("public_id");

-- CreateIndex
CREATE INDEX "subscription_invoices_tenant_id_status_idx" ON "subscription_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "subscription_invoices_subscription_id_idx" ON "subscription_invoices"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_tenant_id_invoice_no_key" ON "subscription_invoices"("tenant_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "country_configs_public_id_key" ON "country_configs"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "country_configs_code_key" ON "country_configs"("code");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
