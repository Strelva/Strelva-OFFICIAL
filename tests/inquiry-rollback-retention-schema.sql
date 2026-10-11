\set ON_ERROR_STOP on
do $$
declare snapshot record; actual jsonb;
begin
  for snapshot in select * from public.inquiry_rollback_snapshots loop
    if to_regclass('public.'||snapshot.table_name) is null then
      raise exception 'rollback removed evidence table: %',snapshot.table_name;
    end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',snapshot.table_name) into actual;
    if actual is distinct from snapshot.rows then
      raise exception 'rollback changed evidence rows: %',snapshot.table_name;
    end if;
  end loop;
end $$;
