-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'late', 'leave');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('manual', 'rfid', 'system');

-- CreateEnum
CREATE TYPE "RfidDeviceLocation" AS ENUM ('gate', 'classroom', 'bus');

-- CreateEnum
CREATE TYPE "RfidDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "AbsenceRunStatus" AS ENUM ('completed', 'held', 'skipped');

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "section_id" BIGINT,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "first_tap_at" TIMESTAMP(3),
    "last_tap_at" TIMESTAMP(3),
    "marked_by" TEXT,
    "note" TEXT,
    "absent_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfid_devices" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "device_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" "RfidDeviceLocation" NOT NULL DEFAULT 'gate',
    "secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_reported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rfid_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfid_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "device_id" BIGINT NOT NULL,
    "rfid_uid" TEXT NOT NULL,
    "tapped_at" TIMESTAMP(3) NOT NULL,
    "direction" "RfidDirection",
    "sync_batch_id" TEXT,
    "student_id" BIGINT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfid_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_runs" (
    "id" BIGSERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AbsenceRunStatus" NOT NULL,
    "held_reason" TEXT,
    "absent_count" INTEGER NOT NULL DEFAULT 0,
    "present_count" INTEGER NOT NULL DEFAULT 0,
    "events_emitted" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "ran_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_public_id_key" ON "attendance_records"("public_id");

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_date_idx" ON "attendance_records"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_section_id_date_idx" ON "attendance_records"("tenant_id", "section_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenant_id_student_id_date_key" ON "attendance_records"("tenant_id", "student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_devices_public_id_key" ON "rfid_devices"("public_id");

-- CreateIndex
CREATE INDEX "rfid_devices_tenant_id_idx" ON "rfid_devices"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_devices_tenant_id_device_id_key" ON "rfid_devices"("tenant_id", "device_id");

-- CreateIndex
CREATE INDEX "rfid_events_tenant_id_tapped_at_idx" ON "rfid_events"("tenant_id", "tapped_at");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_events_device_id_rfid_uid_tapped_at_key" ON "rfid_events"("device_id", "rfid_uid", "tapped_at");

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_public_id_key" ON "domain_events"("public_id");

-- CreateIndex
CREATE INDEX "domain_events_tenant_id_type_created_at_idx" ON "domain_events"("tenant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "domain_events_processed_at_idx" ON "domain_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "absence_runs_public_id_key" ON "absence_runs"("public_id");

-- CreateIndex
CREATE INDEX "absence_runs_tenant_id_date_created_at_idx" ON "absence_runs"("tenant_id", "date", "created_at");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_events" ADD CONSTRAINT "rfid_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "rfid_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
