-- Rolling back removes the function and triggers only. It never undoes
-- publications the function already accepted.
set lock_timeout = '3s';
drop function if exists public.publish_site_drafts(text,jsonb,jsonb,text,boolean);
drop trigger if exists content_touch_updated_at on public.content;
drop trigger if exists page_config_touch_updated_at on public.page_config;
drop function if exists public.touch_content_updated_at();
