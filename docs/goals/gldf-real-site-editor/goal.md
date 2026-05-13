# Make GLDF Site Editing Real

## Original Request

`/goal lets fully get this gap filled and fully working`

The gap is that `/client/gldf/dashboard/site` can show the accurate live GLDF site, but Edit mode can fall back to Scaffold Web's local/template preview instead of the real GLDF storefront. The owner-facing product promise only works if the editable preview, draft save, Push, and GLDF storefront render path all use the same Scaffold Web content contract.

## Outcome

Make the GLDF site editor preview and publish loop honest and working:

- Live preview shows the current public GLDF storefront.
- Edit/Draft preview opens the custom GLDF storefront, not the generic Scaffold Web template preview.
- Scaffold Web can inject the iframe edit contract into the authenticated GLDF editable preview, so production inline editing does not wait on a GLDF storefront deploy.
- GLDF also has native edit hooks ready as a progressive enhancement for the next storefront deployment.
- Save Draft writes to Scaffold Web draft content.
- Push publishes to Scaffold Web live content and revalidates the GLDF storefront.
- Browser verification proves the dashboard iframe is pointed at the GLDF storefront for editing and the live proxy for live preview.

## Constraints

- Preserve existing dirty work in both repos.
- Do not revert unrelated local changes.
- Keep GLDF as a read-only storefront when `REB_API_URL` is configured; edits remain owned by Scaffold Web.
- Do not rebuild the GLDF site inside Scaffold Web.
- Do not require OAuth or other unrelated connection work for this tranche.

## Verification

- Scaffold Web focused tests around dashboard/site preview URL selection and owner journey copy.
- GLDF focused tests/typecheck for edit overlay wiring when feasible.
- `pnpm typecheck` in Scaffold Web after implementation.
- Browser verification on `http://localhost:3000/client/gldf/dashboard/site`:
  - default iframe uses `/client/gldf/api/live-preview?...`;
  - Edit mode iframe uses Scaffold Web's authenticated `/api/edit-preview` proxy against the GLDF storefront;
  - clicking/field editing messages can be received by Scaffold Web from the GLDF iframe.

## Starter

`/goal Follow docs/goals/gldf-real-site-editor/goal.md.`
