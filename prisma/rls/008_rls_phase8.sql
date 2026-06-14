-- Phase 8 Library, Transport, HR, Admissions — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'library_books', 'library_issues',
    'transport_routes', 'transport_stops', 'transport_assignments',
    'staff_attendance', 'leave_requests', 'salary_structures', 'payrolls', 'payroll_slips',
    'enquiries', 'enquiry_follow_ups', 'admission_applications'
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
