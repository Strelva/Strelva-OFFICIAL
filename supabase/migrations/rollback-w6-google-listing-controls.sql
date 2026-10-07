begin;
set local lock_timeout = '3s';
create or replace function public.read_business_publishing(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  if v.work_ids is not null then
    return jsonb_build_object('businessId', p_workspace_id, 'scope', 'assigned', 'bindings', '[]'::jsonb, 'receipts', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'scope', 'business',
    'bindings', coalesce((select jsonb_agg(public.account_binding_json(b, false) order by b.created_at, b.id)
      from public.workspace_account_bindings b where b.workspace_id = p_workspace_id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(public.google_listing_receipt_json(r) order by r.created_at desc, r.id)
      from (select * from public.google_listing_receipts where workspace_id = p_workspace_id
        order by created_at desc, id limit v_limit) r), '[]'::jsonb));
end;
$$;


drop function public.set_google_listing_paused(uuid,text,uuid,text,boolean);
drop function public.note_google_listing_access(uuid,text,boolean);
drop function public.read_google_listing_control(uuid,text);
drop function public.google_listing_control_json(public.google_listing_controls);
drop function public.check_google_listing_record_revision(uuid,bigint);
drop table public.google_listing_controls;
commit;
