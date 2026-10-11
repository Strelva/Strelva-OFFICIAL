-- Rollback for 20261007155000_make_real_activations.sql
-- Forward SHA-256: 67d26b31d9a1eb11c651011ba894094ae9047ed07933fa0cab72b96c358eaf8f
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.guard_make_real_activation_write()')))) is distinct from '4d6fb95ef52e62c77bca72a991ba7b97' then raise exception 'rollback_wrong_order_or_function_drift: guard_make_real_activation_write'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.make_real_activation_is_time(jsonb)')))) is distinct from '8ac26be63dcbbb023677fee877cf965b' then raise exception 'rollback_wrong_order_or_function_drift: make_real_activation_is_time'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.make_real_activation_is_count(jsonb)')))) is distinct from '9d3ccbbded216022bb856a60b11049c1' then raise exception 'rollback_wrong_order_or_function_drift: make_real_activation_is_count'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.make_real_activation_step_frame(jsonb)')))) is distinct from '512127877754dc87c7de011b6a1ec7bb' then raise exception 'rollback_wrong_order_or_function_drift: make_real_activation_step_frame'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.make_real_activation_set_writer(boolean)')))) is distinct from 'a707f58babd89b5fa69f2ef68fdf0f0b' then raise exception 'rollback_wrong_order_or_function_drift: make_real_activation_set_writer'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.make_real_activation_shape_valid(jsonb,uuid)')))) is distinct from '45cc547ec6031673193f2569af2e322d' then raise exception 'rollback_wrong_order_or_function_drift: make_real_activation_shape_valid'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_make_real_activation(uuid,uuid,text,text)')))) is distinct from '92facdf2ace1e1993c3f6387b3537c7c' then raise exception 'rollback_wrong_order_or_function_drift: read_make_real_activation'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.create_make_real_activation(uuid,uuid,text,jsonb)')))) is distinct from 'f808db68df6805a66d6293759f2c3ce9' then raise exception 'rollback_wrong_order_or_function_drift: create_make_real_activation'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.make_real_activation_actor(uuid,uuid,text,boolean)')))) is distinct from '03dd0b07d2ee8ac59793f275f2d434a6' then raise exception 'rollback_wrong_order_or_function_drift: make_real_activation_actor'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb)')))) is distinct from 'a2fdfda5f8beb5c32424b8a3796b75c0' then raise exception 'rollback_wrong_order_or_function_drift: save_make_real_activation'; end if;
end;
$rollback_guard$;
drop trigger "saved_product_work_make_real_activation_guard_trg" on public."saved_product_work";
drop index public."saved_product_work_make_real_activation_idx";
drop function public.guard_make_real_activation_write();
drop function public.make_real_activation_is_time(jsonb);
drop function public.make_real_activation_is_count(jsonb);
drop function public.make_real_activation_step_frame(jsonb);
drop function public.make_real_activation_set_writer(boolean);
drop function public.make_real_activation_shape_valid(jsonb,uuid);
drop function public.read_make_real_activation(uuid,uuid,text,text);
drop function public.create_make_real_activation(uuid,uuid,text,jsonb);
drop function public.make_real_activation_actor(uuid,uuid,text,boolean);
drop function public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb);
commit;
