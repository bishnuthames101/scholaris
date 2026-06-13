-- Phase 7 Timetable, Notices, Homework — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subject_teachers', 'timetable_slots', 'substitutions',
    'notices', 'homework', 'homework_submissions'
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

-- notice_reads uses composite PK (notice_id, user_id), no tenant_id column.
-- Access controlled via notice FK — if you can't see the notice, you can't read receipts.
-- Still enable RLS for defense-in-depth via join check.
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS via_notice ON notice_reads;
CREATE POLICY via_notice ON notice_reads
  USING (
    app_is_superadmin()
    OR EXISTS (
      SELECT 1 FROM notices n
      WHERE n.id = notice_id
        AND n.tenant_id = app_tenant_id()
    )
  );
