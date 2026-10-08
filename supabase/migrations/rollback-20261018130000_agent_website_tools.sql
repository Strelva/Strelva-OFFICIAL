do $$ begin if exists(select 1 from public.assistant_website_proposals) then raise exception 'agent_website_rollback_requires_data_preservation'; end if; end $$;
drop function public.commit_agent_website_candidate(text,text,uuid,uuid,uuid,text,text,integer,integer,text,text,jsonb,jsonb);
drop function public.list_agent_website_proposals(text,text,uuid,uuid);
drop function public.read_agent_website_proposal_retry(text,text,uuid,uuid,text);
drop function public.read_agent_website_work(text,text,uuid,uuid,text);
drop function public.list_agent_websites(text,text,uuid);
drop function public.agent_website_proposal_receipt(public.assistant_website_proposals);
drop table public.assistant_website_proposals;
