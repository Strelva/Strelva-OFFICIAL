# Retired agent harness

This directory preserves the repository instruction layer retired on August 8, 2026, during migration to Jacob's global agent harness.

The prior `AGENTS.md` had become a combined architecture guide, product memo, release journal, audit ledger, roadmap, and agent manual. The prior design file lacked the user loop and trust model now expected of project design context. The Claude agent profiles depended on a developer-specific external “full-stack product bench” and fixed routing between named agents.

Those artifacts are inactive. Their filenames and location intentionally keep them outside normal `AGENTS.md`, `DESIGN.md`, `.claude`, prompt, harness, and skill discovery paths. Consult them only when historical wording is needed; do not treat them as current instructions.

The active chain is the repository-root `AGENTS.md` and `DESIGN.md`, with `CLAUDE.md` importing `AGENTS.md` for Claude Code compatibility.
