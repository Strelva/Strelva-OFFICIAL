-- Revert the application wrapper call alongside this inverse. Preserve all
-- businesses, seats, initial release rows and immutable history.
set local lock_timeout = '3s';
drop function public.agency_add_client_enrolled(uuid, text, uuid, jsonb, uuid, text, boolean);
