-- Phase 2 Attendance + RFID tables — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_records', 'rfid_devices', 'rfid_events',
    'domain_events', 'absence_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (app_is_superadmin() OR tenant_id = app_tenant_id())
         WITH CHECK (app_is_superadmin() OR tenant_id = app_tenant_id())', t);
  END LOOP;
END $$;

-- rfid_events is append-only: forbid UPDATE except resolution fields, forbid DELETE.
-- (Resolution sets student_id/processed_at right after insert; we allow UPDATE via
-- the tenant policy above but block DELETE outright.)
DROP POLICY IF EXISTS no_delete ON rfid_events;
CREATE POLICY no_delete ON rfid_events AS RESTRICTIVE FOR DELETE USING (false);

-- domain_events: no DELETE (outbox is append + mark-processed only).
DROP POLICY IF EXISTS no_delete ON domain_events;
CREATE POLICY no_delete ON domain_events AS RESTRICTIVE FOR DELETE USING (false);
