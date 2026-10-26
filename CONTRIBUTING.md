# Coding practices

Keep changes aligned with the requirements and technical specification in `deliverables`. Distinguish implemented behavior from planned behavior in the README. Do not claim a release gate has passed without evidence.

- Keep screens, domain rules, API access, storage and platform adapters separate. Route files should compose features rather than contain server or persistence logic.
- Use TypeScript strict mode, typed contracts and descriptive names. Validate requests on the server even when the client has already validated them.
- Keep authoritative medical records on the backend. Preserve instruction versions and original evidence. Never infer treatment instructions or convert stock/dose units implicitly.
- Derive identity from authenticated server context. Check member access on every record operation. Keep development authentication isolated from production profiles.
- Put related mutations in one transaction. Test retry behavior and concurrent writes before claiming idempotency. Do not silently overwrite conflicting dose evidence.
- Keep credentials out of source control, client bundles and logs. `EXPO_PUBLIC_*` values are public; the development token is only a local preview convenience.
- Test meaningful business invariants: timezone boundaries, inclusive dates, duplicate events, stock effects, access isolation and failure handling. Use PostgreSQL integration tests before release; H2 tests alone are insufficient.
- Run mobile lint/type checking and relevant backend tests for each change. Keep the lockfile updated. Review dependency advisories without forcing incompatible downgrades.
- Use accessible labels, text status indicators, reachable controls and useful empty/error states. Preserve form data on request failure.
- Verify native reminders on actual devices. Shared code and a web preview do not prove Android or iOS notification behavior.
- Keep local data encrypted before enabling real offline health records. Do not label in-memory sample records or unacknowledged events as durable/server confirmed.

See `mobile/AGENTS.md` for SDK-specific instructions. New dependencies must use the installed SDK's documented APIs and compatible versions.
