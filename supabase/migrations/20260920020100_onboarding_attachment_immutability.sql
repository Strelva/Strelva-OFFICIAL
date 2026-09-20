-- Onboarding uploads are evidence records. Their saved document payload and
-- provenance cannot be edited through the generic document write boundary.
create function public.prevent_onboarding_attachment_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.product_id = 'documents'
    and old.resource_kind = 'document'
    and old.input->>'source' = 'onboarding_upload'
    and (
      new.payload is distinct from old.payload
      or new.title is distinct from old.title
      or new.input is distinct from old.input
    ) then
    raise exception 'onboarding_attachment_immutable';
  end if;
  return new;
end
$$;

revoke all on function public.prevent_onboarding_attachment_mutation() from public, anon, authenticated;

create trigger saved_product_work_onboarding_attachment_immutable
before update on public.saved_product_work
for each row execute function public.prevent_onboarding_attachment_mutation();
