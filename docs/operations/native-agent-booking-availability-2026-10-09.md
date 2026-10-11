# Scoped native booking availability

The availability reader previously checked global legacy tenant parity before resolving the matched business's booking scope. This could report an unlinked native calendar as disabled while its request path correctly reached the customer confirmation hold.

Availability now resolves the business scope and uses the same `requireAgentBookings(scope)` admission as the request path. An exact live unlinked native calendar bypasses unrelated tenant parity; legacy scopes retain their cutover checks. Agent, store-write, and dual-write rollback gates remain enforced. Disabled confirmation still reports `no`, and an unreadable calendar reports `unknown`.

The MCP readiness fallbacks remain global: the platform fallback has no business target, and the per-business alias carries the legacy tenant scope. The workspace-release readiness branch already admits workspace tool routing; the actual booking request passes its resolved scope to native admission. No legacy seven-day cutover was relaxed.

Verification: three focused files, 68 tests passed (`booking-native-agent-admission`, `agent-booking-visibility`, `platform-mcp`), with two workers. Scoped ESLint and diff checks passed. No native database, Auth journey, email, or provider execution occurred in this lane. Root integration and actual Auth verification remain pending.
