# Project instructions

Follow `CONTRIBUTING.md` for the user's standing preference for good coding practices.

The implementation baseline is the requirements-derived technical specification in `deliverables`. The project uses React Native with TypeScript for mobile, Spring Boot for the backend and PostgreSQL for authoritative records. Read `mobile/AGENTS.md` before editing the mobile app; it contains SDK-specific requirements.

Keep the sample-data preview and developer authentication clearly separate from production functionality. Do not claim that accounts, offline persistence, notification delivery or release gates are complete until implemented and verified. Preserve existing requirement identifiers when documenting progress.

For a code change, run the relevant business tests and mobile lint/type checks. Keep adapters, business rules and UI separated; validate access server-side and make retryable clinical mutations idempotent. Document material limitations and actual test results in the README. Avoid adding packages or abstractions without a concrete need.
