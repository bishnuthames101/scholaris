-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('monthly', 'quarterly', 'annual', 'one_time');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('issued', 'partially_paid', 'paid', 'void');

-- CreateEnum
CREATE TYPE "InvoiceItemKind" AS ENUM ('fee', 'fine');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank', 'esewa', 'khalti');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('invoice_issued', 'payment_received', 'payment_reversed', 'invoice_voided');

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ne" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "fee_head_id" BIGINT NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'monthly',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "fee_head_id" BIGINT,
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_counters" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doc_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "student_id" BIGINT NOT NULL,
    "academic_year_id" BIGINT NOT NULL,
    "bs_year" INTEGER NOT NULL,
    "bs_month" INTEGER,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL DEFAULT 0,
    "fine_paisa" INTEGER NOT NULL DEFAULT 0,
    "total_paisa" INTEGER NOT NULL,
    "paid_paisa" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'issued',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "invoice_id" BIGINT NOT NULL,
    "fee_head_id" BIGINT,
    "kind" "InvoiceItemKind" NOT NULL DEFAULT 'fee',
    "label" TEXT NOT NULL,
    "label_ne" TEXT,
    "amount_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "receipt_no" TEXT,
    "fiscal_year" TEXT NOT NULL,
    "seq" INTEGER,
    "invoice_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "provider_ref" TEXT,
    "provider_payload" JSONB,
    "paid_at" TIMESTAMP(3),
    "received_by" TEXT,
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "invoice_id" BIGINT,
    "payment_id" BIGINT,
    "type" "LedgerEntryType" NOT NULL,
    "debit_paisa" INTEGER NOT NULL DEFAULT 0,
    "credit_paisa" INTEGER NOT NULL DEFAULT 0,
    "narration" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_public_id_key" ON "fee_heads"("public_id");

-- CreateIndex
CREATE INDEX "fee_heads_tenant_id_idx" ON "fee_heads"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_tenant_id_name_key" ON "fee_heads"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_public_id_key" ON "fee_structures"("public_id");

-- CreateIndex
CREATE INDEX "fee_structures_tenant_id_academic_year_id_class_id_idx" ON "fee_structures"("tenant_id", "academic_year_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_tenant_id_academic_year_id_class_id_fee_head_key" ON "fee_structures"("tenant_id", "academic_year_id", "class_id", "fee_head_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_discounts_public_id_key" ON "student_discounts"("public_id");

-- CreateIndex
CREATE INDEX "student_discounts_tenant_id_student_id_idx" ON "student_discounts"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_counters_tenant_id_kind_fiscal_year_key" ON "doc_counters"("tenant_id", "kind", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_public_id_key" ON "invoices"("public_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_student_id_created_at_idx" ON "invoices"("tenant_id", "student_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_due_date_idx" ON "invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_bs_year_bs_month_idx" ON "invoices"("tenant_id", "bs_year", "bs_month");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_no_key" ON "invoices"("tenant_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_fiscal_year_seq_key" ON "invoices"("tenant_id", "fiscal_year", "seq");

-- CreateIndex
CREATE INDEX "invoice_items_tenant_id_invoice_id_idx" ON "invoice_items"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_public_id_key" ON "payments"("public_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_invoice_id_idx" ON "payments"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_paid_at_idx" ON "payments"("tenant_id", "status", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_receipt_no_key" ON "payments"("tenant_id", "receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_fiscal_year_seq_key" ON "payments"("tenant_id", "fiscal_year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_public_id_key" ON "ledger_entries"("public_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_student_id_created_at_idx" ON "ledger_entries"("tenant_id", "student_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_created_at_idx" ON "ledger_entries"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
