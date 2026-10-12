-- Removed provider content is not recoverable; reverting reopens indefinite cache.
do $$ begin raise exception 'google_review_content_retention_forward_only';end $$;
