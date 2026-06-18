-- Drop the abandoned May-31 key-value stub. The app never connected to Supabase,
-- so nothing reads/writes it; the real schema is in 0001/0002.
drop table if exists reb_json_documents;
