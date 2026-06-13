-- Phase 5 Communication hub — tenant isolation policies.
-- Apply with: npm run db:rls

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notification_templates', 'notifications', 'message_credits',
    'credit_transactions', 'contact_groups', 'contact_group_members'
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

-- credit_transactions is append-only (like ledger_entries) — no updates or deletes.
DROP POLICY IF EXISTS no_update ON credit_transactions;
CREATE POLICY no_update ON credit_transactions AS RESTRICTIVE FOR UPDATE USING (false);
DROP POLICY IF EXISTS no_delete ON credit_transactions;
CREATE POLICY no_delete ON credit_transactions AS RESTRICTIVE FOR DELETE USING (false);

-- notifications: no hard deletes (delivery audit trail).
DROP POLICY IF EXISTS no_delete ON notifications;
CREATE POLICY no_delete ON notifications AS RESTRICTIVE FOR DELETE USING (false);
