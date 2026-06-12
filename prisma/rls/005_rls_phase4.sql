-- Phase 4 Exams & grading tables — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'grade_scales', 'grade_bands', 'exams', 'exam_subjects', 'marks', 'exam_results'
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

-- Marks are never hard-deleted once entered; corrections are updates which
-- are audit-logged at the application layer (publish locks them there too).
DROP POLICY IF EXISTS no_delete ON marks;
CREATE POLICY no_delete ON marks AS RESTRICTIVE FOR DELETE USING (false);
