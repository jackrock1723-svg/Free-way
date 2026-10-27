# Free Way Repository Audit — Initial Pass

Date: 2026-10-27
Branch for follow-up work: `feat/freebuff-style-platform-roadmap`

## Scope and confidence
This is a source-structure audit based on the default branch's file tree and selected source files. It is not a successful build/test run and does not prove the production deployment is healthy. The live UI was also reviewed from the user's screenshot.

## Confirmed existing foundation
- React 19 + Vite frontend: `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/styles.css`.
- Large existing application component with project selection/creation, chat history, agent orchestration, model catalog fetch, settings API, preview history, terminal/diff/review state.
- Feature components already exist for composer, sidebar/icon rail, left panel, workspace toggles, terminal panel, split pane, chat history, and numerous settings pages.
- Existing settings screens include General, Appearance, Project, Account, Usage, Billing, Earn, Integrations, Providers, Skills, Archived, Browser, MCP, Updates and Ads Privacy.
- Backend Python package includes agent orchestration, model catalog/routing, ads, auth/admin token, attachments, connectors and related modules.
- Test structure exists: Node unit tests plus Playwright end-to-end tests, including composer, chat history, ads, contrast, admin and baseline.
- Root scripts declare `npm run build`, `npm run test:unit`, and `npm run test:e2e`.

## Screenshot-confirmed current experience
- Dark desktop workspace with left icon rail, left navigation/chat/project panel, main conversation area, project selector, composer, Agent selector, model selector and Cloud toggle.
- The chat shows some answers labelled `Instant reply (no model call)`. This may be intended for simple greetings, but user-facing UI must clearly distinguish these replies from actual provider/model calls.
- Screenshot alone cannot verify project persistence, model routing, cloud editing, preview, deployment or ad revenue.

## Key risks / verification still required
1. Run the frontend production build and unit tests in a reproducible environment; record exact failures before changing application logic.
2. Run Playwright tests and review any tests that require local services/secrets.
3. Trace navigation and action handlers from `App.jsx`; do not add duplicate screens before confirming what is already reachable.
4. Verify model picker selection changes the real provider/model and the displayed metadata is accurate.
5. Verify chat/project persistence across refresh and sessions.
6. Verify Cloud/repository features, sandbox boundaries and deployment paths with a disposable test repository.
7. Verify whether ad publishing is configured in production. Mock ad inventory must not be counted as earnings.
8. Review repository history for exposed credentials. Rotate any credentials ever committed publicly; never add credentials to this document or issue.

## Recommended implementation order
- Step A: establish build/unit/E2E baseline and a verified feature matrix (Working / Partial / Mocked / Missing).
- Step B: repair the highest-impact bugs revealed by tests.
- Step C: improve navigation and fill only verified missing destinations.
- Step D: complete the Web Builder workflow, then Cloud, Chat/Research, model selection, Projects, Usage/Sites/Settings.
- Step E: verify ad provider, consent, reporting and admin authorization before launch.

## Acceptance rule
No feature is labelled complete until its UI action, backend behavior, persistence where applicable, error state, and relevant test are verified.
