-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('whatsapp', 'sms', 'viber', 'push');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "slug" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "body_ne" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "template_id" BIGINT,
    "recipient_phone" TEXT,
    "recipient_name" TEXT,
    "guardian_id" BIGINT,
    "student_id" BIGINT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "subject" TEXT,
    "body_en" TEXT NOT NULL,
    "body_ne" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "trigger_type" TEXT,
    "trigger_event_id" BIGINT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "cost_paisa" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_credits" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "total_used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_groups" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "filter" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_group_members" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "group_id" BIGINT NOT NULL,
    "guardian_id" BIGINT,
    "phone" TEXT,
    "name" TEXT,

    CONSTRAINT "contact_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_public_id_key" ON "notification_templates"("public_id");

-- CreateIndex
CREATE INDEX "notification_templates_tenant_id_idx" ON "notification_templates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_slug_key" ON "notification_templates"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_public_id_key" ON "notifications"("public_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_status_created_at_idx" ON "notifications"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_trigger_type_created_at_idx" ON "notifications"("tenant_id", "trigger_type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_guardian_id_idx" ON "notifications"("tenant_id", "guardian_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_student_id_idx" ON "notifications"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_credits_public_id_key" ON "message_credits"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_credits_tenant_id_key" ON "message_credits"("tenant_id");

-- CreateIndex
CREATE INDEX "message_credits_tenant_id_idx" ON "message_credits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_public_id_key" ON "credit_transactions"("public_id");

-- CreateIndex
CREATE INDEX "credit_transactions_tenant_id_created_at_idx" ON "credit_transactions"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contact_groups_public_id_key" ON "contact_groups"("public_id");

-- CreateIndex
CREATE INDEX "contact_groups_tenant_id_idx" ON "contact_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_groups_tenant_id_name_key" ON "contact_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "contact_group_members_tenant_id_idx" ON "contact_group_members"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_group_members_group_id_guardian_id_key" ON "contact_group_members"("group_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_group_members_group_id_phone_key" ON "contact_group_members"("group_id", "phone");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "contact_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
