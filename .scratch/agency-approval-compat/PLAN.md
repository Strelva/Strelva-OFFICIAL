# Approval continuity preparation

Base: deployed source `954f19057344dbf0cc9c10b04506071750a19c50`.

Prepare only. No production migration, deployment, conversion, email or provider action.

1. Add a read-only review authority RPC and permanent tenant authority epochs. Trust, owner membership, verified identity and link transitions rotate the epoch; legacy revocation is permanent. Preserve existing tables/functions.
2. Add a recipient/workspace/epoch-bound review token. Retain old tenant tokens only for the unchanged original conversion recipient before ownership acceptance.
3. Use the same eligibility reader in approval GET/POST and review email. Constrain converted compatibility to review-reply events and recheck claimed execution.
4. Verify focused token/route/mail/failure tests, native SQL predicates and typecheck. Request independent security review.

Deployment blocker: a read-only RPC cannot hold ownership locks through a Redis claim and external Google write. Sequential revocation can be proven here; concurrent revocation needs a reviewed atomic command/reservation boundary before conversion is safe. Local preparation does not authorize deployment.
