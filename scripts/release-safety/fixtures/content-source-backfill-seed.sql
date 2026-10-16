-- Fictional rows for rehearsing 20261027120100_site_content_source_backfill on a
-- restored schema-only copy. Never run against a hosted database. The three
-- real tenant ids are reused only so the backfill's WHERE clause matches; every
-- other value is invented.
insert into public.tenants (id, site_name, custom_repo) values
  ('gldf',            'Fixture Site A', null),                                        -- null custom_repo
  ('rohlax',          'Fixture Site B', '{"repo":"fixture/site-b"}'::jsonb),          -- object, no contentSource
  ('rhm-innovations', 'Fixture Site C', '{"contentSource":"","note":"x"}'::jsonb),    -- empty contentSource
  ('fixture-declared','Fixture Site D', '{"contentSource":"repo"}'::jsonb),           -- not in the list
  ('fixture-other',   'Fixture Site E', '{}'::jsonb);                                 -- not in the list
