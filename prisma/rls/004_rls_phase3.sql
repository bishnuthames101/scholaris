-- Phase 3 Fees & finance tables — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fee_heads', 'fee_structures', 'student_discounts', 'doc_counters',
    'invoices', 'invoice_items', 'payments', 'ledger_entries'
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

-- ledger_entries is the immutable IRD/CBMS boundary: append-only, ever.
DROP POLICY IF EXISTS no_update ON ledger_entries;
CREATE POLICY no_update ON ledger_entries AS RESTRICTIVE FOR UPDATE USING (false);
DROP POLICY IF EXISTS no_delete ON ledger_entries;
CREATE POLICY no_delete ON ledger_entries AS RESTRICTIVE FOR DELETE USING (false);

-- invoices / invoice_items / payments: corrections are status changes (void/
-- cancel) plus reversing ledger entries — never hard deletes.
DROP POLICY IF EXISTS no_delete ON invoices;
CREATE POLICY no_delete ON invoices AS RESTRICTIVE FOR DELETE USING (false);
DROP POLICY IF EXISTS no_delete ON invoice_items;
CREATE POLICY no_delete ON invoice_items AS RESTRICTIVE FOR DELETE USING (false);
DROP POLICY IF EXISTS no_delete ON payments;
CREATE POLICY no_delete ON payments AS RESTRICTIVE FOR DELETE USING (false);
