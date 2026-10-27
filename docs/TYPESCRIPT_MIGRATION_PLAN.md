# Free Way — TypeScript Migration Plan

## Safety rules
- Work only on feat/freebuff-style-platform-roadmap until the migration is verified.
- Do not merge to main or deploy to Render during the migration.
- Preserve the Python service and its API contracts until a TypeScript replacement has equivalent behavior and passing tests.
- Never move provider keys, tokens, database credentials, or admin secrets into frontend code.

## Why this is phased
The current application is a React/Vite frontend backed by a Python service. Changing the language does not automatically fix bugs; the API, persistence, provider routing, sandboxing, authentication, and deployment contracts must remain compatible.

## Phases
1. **TypeScript foundation:** enable TS/TSX in the existing Vite frontend while allowing existing JS/JSX files to keep working. Keep current runtime behavior unchanged.
2. **Typed frontend modules:** migrate small leaf modules first (API response types, model/provider types, settings and project data), then UI components. Add tests around each module before converting it.
3. **Backend contract inventory:** document every API route, request/response schema, auth rule, persistence behavior, provider adapter, background task, and sandbox boundary in the Python service.
4. **TypeScript backend prototype:** build a separate Node/TypeScript service only after the contract inventory is complete. Reuse existing Python service in production until the prototype passes contract and integration tests.
5. **Parity verification:** compare endpoints, authentication, provider fallback, project/chat persistence, approval workflow, command sandbox, previews, integrations, and admin functions.
6. **Release gate:** all unit, API, security, desktop/mobile E2E, and deployment smoke tests must pass before any merge or live deployment.

## Current baseline
- Frontend: React + Vite, currently mostly .js / .jsx.
- Backend: Python package under freecode/.
- Docker build: Node builds the frontend; Python runs the hosted service.
- CI has been added on this branch. Resolve existing test failures before treating this as a migration-ready baseline.

## Completion definition
A phase is complete only when the code is committed on this branch, automated checks pass, and no existing feature is silently removed or replaced with a non-functional placeholder.
