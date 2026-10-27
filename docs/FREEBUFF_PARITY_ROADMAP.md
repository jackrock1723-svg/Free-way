# Free Way — Full Freebuff-Style Platform Roadmap

## Goal
Turn the existing Free Way / Freecode codebase into a coherent, mobile-friendly platform with distinct Web Builder, Cloud Repo Agent, Chat/Research, Projects, Models, Settings, and Ads/Revenue surfaces. Reuse existing working backend capabilities; do not rewrite the app from scratch.

This is a feature-parity roadmap, not a claim that every feature in Freebuff is already implemented or that every provider/hosting tier can be free forever. Use Free Way branding and original UI assets; implement comparable workflows rather than copying proprietary source code or brand assets.

## Audit baseline (from the repository README and Render blueprint)
- Existing foundation documented: plan/approval/build workflow, isolated git worktree, sandboxed commands, diffs, live preview, agent checkpoints, model routing, strict output schemas, GitHub/deploy integrations, chat/research commands, image input, ad module, and owner revenue endpoint.
- Existing deployment blueprint: Render Docker web service, `/api/health`, Postgres via `DATABASE_URL`, and secret values entered in the Render dashboard.
- Important validation gap: documentation is not proof that every route, UI screen, integration, persistence path, or live deployment works. The first engineering task is to verify the actual UI/API and tests.
- Ads currently have a mock fallback. Mock ads are test inventory, not revenue. A real publisher must be approved/configured, privacy/consent behavior tested, and real serving verified before describing ad income as active.
- Security gate: keep all provider keys, database URLs, admin tokens, OAuth secrets, and private keys out of Git. If a secret was committed to a public repository, rotate it; deleting the current file alone is insufficient.

## Phased implementation

### Phase 0 — Protect and establish a reliable baseline
- Keep the current main branch untouched; work on a feature branch.
- Confirm no secrets are present in current tracked files or history; rotate exposed credentials.
- Run unit/API/Playwright tests and record current failures.
- Check live health endpoint and deployment logs separately from local tests.
- Capture the current UI at desktop and mobile widths.

**Exit criteria:** baseline test report, known blockers, and a restorable known-good commit.

### Phase 1 — App shell and navigation
- Build one consistent responsive app shell with left navigation, collapsible project rail, top bar, model selector, account menu, and main workspace.
- Navigation destinations: Build (Web), Cloud, Chat & Research, Projects, Models, Usage, Sites/Deployments, Settings, Help.
- Preserve existing working UI and backend endpoints; avoid placeholder controls that look functional but do nothing.
- Add accessible loading, empty, error, and mobile states.

**Exit criteria:** every navigation item opens the correct screen; no dead buttons; mobile and desktop layouts work.

### Phase 2 — Web Builder workflow
- Prompt composer with text and supported image attachments, starter templates, plan/review mode, approval controls, task progress, files/diff, terminal/check results, and preview toolbar.
- Project creation, rename, duplicate where supported, recent projects, and durable history.
- Clear stop/cancel/retry states and understandable model/provider errors.

**Exit criteria:** create a project from a prompt, approve a plan, generate files, run checks, inspect diffs, and see a live preview.

### Phase 3 — Cloud repository workspace
- GitHub OAuth / repository picker with least-privilege permissions.
- Import a repository, select branch, show repository status, run the agent in an isolated workspace, show diff/checks, and open a pull request.
- Sandbox resource limits, safe command policy, cleanup, timeout, and clear privacy messaging.

**Exit criteria:** safely import a test repository, make a small change, run checks, review the diff, and create a PR without exposing credentials.

### Phase 4 — Chat & Research
- Standalone chat threads and research mode with citations.
- Conversation history, rename/delete, follow-up suggestions, copy response, and model switching.
- Distinguish sourced research from model-generated content.

**Exit criteria:** threads persist across refresh/sign-in and research citations open the cited sources.

### Phase 5 — Model picker and routing
- Catalog with provider, model name, capability tags, free/limited status, context/input modalities where known, and current availability.
- Auto mode plus explicit model selection; per-task routing and fallback.
- Never claim a model is free/unlimited unless its provider terms and actual limits support that statement.
- Hide unavailable models with a clear reason; never expose provider API keys to the client.

**Exit criteria:** picker selection affects the actual provider/model used and the response metadata reports the true selection.

### Phase 6 — Projects, Usage, Sites and Settings
- Projects list/search/filter and project details.
- Usage: request counts, runtime, provider failures, estimated model cost where measurable, and quota/limit explanations.
- Sites/Deployments: actual deploy status, URLs, timestamps, logs/errors, and supported providers only.
- Settings: profile/auth, model/provider keys, GitHub/deploy integrations, privacy, ads consent, theme, data export/delete, and account controls.
- Every setting must persist and have a clear success/failure state.

**Exit criteria:** settings survive refresh and user sessions; usage/deployment data reflects real backend records.

### Phase 7 — Ads, consent and owner revenue
- Keep ad content clearly labelled and separated from AI output.
- Enforce consent, opt-out, Global Privacy Control where applicable, data minimization, and delete/export controls.
- Separate mock/test mode from production; do not count mock impressions or clicks as income.
- Validate publisher approval, ad render, impression/click callbacks, payout requirements, and accounting before claiming revenue.
- Restrict owner revenue endpoints to verified administrators; never rely on a hidden URL alone.

**Exit criteria:** test-mode checks pass, production publisher status is known, consent controls work, and admin revenue data is access-controlled.

### Phase 8 — Release readiness
- End-to-end test all primary journeys at mobile and desktop widths.
- Accessibility, error handling, security, rate limits, abuse protection, privacy copy, and backups.
- Test cold start and sleep/wake behavior on free hosting.
- Publish known limitations and a clear status page.

**Exit criteria:** a public user can sign in, build, revisit a project, use chat, connect a repo, and understand current limits without misleading UI.

## Working rules
1. One phase at a time; do not add unrelated features mid-phase.
2. Make small commits and test each change.
3. Do not paste secrets into chat or commit them to Git.
4. Do not deploy a breaking change to production before tests pass.
5. Prefer free tiers and local/mock testing, but be honest about quotas and cold starts.
6. Keep an issue list of verified defects; label features as Working, Partial, Mocked, or Not Yet Implemented.

## First task
Inspect the actual frontend routes/components, backend endpoints, migrations and test suite; then produce a verified feature matrix. Implement the highest-impact Phase 0/1 fixes only after identifying the real source files and tests.
