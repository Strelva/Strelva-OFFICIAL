-- Rollback for 20261008110000_ask_conversations.sql
-- Forward SHA-256: daa05fc3df7936557b5dd2346d420c056f4f278990ba6981b31e76d499b8c47d
-- Batch 5: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.ask_history_actor_role(uuid,uuid,text)')))) is distinct from '0a42a433768e0ee93976d75846a86c28' then raise exception 'rollback_wrong_order_or_function_drift: ask_history_actor_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_ask_conversation(uuid,uuid,text,uuid,integer)')))) is distinct from 'a9bd2c7aab95ecdf9a532e4218a0f4db' then raise exception 'rollback_wrong_order_or_function_drift: read_ask_conversation'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_ask_conversations(uuid,uuid,text,uuid,integer)')))) is distinct from 'b6c6328283bda1b3cb53fb2cddda30ee' then raise exception 'rollback_wrong_order_or_function_drift: list_ask_conversations'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.append_ask_message(uuid,uuid,text,uuid,uuid,text,text,jsonb,text)')))) is distinct from '52170d74cf6cdbe18b2fa54afbff4020' then raise exception 'rollback_wrong_order_or_function_drift: append_ask_message'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.ask_messages') and attnum>0 and not attisdropped) <> 10 then raise exception 'rollback_wrong_order_or_table_drift: ask_messages'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.ask_conversations') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: ask_conversations'; end if;
end;
$rollback_guard$;
lock table public."ask_conversations", public."ask_messages" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008110000_ask_conversations" as table public."ask_conversations";
revoke all on release_rollback_archive."m20261008110000_ask_conversations" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008110000_ask_messages" as table public."ask_messages";
revoke all on release_rollback_archive."m20261008110000_ask_messages" from public, anon, authenticated, service_role;
alter table public."ask_messages" drop constraint "ask_messages_check";
alter table public."ask_messages" drop constraint "ask_messages_seq_check";
alter table public."ask_messages" drop constraint "ask_messages_role_check";
alter table public."ask_messages" drop constraint "ask_messages_result_check";
alter table public."ask_messages" drop constraint "ask_messages_content_check";
alter table public."ask_conversations" drop constraint "ask_conversations_title_check";
alter table public."ask_messages" drop constraint "ask_messages_asked_on_behalf_check";
alter table public."ask_conversations" drop constraint "ask_conversations_message_count_check";
drop function public.ask_history_actor_role(uuid,uuid,text);
drop function public.read_ask_conversation(uuid,uuid,text,uuid,integer);
drop function public.list_ask_conversations(uuid,uuid,text,uuid,integer);
drop function public.append_ask_message(uuid,uuid,text,uuid,uuid,text,text,jsonb,text);
drop table public."ask_conversations", public."ask_messages";
commit;
