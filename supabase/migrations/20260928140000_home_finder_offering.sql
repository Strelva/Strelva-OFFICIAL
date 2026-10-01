-- IDX Home Finder is a declared offering (ADR 0010) that is not qualified.
-- Local-only and additive. Applying this migration requires separate authority.
--
-- This makes the complete set of offering native resource kinds durable,
-- including `home_finder_installation`: the Home Finder runtime's own
-- installation id, the same identity the Customers module maps in
-- customer_resources.resource_reference. It is a reference, not a copied record.
--
-- It deliberately does not make Home Finder installable. The install helper
-- offering_assert_install_payload still admits only the three qualified
-- definitions and raises offering_definition_not_installable for `home_finder`.
-- Admitting it requires a later migration after its brokerage, inventory-rights,
-- inquiry-delivery and handoff gates are met and the definition is qualified.

alter table public.offering_installations
  add constraint offering_installations_native_resource_kinds_check
  check (
    jsonb_typeof(native_resources) = 'array'
    and not jsonb_path_exists(
      native_resources,
      '$[*] ? (!(@.kind == "application" || @.kind == "inquiry_workspace" || @.kind == "managed_website" || @.kind == "home_finder_installation"))'
    )
    and not jsonb_path_exists(
      native_resources,
      '$[*] ? (@.kind == "home_finder_installation" && !(@.id like_regex "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$"))'
    )
  );

comment on constraint offering_installations_native_resource_kinds_check on public.offering_installations is
  'Offering native resources are exact references of a declared kind. home_finder_installation is declared but not installable.';
