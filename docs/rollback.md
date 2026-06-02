# Rollback

## Strelva code rollback
1. Redeploy previous Vercel deployment.
2. Confirm `/api/v1/content/gldf/hero`.
3. Confirm dashboard content edits still save.
4. Confirm revalidation dispatch works.

## Content rollback
1. Restore previous content version in Strelva.
2. Trigger GLDF revalidation.
3. Confirm storefront reflects restored version.
