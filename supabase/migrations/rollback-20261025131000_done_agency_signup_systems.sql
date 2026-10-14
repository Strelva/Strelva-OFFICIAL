-- Revert application code alongside this inverse. Retain all enrolled agencies,
-- release rows and immutable history; removing the signup function loses no data.
set local lock_timeout = '3s';
drop function public.create_agency_workspace(uuid, text, text, boolean);
