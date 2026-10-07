-- Only after disabling publishing. Newsletter approvals/issued words must be
-- exported before removing this local feature; rollback is not automatic.
begin;
set local lock_timeout = '2s';
drop function if exists public.read_workspace_collection_receipts(uuid,text,uuid);
drop function if exists public.publish_workspace_collection(jsonb);
drop function if exists public.read_workspace_newsletter_issues(uuid,text);
drop function if exists public.approve_workspace_newsletter_issue(jsonb);
drop function if exists public.publishing_require_tenant(uuid,text);
drop table if exists public.workspace_newsletter_issues;
drop function if exists public.workspace_newsletter_issue_immutable();
commit;
