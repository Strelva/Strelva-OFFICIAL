-- Apply only as an explicitly authorized rollback, never automatically.
set local lock_timeout = '3s';
drop function if exists public.claim_pending_business_owner(uuid,text,text);
-- Memberships already granted by accepted invitations remain valid.
