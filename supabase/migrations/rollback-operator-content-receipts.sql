-- Existing accepted receipts and content are retained. Turn the release flag
-- off before rollback; removing this RPC never undoes an accepted publication.
set lock_timeout = '3s';
drop function if exists public.write_operator_content(text,text,jsonb);
