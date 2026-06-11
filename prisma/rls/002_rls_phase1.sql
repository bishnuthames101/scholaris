-- Phase 1 SIS tables — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_years', 'classes', 'sections', 'subjects',
    'students', 'guardians', 'staff', 'enrollments'
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

-- student_guardians: join table without tenant_id — scope via students.
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON student_guardians;
CREATE POLICY tenant_isolation ON student_guardians
  USING (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM students s WHERE s.id = student_id AND s.tenant_id = app_tenant_id()))
  WITH CHECK (app_is_superadmin() OR EXISTS (
    SELECT 1 FROM students s WHERE s.id = student_id AND s.tenant_id = app_tenant_id()));
