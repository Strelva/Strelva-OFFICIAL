# Strelva product memory

[PRODUCT_MODEL.md](../PRODUCT_MODEL.md) is the canonical product ledger for this repository. Its JSON block owns IDs, claims, relationships, provenance, readiness and open questions. Research reports and diagrams are dated views, not competing models.

## Start a latent session

1. Read the ledger's product identity, revision, coverage and questions.
2. Traverse the relevant nodes and their premises. Inspect changed sources and missing evidence; avoid rediscovering everything.
3. Keep owner intent, source implementation, local verification, production operation, adoption and economics separate.
4. Before editing, save a before-snapshot and reread the revision. Reconcile concurrent changes; preserve stable IDs and all history.
5. Patch supported claims, mark dependent claims stale when premises change, and increment the revision once. Proposed nodes need a validation path; inferred nodes need premises.
6. Run the integrity check and regenerate affected views. Record the limits of proof.

The installed latent skill provides a Python standard-library helper. Run from this repo:

```sh
python3 "$HOME/.agents/skills/latent/scripts/product_model.py" check PRODUCT_MODEL.md
python3 "$HOME/.agents/skills/latent/scripts/product_model.py" check PRODUCT_MODEL.md --against output/product-audit-2026-10-04/model/model-before.md
python3 "$HOME/.agents/skills/latent/scripts/product_model.py" graph PRODUCT_MODEL.md --output .product/views/reborn.mmd
python3 "$HOME/.agents/skills/latent/scripts/product_model.py" graph PRODUCT_MODEL.md --focus DESIGN_TYPED_DOMAINS --hops 2 --output .product/views/revival-domain.mmd
```

Adjust the snapshot path for the next revision. The helper checks ledger structure and retained IDs; it does not verify source truth or implementation.

## Current research

Revision 6 (2026-10-05) reconciles the combined Reborn source and the [integration audit](../docs/operations/reborn-integration-audit-2026-10-05.md). Business records, durable lead copies, operator lead visibility and Systems now coexist locally. Production migration, conversion, customer use and delivery remain unproven. Revision 5's audit claims remain in the ledger and the dated [product-state view](views/product-state.mmd), which remains at revision 5 until regenerated. The historical `output/product-audit-2026-10-04/` bundle is not included in this checkout; its source locators require recovery before relying on those artifacts.

The selected customer model is **Systems, Connections, Possibilities and Versions**, recorded in `DESIGN_SYSTEMS_PRODUCT_MODEL` and the four `PRIM_SYSTEM` / `PRIM_SYSTEM_CONNECTION` / `PRIM_POSSIBILITY` / `PRIM_CONTEXT_VERSION` records. Only the four nouns and five verbs are confirmed founder direction, and that rests on a chat message; ADR 0011 is still proposed. The four records are now `partial`: the `transition/systems` source is included in the combined Reborn integration, sharing the spine's `SystemRef`; the dated defects in `ISSUE_SYSTEMS_AUDIT_DEFECTS` require reconciliation against the integration fixes, and current release findings remain in `ISSUE_REBORN_RELEASE_AUDIT`. [The Systems graph](views/systems.mmd) shows those selected relationships; [Make real](views/make-real.mmd) expands the activation contracts. `PRIM_CONNECTION` is now labeled "External account binding" to keep it apart from the customer noun Connection. Redundant primitives are retired with `details.superseded_by`; nothing was deleted. [Primitive debate](views/primitive-debate.mmd) is kept as a historical revision 3 view.

Earlier record/operation/authority/evidence graphs describe supporting architecture. They do not compete with the selected customer vocabulary. Contextual Versions differ from temporal releases, and cross-business descendants retain locally owned data, credentials and authority. Update these views when their source records change; do not turn them into a second model.

The historical revival domain blueprint (`docs/research/strelva-revival-domain-model-2026-10-02.md`) compared the primitive proposal with contracts and primary external sources; that file is not included in this checkout and requires recovery before reuse. Cross-worktree sources are scoped to the recorded branch/observation, not this branch's implementation. Preserve evidence before that worktree is removed or merged; update locators after a merge.

The canonical model and `.product/` views are committed through `product-model` (`96f1790a`) and included in the Reborn integration. `Q_MODEL_BACKUP` is resolved for these files. Parent ADRs and unrelated artifacts retain their own storage scope. A committed model is neither a deployed product nor operating evidence.
