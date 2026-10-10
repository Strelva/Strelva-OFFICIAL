-- Exact raw state contract reused from fresh346-plan/capture-db-owner-settings.py.
-- READ ONLY. No mutable datfrozenxid/datminmxid is part of static metadata.
select jsonb_build_object(
 'systemIdentifier',(select system_identifier::text from pg_control_system()),
 'database',to_jsonb(d)-'datfrozenxid'-'datminmxid',
 'ownerName',pg_get_userbyid(d.datdba),
 'settings',coalesce((select jsonb_agg(jsonb_build_object(
   'databaseOid',s.setdatabase,'roleOid',s.setrole,
   'roleName',case when s.setrole=0 then null else pg_get_userbyid(s.setrole) end,
   'config',s.setconfig) order by s.setdatabase,s.setrole)
   from pg_db_role_setting s where s.setdatabase in (0,d.oid)), '[]'::jsonb))
from pg_database d where d.datname=current_database();
