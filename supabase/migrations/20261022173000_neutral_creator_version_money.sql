-- PREPARED UNRUN. Neutral source/Version money lineage; no commercial terms supplied.
begin;
set local lock_timeout='3s';
-- No historical relation/function is altered. Every generic Version remains a
-- real system_versions row; it is never disguised as an offering installation.
do $canonical_governed_money$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values
 ('public.record_governed_money_configuration(uuid,text,jsonb)','4dca3848341aa93db19ad42c4236eb56','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.read_governed_money_configuration(uuid,uuid,text)','782c1f0df744dc307442b45776907142','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.read_governed_money_preparation(uuid,uuid,text)','069ebd4ec0274185bf97814ea64f6523','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.prepare_governed_collection_terms(uuid,text,jsonb)','d76caf2ab026b72931ce6af8570b7d36','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.register_governed_creator_listing(uuid,text,jsonb)','e67a0cb58c80c3622be80e31bfa98940','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.assert_governed_payout_dispatch(uuid,uuid,text,text,text,text,bigint,text,bigint)','fbe629ed5c9e16e863afd76292c47ee4','v',array['p_payout_id','p_user_id','p_verified_email','p_profile_version','p_recipient','p_charge','p_amount','p_currency','p_available']::text[])) v(signature,source_hash,volatility,arg_names) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=split_part(split_part(expected.signature,'.',2),'(',1))<>1 then raise exception 'neutral_creator_predecessor_drift';end if;
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then raise exception 'neutral_creator_predecessor_drift';end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'neutral_creator_predecessor_acl_drift';end if;
 end loop;
end $canonical_governed_money$;
do $$begin if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=any(array['register_neutral_creator_listing','record_neutral_creator_money','prepare_neutral_version_collection','observe_neutral_creator_settlement','record_neutral_version_settlement','read_neutral_creator_sources','read_neutral_version_money','export_neutral_creator_paid_periods'])) then raise exception 'neutral_creator_signature_already_exists';end if;end $$;
do $new_retained_table$ begin if to_regclass('public.creator_version_paid_periods') is null then
create table public.creator_version_paid_periods (
 line_id text primary key references public.platform_collection_terms(line_id) on delete restrict,
 business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 version_id uuid not null references public.system_versions(id) on delete restrict,
 release_number integer not null check(release_number>0),
 source_system_id uuid not null references public.system_version_sources(system_id) on delete restrict,
 source_revision_id uuid not null references public.system_version_source_revisions(id) on delete restrict,
 listing_id uuid not null references public.creator_listings(id) on delete restrict,
 creator_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 price_version text not null references public.platform_collection_prices(version) on delete restrict,
 period_start timestamptz not null,period_end timestamptz not null check(period_end>period_start),
 maintainer_state text not null check(maintainer_state in('creator','takeover','tapered')),
 agreement_version text,rate_reference text,rate_bps integer check(rate_bps between 0 and 10000),
 payer_kind text not null check(payer_kind in('business','agency')),payer_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 accepted_by uuid not null references public.users(id) on delete restrict,
 accepted_at timestamptz not null,
 check((maintainer_state='takeover' and agreement_version is null and rate_reference is null and rate_bps is null)
  or (maintainer_state in('creator','tapered') and agreement_version is not null and rate_reference is not null and rate_bps is not null)),
 foreign key(version_id,release_number) references public.system_version_releases(version_id,number) on delete restrict
);
alter table public.creator_version_paid_periods enable row level security;
revoke all on public.creator_version_paid_periods from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.creator_version_paid_periods for each row execute function public.money_immutable_guard();
end if;end $new_retained_table$;
-- Retained history is never dropped by the inverse. Reapply admits only this
-- exact previously created shape, under a write-blocking lock before inspection.
create temporary table neutral_creator_period_shape (
 line_id text primary key,
 business_workspace_id uuid not null,
 version_id uuid not null,
 release_number integer not null check(release_number>0),
 source_system_id uuid not null,
 source_revision_id uuid not null,
 listing_id uuid not null,
 creator_workspace_id uuid not null,
 price_version text not null,
 period_start timestamptz not null,period_end timestamptz not null check(period_end>period_start),
 maintainer_state text not null check(maintainer_state in('creator','takeover','tapered')),
 agreement_version text,rate_reference text,rate_bps integer check(rate_bps between 0 and 10000),
 payer_kind text not null check(payer_kind in('business','agency')),payer_workspace_id uuid not null,
 accepted_by uuid not null,
 accepted_at timestamptz not null,
 check((maintainer_state='takeover' and agreement_version is null and rate_reference is null and rate_bps is null)
  or (maintainer_state in('creator','tapered') and agreement_version is not null and rate_reference is not null and rate_bps is not null))
) on commit drop;
do $neutral_retained_shape$
declare t record; actual jsonb; expected jsonb; migrator oid:=(current_user::regrole)::oid;
begin
 lock table public.creator_version_paid_periods in access exclusive mode;
 select * into t from pg_class where oid='public.creator_version_paid_periods'::regclass;
 if t.relowner<>migrator or t.relnamespace<>'public'::regnamespace or t.relkind<>'r' or t.relpersistence<>'p' or not t.relrowsecurity or t.relforcerowsecurity or t.relispartition or t.reloptions is not null or exists(select 1 from pg_policy where polrelid=t.oid) or exists(select 1 from pg_inherits where inhrelid=t.oid or inhparent=t.oid) or exists(select 1 from pg_attribute where attrelid=t.oid and (attisdropped or attacl is not null)) then raise exception 'neutral_creator_retained_table_drift';end if;
 select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) into actual from aclexplode(coalesce(t.relacl,acldefault('r',migrator))) a;
 select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) into expected from aclexplode(acldefault('r',migrator)) a;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_acl_drift';end if;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into actual from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into expected from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='pg_temp.neutral_creator_period_shape'::regclass and a.attnum>0;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_columns_drift';end if;
 select jsonb_agg(jsonb_build_array(c.contype,c.conkey,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,pg_get_expr(c.conbin,c.conrelid)) order by c.contype,pg_get_expr(c.conbin,c.conrelid)) into actual from pg_constraint c where c.conrelid=t.oid and c.contype<>'f';
 select jsonb_agg(jsonb_build_array(c.contype,c.conkey,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,pg_get_expr(c.conbin,c.conrelid)) order by c.contype,pg_get_expr(c.conbin,c.conrelid)) into expected from pg_constraint c where c.conrelid='pg_temp.neutral_creator_period_shape'::regclass;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_constraints_drift';end if;
 select jsonb_agg(jsonb_build_array((select jsonb_agg(a.attname order by k.position) from unnest(c.conkey) with ordinality k(attnum,position) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum),c.confrelid,(select jsonb_agg(a.attname order by k.position) from unnest(c.confkey) with ordinality k(attnum,position) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum),c.confupdtype,c.confdeltype,c.confmatchtype,c.condeferrable,c.condeferred,c.convalidated) order by (select jsonb_agg(a.attname order by k.position)::text from unnest(c.conkey) with ordinality k(attnum,position) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)) into actual from pg_constraint c where c.conrelid=t.oid and c.contype='f';
 select jsonb_agg(jsonb_build_array(column_names,to_regclass(reference_table)::oid,reference_columns,'a','r','s',false,false,true) order by to_jsonb(column_names)::text) into expected from (values (array['line_id']::text[],'public.platform_collection_terms',array['line_id']::text[]),(array['business_workspace_id']::text[],'public.workspaces',array['id']::text[]),(array['version_id']::text[],'public.system_versions',array['id']::text[]),(array['source_system_id']::text[],'public.system_version_sources',array['system_id']::text[]),(array['source_revision_id']::text[],'public.system_version_source_revisions',array['id']::text[]),(array['listing_id']::text[],'public.creator_listings',array['id']::text[]),(array['creator_workspace_id']::text[],'public.workspaces',array['id']::text[]),(array['price_version']::text[],'public.platform_collection_prices',array['version']::text[]),(array['payer_workspace_id']::text[],'public.workspaces',array['id']::text[]),(array['accepted_by']::text[],'public.users',array['id']::text[]),(array['version_id','release_number']::text[],'public.system_version_releases',array['version_id','number']::text[])) v(column_names,reference_table,reference_columns);
 if actual is distinct from expected or (select count(*) from pg_constraint where conrelid=t.oid and contype='f')<>11 then raise exception 'neutral_creator_retained_foreign_keys_drift';end if;
 if (select count(*) from pg_index where indrelid=t.oid)<>1 or not exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam where i.indrelid=t.oid and i.indisprimary and i.indisunique and i.indisvalid and i.indisready and i.indislive and i.indimmediate and i.indkey::text='1' and i.indnkeyatts=1 and i.indnatts=1 and i.indexprs is null and i.indpred is null and c.relowner=migrator and c.reloptions is null and am.amname='btree') then raise exception 'neutral_creator_retained_index_drift';end if;
 select jsonb_build_array(i.indclass::text,i.indcollation::text,i.indoption::text,i.indnullsnotdistinct,i.indcheckxmin) into actual from pg_index i where i.indrelid=t.oid;
 select jsonb_build_array(i.indclass::text,i.indcollation::text,i.indoption::text,i.indnullsnotdistinct,i.indcheckxmin) into expected from pg_index i where i.indrelid='pg_temp.neutral_creator_period_shape'::regclass;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_index_properties_drift';end if;
 if (select count(*) from pg_trigger where tgrelid=t.oid and not tgisinternal)<>1 or not exists(select 1 from pg_trigger where tgrelid=t.oid and not tgisinternal and tgname='money_immutable' and tgfoid='public.money_immutable_guard()'::regprocedure and tgtype=27 and tgenabled='O' and tgnargs=0 and tgargs=''::bytea and tgqual is null and tgconstraint=0) then raise exception 'neutral_creator_retained_trigger_drift';end if;
end $neutral_retained_shape$;
drop table pg_temp.neutral_creator_period_shape;


-- Canonical definition identity is derived from the actual source System.
-- The existing listing writer already accepts qualified customer/agency creators.
create function public.register_neutral_creator_listing(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace uuid:=(p_command->>'workspaceId')::uuid; revision uuid:=(p_command->>'sourceRevisionId')::uuid; r public.system_version_source_revisions; result jsonb;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['agreementVersion','rateReference','sourceRevisionId','workspaceId'] then raise exception 'neutral_creator_invalid';end if;
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 perform 1 from public.workspaces where id=workspace and kind in('agency','customer') for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 perform public.connect_assert_manager(workspace,p_user_id,p_verified_email);
 perform public.system_version_assert_source_manager(workspace,p_user_id,p_verified_email);
 select * into r from public.system_version_source_revisions where id=revision and creator_workspace_id=workspace for share;
 if r.id is null or coalesce(r.definition->>'kind','') not in('internal_app','bundle') then raise exception 'neutral_creator_source_required';end if;
 if not public.lock_system_revision_qualification(r.id) then raise exception 'creator_listing_unqualified';end if;
 perform 1 from public.money_agreements where beneficiary_workspace_id=workspace and kind='creator' and version=p_command->>'agreementVersion' and rate_reference=p_command->>'rateReference' and effective_from<=clock_timestamp() and (effective_until is null or effective_until>clock_timestamp()) for share;
 if not found then raise exception 'approved_creator_agreement_required';end if;
 if public.workspace_exit_completed(workspace) then raise exception 'workspace_exit_future_work_blocked';end if;
 result:=public.register_creator_listing('system-source:'||r.source_system_id::text,r.id,workspace,p_user_id,p_verified_email,p_command->>'agreementVersion',p_command->>'rateReference');
 return jsonb_build_object('id',result->'id','creatorWorkspaceId',workspace,'sourceSystemId',r.source_system_id,'sourceRevisionId',r.id,'definitionId',result->'definition_id','agreementVersion',result->'agreement_version','rateReference',result->'rate_reference');
end $$;

-- Both kinds of creator use the same qualified source and written agreement.
-- Agency referral agreements continue through their independently agency-only port.
create function public.record_neutral_creator_money(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action'; revision uuid:=(p_command->>'sourceRevisionId')::uuid; source public.system_version_source_revisions; agreement public.money_agreements; price public.platform_collection_prices; source_workspace uuid; existed boolean; keys text[];
begin
 perform 1 from public.users u join public.super_admins s on s.user_id=u.id where u.id=p_user_id and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(p_verified_email)) and lower(btrim(s.email))=lower(btrim(p_verified_email)) and s.revoked_at is null for share of u,s;
 if not found then raise exception 'neutral_creator_denied';end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'neutral_creator_invalid';end if;
 select creator_workspace_id into source_workspace from public.system_version_source_revisions where id=revision;
 perform 1 from public.workspaces where id=source_workspace and kind in('agency','customer') for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 select * into source from public.system_version_source_revisions where id=revision and creator_workspace_id=source_workspace for share;
 if source.id is null or coalesce(source.definition->>'kind','') not in('internal_app','bundle') then raise exception 'neutral_creator_source_required';end if;
 if not public.lock_system_revision_qualification(source.id) then raise exception 'creator_listing_unqualified';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if (p_command->>'effectiveFrom')::timestamptz is null or not isfinite((p_command->>'effectiveFrom')::timestamptz) or ((p_command->>'effectiveUntil')::timestamptz is not null and (not isfinite((p_command->>'effectiveUntil')::timestamptz) or (p_command->>'effectiveUntil')::timestamptz<=(p_command->>'effectiveFrom')::timestamptz)) or length(btrim(p_command->>'version')) not between 1 and 200 then raise exception 'neutral_creator_invalid';end if;
 if action='record_creator_agreement' then
  if keys is distinct from array['action','effectiveFrom','effectiveUntil','rateBps','rateReference','sourceRevisionId','version'] or p_command->>'rateBps' !~ '^[0-9]+$' or (p_command->>'rateBps')::integer not between 0 and 10000 or length(btrim(p_command->>'rateReference')) not between 1 and 200 then raise exception 'neutral_creator_invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended('agreement:'||source.creator_workspace_id::text||':creator:'||(p_command->>'version'),8815));
  select * into agreement from public.money_agreements where beneficiary_workspace_id=source.creator_workspace_id and kind='creator' and version=p_command->>'version';existed:=found;
  if not existed then insert into public.money_agreements(beneficiary_workspace_id,kind,version,rate_reference,rate_bps,effective_from,effective_until,approved_by,approved_at) values(source.creator_workspace_id,'creator',p_command->>'version',p_command->>'rateReference',(p_command->>'rateBps')::integer,(p_command->>'effectiveFrom')::timestamptz,(p_command->>'effectiveUntil')::timestamptz,p_user_id,clock_timestamp()) returning * into agreement;end if;
  if agreement.approved_by is distinct from p_user_id or agreement.rate_reference is distinct from p_command->>'rateReference' or agreement.rate_bps is distinct from (p_command->>'rateBps')::integer or agreement.effective_from is distinct from (p_command->>'effectiveFrom')::timestamptz or agreement.effective_until is distinct from (p_command->>'effectiveUntil')::timestamptz then raise exception 'neutral_creator_conflict';end if;
 elsif action='record_source_price' then
  if keys is distinct from array['action','amountCents','currency','effectiveFrom','effectiveUntil','sourceRevisionId','version'] or p_command->>'amountCents' !~ '^[0-9]+$' or (p_command->>'amountCents')::bigint not between 1 and 100000000 or p_command->>'currency' !~ '^[a-z]{3}$' then raise exception 'neutral_creator_invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended('price:'||(p_command->>'version'),8815));
  select * into price from public.platform_collection_prices where version=p_command->>'version';existed:=found;
  if not existed then insert into public.platform_collection_prices(version,amount_cents,currency,definition_id,effective_from,effective_until,approved_by,approved_at) values(p_command->>'version',(p_command->>'amountCents')::bigint,p_command->>'currency','system-source:'||source.source_system_id::text,(p_command->>'effectiveFrom')::timestamptz,(p_command->>'effectiveUntil')::timestamptz,p_user_id,clock_timestamp()) returning * into price;end if;
  if price.approved_by is distinct from p_user_id or price.amount_cents is distinct from (p_command->>'amountCents')::bigint or price.currency is distinct from p_command->>'currency' or price.definition_id is distinct from 'system-source:'||source.source_system_id::text or price.effective_from is distinct from (p_command->>'effectiveFrom')::timestamptz or price.effective_until is distinct from (p_command->>'effectiveUntil')::timestamptz then raise exception 'neutral_creator_conflict';end if;
 else raise exception 'neutral_creator_invalid';end if;
 if public.workspace_exit_completed(source.creator_workspace_id) then raise exception 'workspace_exit_future_work_blocked';end if;
 return jsonb_build_object('action',action,'recordedBy',p_user_id,'replayed',existed,'creatorWorkspaceId',source.creator_workspace_id,'sourceSystemId',source.source_system_id,'definitionId','system-source:'||source.source_system_id::text,'command',p_command);
end $$;

create function public.prepare_neutral_version_collection(p_user_id uuid,p_verified_email text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace uuid:=(p_command->>'workspaceId')::uuid; chosen_version_id uuid:=(p_command->>'versionId')::uuid; line text:=p_command->>'lineId'; start_at timestamptz:=(p_command->>'periodStart')::timestamptz; end_at timestamptz:=(p_command->>'periodEnd')::timestamptz; v public.system_versions; src public.system_version_source_revisions; account public.accounts; billing_account public.accounts; party record; price public.platform_collection_prices; listing public.creator_listings; maintenance public.creator_royalty_terms; agreement public.money_agreements; terms public.platform_collection_terms; paid public.creator_version_paid_periods; state text; chosen_agreement text; chosen_reference text; rate integer;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['amountCents','currency','lineId','periodEnd','periodStart','priceVersion','releaseNumber','versionId','workspaceId'] then raise exception 'neutral_creator_invalid';end if;
 if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at or line::uuid is null then raise exception 'neutral_creator_invalid';end if;
 perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 perform 1 from public.workspaces where id=workspace and kind='customer' for share;
 if not found then raise exception 'neutral_creator_denied';end if;
 perform 1 from public.workspace_memberships where workspace_id=workspace and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'collection_owner_required';end if;
 perform public.system_actor_scope(workspace,p_user_id,p_verified_email,true);
 select * into party from public.business_payer_party(workspace);
 perform 1 from public.workspaces where id=coalesce(party.workspace_id,workspace) and ((party.kind='agency' and kind='agency') or (party.kind='business' and id=workspace)) for share;
 if not found then raise exception 'neutral_creator_payer_required';end if;
 select * into account from public.accounts where workspace_id=workspace and billing_home_kind='business' for share;
 if account.id is null or account.payer_kind is distinct from party.kind or account.payer_workspace_id is distinct from party.workspace_id then raise exception 'neutral_creator_payer_changed';end if;
 select * into billing_account from public.accounts where workspace_id=coalesce(party.workspace_id,workspace) and billing_home_kind=case party.kind when 'agency' then 'agency' else 'business' end for share;
 if billing_account.id is null or billing_account.stripe_customer_id is null then raise exception 'neutral_creator_not_configured';end if;
 select * into v from public.system_versions where id=chosen_version_id and business_workspace_id=workspace for share;
 if v.id is null or v.current_release is null or v.current_release is distinct from (p_command->>'releaseNumber')::integer then raise exception 'neutral_creator_installation_required';end if;
 perform 1 from public.systems where id=v.version_system_id and business_workspace_id=workspace and lifecycle='live' for share;
 if not found or not exists(select 1 from public.system_version_releases where version_id=v.id and number=v.current_release) then raise exception 'neutral_creator_owner_release_required';end if;
 select * into src from public.system_version_source_revisions where id=v.installed_source_revision_id and source_system_id=v.source_system_id and creator_workspace_id=v.creator_workspace_id for share;
 if src.id is null or coalesce(src.definition->>'kind','') not in('internal_app','bundle') then raise exception 'neutral_creator_source_required';end if;
 if not public.lock_system_revision_qualification(src.id) then raise exception 'creator_listing_unqualified';end if;
 select * into listing from public.creator_listings where definition_id='system-source:'||src.source_system_id::text and source_revision_id=src.id and creator_workspace_id=src.creator_workspace_id for share;
 if listing.id is null then raise exception 'neutral_creator_listing_required';end if;
 select * into maintenance from public.creator_royalty_terms where listing_id=listing.id and effective_from<=start_at order by effective_from desc,id desc limit 1;
 if maintenance.id is null then state:=listing.maintainer_state;chosen_agreement:=listing.agreement_version;chosen_reference:=listing.rate_reference;
 else state:=maintenance.maintainer_state;chosen_agreement:=maintenance.agreement_version;chosen_reference:=maintenance.rate_reference;end if;
 if state in('creator','tapered') then
  select a.* into agreement from public.money_agreements a where a.beneficiary_workspace_id=listing.creator_workspace_id and a.kind='creator' and a.version=chosen_agreement and a.rate_reference=chosen_reference and a.effective_from<=start_at and (a.effective_until is null or a.effective_until>=end_at) for share;
  if agreement.id is null then raise exception 'approved_creator_agreement_required';end if;
  perform 1 from public.users u join public.super_admins s on s.user_id=u.id where u.id=agreement.approved_by and u.verified_at is not null and s.revoked_at is null for share of u,s;
  if not found then raise exception 'approved_creator_agreement_required';end if;rate:=agreement.rate_bps;
 elsif state='takeover' then chosen_agreement:=null;chosen_reference:=null;rate:=null;
 else raise exception 'neutral_creator_not_configured';end if;
 select * into price from public.platform_collection_prices where platform_collection_prices.version=p_command->>'priceVersion' and definition_id='system-source:'||src.source_system_id::text;
 if price.version is null then raise exception 'approved_platform_price_required';end if;
 perform 1 from public.users u join public.super_admins s on s.user_id=u.id where u.id=price.approved_by and u.verified_at is not null and s.revoked_at is null for share of u,s;
 if not found then raise exception 'approved_platform_price_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('collection-line:'||line,8815));
 -- All source/owner/reviewer/payer/price identities are held. Current clocks and
 -- lifecycle are checked after the last admission wait; no customer ID from HTTP.
 if public.workspace_exit_completed(workspace) or public.workspace_exit_completed(coalesce(party.workspace_id,workspace)) or price.effective_from>clock_timestamp() or (price.effective_until is not null and price.effective_until<=clock_timestamp()) or price.amount_cents is distinct from (p_command->>'amountCents')::bigint or price.currency is distinct from p_command->>'currency' then raise exception 'neutral_creator_changed';end if;
 insert into public.platform_collection_terms(line_id,business_workspace_id,amount_cents,currency,customer_id,agreement_version,installation_id,accepted_by,accepted_at) values(line,workspace,price.amount_cents,price.currency,billing_account.stripe_customer_id,price.version,null,p_user_id,clock_timestamp()) on conflict do nothing;
 select * into terms from public.platform_collection_terms where line_id=line;
 if terms.business_workspace_id is distinct from workspace or terms.amount_cents is distinct from price.amount_cents or terms.currency is distinct from price.currency or terms.customer_id is distinct from billing_account.stripe_customer_id or terms.agreement_version is distinct from price.version or terms.installation_id is not null or terms.accepted_by is distinct from p_user_id then raise exception 'neutral_creator_conflict';end if;
 perform public.freeze_platform_collection_period(line,p_user_id,p_verified_email,start_at,end_at);
 insert into public.creator_version_paid_periods(line_id,business_workspace_id,version_id,release_number,source_system_id,source_revision_id,listing_id,creator_workspace_id,price_version,period_start,period_end,maintainer_state,agreement_version,rate_reference,rate_bps,payer_kind,payer_workspace_id,accepted_by,accepted_at)
 values(line,workspace,v.id,v.current_release,src.source_system_id,src.id,listing.id,listing.creator_workspace_id,price.version,start_at,end_at,state,chosen_agreement,chosen_reference,rate,party.kind,coalesce(party.workspace_id,workspace),p_user_id,terms.accepted_at) on conflict do nothing;
 select * into paid from public.creator_version_paid_periods where line_id=line;
 if paid.business_workspace_id is distinct from workspace or paid.version_id is distinct from v.id or paid.release_number is distinct from v.current_release or paid.source_system_id is distinct from src.source_system_id or paid.source_revision_id is distinct from src.id or paid.listing_id is distinct from listing.id or paid.creator_workspace_id is distinct from listing.creator_workspace_id or paid.price_version is distinct from price.version or paid.period_start is distinct from start_at or paid.period_end is distinct from end_at or paid.maintainer_state is distinct from state or paid.agreement_version is distinct from chosen_agreement or paid.rate_reference is distinct from chosen_reference or paid.rate_bps is distinct from rate or paid.payer_kind is distinct from party.kind or paid.payer_workspace_id is distinct from coalesce(party.workspace_id,workspace) or paid.accepted_by is distinct from p_user_id then raise exception 'neutral_creator_conflict';end if;
 return to_jsonb(paid)||jsonb_build_object('amountCents',terms.amount_cents,'currency',terms.currency,'collectionDispatch','not_configured');
end $$;

-- Signed provider settlement adapter for frozen generic Version lineage.
-- An agency-paid period uses that agency's customer and wholesale eligibility;
-- legacy offering/general collections retain their exact original writer.
create function public.record_neutral_version_settlement(p_id uuid,p_intent text,p_charge text,p_amount bigint,p_currency text,p_customer text,p_event text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare collection public.platform_collections;paid public.creator_version_paid_periods;terms public.platform_collection_terms;period public.platform_collection_periods;settlement public.platform_collection_settlements;invoice_source public.invoice_split_sources;
begin
 select * into collection from public.platform_collections where id=p_id for update;
 if collection.id is null then raise exception 'collection_settlement_mismatch';end if;
 select * into paid from public.creator_version_paid_periods where line_id=collection.invoice_line_id;
 if paid.line_id is null then return public.record_platform_collection_settlement(p_id,p_intent,p_charge,p_amount,p_currency,p_customer,p_event);end if;
 select * into terms from public.platform_collection_terms where line_id=paid.line_id;
 select * into period from public.platform_collection_periods where line_id=paid.line_id;
 if collection.business_workspace_id is distinct from paid.business_workspace_id or collection.installation_id is not null or collection.amount_cents is distinct from p_amount or collection.currency is distinct from p_currency or collection.customer_id is distinct from p_customer or collection.agreement_version is distinct from paid.price_version or terms.business_workspace_id is distinct from paid.business_workspace_id or terms.amount_cents is distinct from p_amount or terms.currency is distinct from p_currency or terms.customer_id is distinct from p_customer or terms.agreement_version is distinct from paid.price_version or terms.installation_id is not null or terms.accepted_by is distinct from paid.accepted_by or terms.accepted_at is distinct from paid.accepted_at or period.line_id is null or period.period_start is distinct from paid.period_start or period.period_end is distinct from paid.period_end or p_intent is null or p_intent !~ '^pi_[A-Za-z0-9]+$' or p_charge is null or p_charge !~ '^ch_[A-Za-z0-9]+$' then raise exception 'collection_settlement_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform:'||p_charge,8811));
 perform pg_advisory_xact_lock(hashtextextended('platform:'||paid.line_id,8810));
 insert into public.platform_collection_settlements values(collection.id,p_intent,p_charge,p_amount,p_currency,p_event,now()) on conflict do nothing;
 select * into settlement from public.platform_collection_settlements where collection_id=collection.id;
 if settlement.payment_intent_id is distinct from p_intent or settlement.charge_id is distinct from p_charge or settlement.amount_cents is distinct from p_amount or settlement.currency is distinct from p_currency then raise exception 'collection_settlement_conflict';end if;
 -- Accepted-effect observation uses the exact frozen payer and customer; it
 -- does not require today's billing account, membership or wholesale item.
 insert into public.invoice_split_sources(source_account_id,invoice_line_id,charge_id,business_workspace_id,payer_workspace_id,payer_kind,customer_id,subscription_id,subscription_item_id,basis_cents,currency,period_start,period_end)
 values('platform',paid.line_id,p_charge,paid.business_workspace_id,paid.payer_workspace_id,paid.payer_kind,p_customer,null,null,p_amount,p_currency,paid.period_start,paid.period_end) on conflict do nothing;
 select * into invoice_source from public.invoice_split_sources where source_account_id='platform' and invoice_line_id=paid.line_id;
 if invoice_source.charge_id is distinct from p_charge or invoice_source.business_workspace_id is distinct from paid.business_workspace_id or invoice_source.payer_workspace_id is distinct from paid.payer_workspace_id or invoice_source.payer_kind is distinct from paid.payer_kind or invoice_source.customer_id is distinct from p_customer or invoice_source.subscription_id is not null or invoice_source.subscription_item_id is not null or invoice_source.basis_cents is distinct from p_amount or invoice_source.currency is distinct from p_currency or invoice_source.period_start is distinct from paid.period_start or invoice_source.period_end is distinct from paid.period_end then raise exception 'invoice_payer_source_conflict';end if;
 perform public.accrue_invoice_splits(paid.business_workspace_id,paid.line_id,paid.period_start,paid.period_end,'platform',p_charge,p_amount,p_currency,null,null);
 return to_jsonb(settlement);
end $$;

-- Accepted settlement observation deliberately has no current actor gate. The
-- original verified provider observer persists settlement/platform/agency first.
-- Generic creator identity is frozen separately, with no fake offering ID.
create function public.observe_neutral_creator_settlement(p_collection_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare collection public.platform_collections; settlement public.platform_collection_settlements; paid public.creator_version_paid_periods; terms public.platform_collection_terms; period public.platform_collection_periods; split public.revenue_splits; loss public.split_loss_receipts; amount bigint;
begin
 select * into collection from public.platform_collections where id=p_collection_id;
 if collection.id is null then raise exception 'neutral_creator_settlement_required';end if;
 select * into paid from public.creator_version_paid_periods where line_id=collection.invoice_line_id;
 if paid.line_id is null then return null;end if;
 select * into settlement from public.platform_collection_settlements where collection_id=collection.id;
 select * into terms from public.platform_collection_terms where line_id=paid.line_id;
 select * into period from public.platform_collection_periods where line_id=paid.line_id;
 if settlement.collection_id is null or settlement.amount_cents is distinct from collection.amount_cents or settlement.currency is distinct from collection.currency or settlement.charge_id !~ '^ch_[A-Za-z0-9]+$' or settlement.payment_intent_id !~ '^pi_[A-Za-z0-9]+$' or terms.business_workspace_id is distinct from paid.business_workspace_id or terms.accepted_by is distinct from paid.accepted_by or terms.accepted_at is distinct from paid.accepted_at or collection.business_workspace_id is distinct from paid.business_workspace_id or collection.installation_id is not null or terms.installation_id is not null or collection.customer_id is distinct from terms.customer_id or collection.agreement_version is distinct from paid.price_version or terms.agreement_version is distinct from paid.price_version or terms.amount_cents is distinct from settlement.amount_cents or terms.currency is distinct from settlement.currency or period.period_start is distinct from paid.period_start or period.period_end is distinct from paid.period_end then raise exception 'neutral_creator_settlement_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform:'||settlement.charge_id,8811));
 perform pg_advisory_xact_lock(hashtextextended('platform:'||paid.line_id,8810));
 -- Do not insert before the inherited any-row replay branch: both platform and
 -- agency accrual/attribution must already have persisted from signed settlement.
 if not exists(select 1 from public.revenue_splits where source_account_id='platform' and invoice_line_id=paid.line_id and beneficiary_kind='platform' and event_key='accrual' and source_charge_id=settlement.charge_id and basis_cents=settlement.amount_cents and currency=settlement.currency and period_start=paid.period_start and period_end=paid.period_end) then raise exception 'neutral_creator_original_accrual_required';end if;
 amount:=case when paid.maintainer_state='takeover' then 0 else floor(settlement.amount_cents::numeric*paid.rate_bps/10000)::bigint end;
 select * into split from public.revenue_splits where source_account_id='platform' and invoice_line_id=paid.line_id and beneficiary_kind='creator' and event_key='accrual';
 if split.id is null then
  if (select coalesce(sum(amount_cents),0) from public.revenue_splits where source_account_id='platform' and invoice_line_id=paid.line_id and event_key='accrual')+amount>settlement.amount_cents then raise exception 'split_basis_overallocated';end if;
  insert into public.revenue_splits(business_workspace_id,beneficiary_workspace_id,beneficiary_kind,invoice_line_id,period_start,period_end,source_account_id,source_charge_id,basis_cents,amount_cents,agreement_version,rate_reference,rate_bps,attribution_id,source_revision_id,installation_id,maintainer_state,event_key,currency)
  values(paid.business_workspace_id,paid.creator_workspace_id,'creator',paid.line_id,paid.period_start,paid.period_end,'platform',settlement.charge_id,settlement.amount_cents,amount,paid.agreement_version,paid.rate_reference,paid.rate_bps,null,paid.source_revision_id,null,paid.maintainer_state,'accrual',settlement.currency) returning * into split;
 end if;
 if split.business_workspace_id is distinct from paid.business_workspace_id or split.beneficiary_workspace_id is distinct from paid.creator_workspace_id or split.source_charge_id is distinct from settlement.charge_id or split.basis_cents is distinct from settlement.amount_cents or split.amount_cents is distinct from amount or split.currency is distinct from settlement.currency or split.period_start is distinct from paid.period_start or split.period_end is distinct from paid.period_end or split.agreement_version is distinct from paid.agreement_version or split.rate_reference is distinct from paid.rate_reference or split.rate_bps is distinct from paid.rate_bps or split.source_revision_id is distinct from paid.source_revision_id or split.installation_id is not null or split.maintainer_state is distinct from paid.maintainer_state then raise exception 'split_idempotency_conflict';end if;
 -- A loss may have been observed before this accepted creator receipt. Preserve
 -- the same cumulative-loss core used by the original late-accrual replay path.
 select * into loss from public.split_loss_receipts where source_account_id='platform' and charge_id=settlement.charge_id order by created_at desc,event_key desc limit 1;
 if found then perform public.reconcile_split_loss_before_receipt('platform',settlement.charge_id,loss.event_key,loss.loss_cents,loss.charge_basis);end if;
 return jsonb_build_object('versionId',paid.version_id,'sourceSystemId',paid.source_system_id,'sourceRevisionId',paid.source_revision_id,'listingId',paid.listing_id,'creatorWorkspaceId',paid.creator_workspace_id,'lineId',paid.line_id,'split',to_jsonb(split));
end $$;

create function public.read_neutral_creator_sources(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare sources jsonb; agreements jsonb;
begin
 perform public.connect_assert_reader(p_workspace_id,p_user_id,p_verified_email);
 select coalesce(jsonb_agg(jsonb_build_object('sourceSystemId',r.source_system_id,'sourceRevisionId',r.id,'creatorWorkspaceId',r.creator_workspace_id,'definitionId','system-source:'||r.source_system_id::text,'name',s.name,'revision',r.number,'qualified',public.system_revision_is_qualified(r.id),'listingId',l.id,'listingAgreementVersion',l.agreement_version,'listingRateReference',l.rate_reference) order by s.name,r.number),'[]'::jsonb) into sources from public.system_version_source_revisions r join public.systems s on s.id=r.source_system_id and s.business_workspace_id=p_workspace_id left join public.creator_listings l on l.definition_id='system-source:'||r.source_system_id::text and l.source_revision_id=r.id and l.creator_workspace_id=r.creator_workspace_id where r.creator_workspace_id=p_workspace_id and r.definition->>'kind' in('internal_app','bundle');
 select coalesce(jsonb_agg(jsonb_build_object('version',a.version,'rateReference',a.rate_reference,'rateBps',a.rate_bps,'effectiveFrom',a.effective_from,'effectiveUntil',a.effective_until) order by a.effective_from,a.id),'[]'::jsonb) into agreements from public.money_agreements a where a.kind='creator' and a.beneficiary_workspace_id=p_workspace_id;
 return jsonb_build_object('workspaceId',p_workspace_id,'canRegister',not public.workspace_exit_completed(p_workspace_id),'sources',sources,'agreements',agreements);
end $$;

create function public.read_neutral_version_money(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare installations jsonb; prices jsonb; history jsonb; account public.accounts; party record; can_prepare boolean;
begin
 perform public.connect_assert_reader(p_workspace_id,p_user_id,p_verified_email);
 if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then raise exception 'neutral_creator_denied';end if;
 select * into party from public.business_payer_party(p_workspace_id);
 select * into account from public.accounts where workspace_id=coalesce(party.workspace_id,p_workspace_id) and billing_home_kind=case party.kind when 'agency' then 'agency' else 'business' end;
 select not public.workspace_exit_completed(p_workspace_id) and exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') into can_prepare;
 select coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'releaseNumber',v.current_release,'name',s.name,'sourceSystemId',r.source_system_id,'sourceRevisionId',r.id,'creatorWorkspaceId',r.creator_workspace_id,'definitionId',l.definition_id,'listingId',l.id,'qualified',public.system_revision_is_qualified(r.id),'released',v.current_release is not null and s.lifecycle='live') order by s.name,v.id),'[]'::jsonb) into installations from public.system_versions v join public.systems s on s.id=v.version_system_id and s.business_workspace_id=v.business_workspace_id join public.system_version_source_revisions r on r.id=v.installed_source_revision_id and r.source_system_id=v.source_system_id and r.creator_workspace_id=v.creator_workspace_id join public.creator_listings l on l.definition_id='system-source:'||r.source_system_id::text and l.source_revision_id=r.id and l.creator_workspace_id=r.creator_workspace_id where v.business_workspace_id=p_workspace_id;
 select coalesce(jsonb_agg(jsonb_build_object('version',p.version,'amountCents',p.amount_cents,'currency',p.currency,'definitionId',p.definition_id,'effectiveFrom',p.effective_from,'effectiveUntil',p.effective_until) order by p.version),'[]'::jsonb) into prices from public.platform_collection_prices p join public.users u on u.id=p.approved_by and u.verified_at is not null join public.super_admins o on o.user_id=u.id and o.revoked_at is null where p.effective_from<=now() and (p.effective_until is null or p.effective_until>now()) and exists(select 1 from public.system_versions v join public.creator_listings l on l.source_revision_id=v.installed_source_revision_id and l.creator_workspace_id=v.creator_workspace_id where v.business_workspace_id=p_workspace_id and l.definition_id=p.definition_id);
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('amountCents',t.amount_cents,'currency',t.currency,'collectionDispatch','not_configured') order by p.accepted_at,p.line_id),'[]'::jsonb) into history from public.creator_version_paid_periods p join public.platform_collection_terms t on t.line_id=p.line_id where p.business_workspace_id=p_workspace_id;
 return jsonb_build_object('workspaceId',p_workspace_id,'canPrepare',can_prepare,'customerConfigured',account.stripe_customer_id is not null,'payerKind',party.kind,'payerWorkspaceId',coalesce(party.workspace_id,p_workspace_id),'installations',installations,'prices',prices,'history',history,'collectionDispatch','not_configured');
end $$;

-- Portability uses the same current owner/operator authority as schema 3.
-- Never include a creator's other customers or any private source definition.
create function public.export_neutral_creator_paid_periods(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_category text,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare items jsonb;off integer:=greatest(coalesce(p_offset,0),0);lim integer:=least(greatest(coalesce(p_limit,1000),1),1000);
begin
 perform public.workspace_export_v3_read_role(p_workspace_id,p_user_id,p_verified_email);
 if p_category is distinct from 'creator_version_paid_periods' then raise exception 'workspace_export_invalid';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.accepted_at,r.line_id),'[]'::jsonb) into items from (select * from public.creator_version_paid_periods where business_workspace_id=p_workspace_id order by accepted_at,line_id offset off limit lim) r;
 return jsonb_build_object('items',items,'next',case when jsonb_array_length(items)=lim then off+lim else null end);
end $$;

-- All new supplied-actor ports are service-only; pure readers stay STABLE and
-- work under READ ONLY. No prior function/table ACL or historical body changes.
do $$declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('register_neutral_creator_listing','record_neutral_creator_money','prepare_neutral_version_collection','observe_neutral_creator_settlement','record_neutral_version_settlement','read_neutral_creator_sources','read_neutral_version_money','export_neutral_creator_paid_periods') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
end loop;end $$;
-- Abort before commit if unrelated default privileges survived the named-role
-- revocations. This exact guard is shared with inverse and native catalog proof.
do $neutral_ports$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values
 ('public.register_neutral_creator_listing(uuid,text,jsonb)','65070ed346aaff39df0c08a56c1afe2f','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.record_neutral_creator_money(uuid,text,jsonb)','3a7b15696eff0a4a27353f76934fc8e7','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.prepare_neutral_version_collection(uuid,text,jsonb)','ff5607bb4d9294b5593bb739920f0834','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.record_neutral_version_settlement(uuid,text,text,bigint,text,text,text)','8eda917902cc18f02a513c07fca79310','v',array['p_id','p_intent','p_charge','p_amount','p_currency','p_customer','p_event']::text[]),
 ('public.observe_neutral_creator_settlement(uuid)','f37e8e9bc019457c524a64563bbf8080','v',array['p_collection_id']::text[]),
 ('public.read_neutral_creator_sources(uuid,uuid,text)','f6593f4fd3185132455ff80b1dce4782','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.read_neutral_version_money(uuid,uuid,text)','3362aa67202ab16ca912791c8fdc36a7','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.export_neutral_creator_paid_periods(uuid,uuid,text,text,integer,integer)','9dc9eb68ec4e61a1f0942f516b3c2d9d','s',array['p_workspace_id','p_user_id','p_verified_email','p_category','p_offset','p_limit']::text[])) v(signature,source_hash,volatility,arg_names) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=split_part(split_part(expected.signature,'.',2),'(',1))<>1 then raise exception 'neutral_creator_catalog_drift';end if;
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then raise exception 'neutral_creator_catalog_drift';end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'neutral_creator_acl_drift';end if;
 end loop;
end $neutral_ports$;
notify pgrst,'reload schema';
commit;
