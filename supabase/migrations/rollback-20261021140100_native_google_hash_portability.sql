-- Forward-only: restoring extension-dependent hashing would reintroduce the
-- confirmed focused-schema failure and uncertain production search path.
do $$ begin raise exception 'native_google_hash_portability_forward_only'; end $$;
