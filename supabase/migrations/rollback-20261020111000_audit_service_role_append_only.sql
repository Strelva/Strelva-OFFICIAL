-- Forward-only security repair. App recovery retains these ACLs; an older app
-- still appends/reads, and the existing explicit tenant teardown still works.
-- Restoring service-role raw mutation privileges reopens audit tampering.
begin;
do $$ begin
  raise exception 'audit_append_only_security_rollback_refused';
end $$;
rollback;
