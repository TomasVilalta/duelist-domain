# Agent workflow

## Decisions

Never make product, functionality, or architecture decisions alone. Ask the human first and wait for approval. This covers:

- Behavior or rules not stated in the ticket or sprint doc.
- New dependencies, packages, or changes to package boundaries.
- Changes to data models, public APIs, or the state shape.
- Fixing a review finding in a way that changes behavior or design.

If the ticket is ambiguous, stop and ask with concrete options. Implementation details inside an approved design need no approval.

## Planning

Use the `architect` subagent (`.cursor/agents/architect.md`) to design sprints, split tickets, and restructure `docs/`. Sprint docs must exist before the ticket loop starts.

## Ticket loop

Tickets live in `docs/sprints/sprint-N-*.md`. Work one ticket at a time, in the order the sprint doc gives.

1. Branch from `dev`: `sprint-N/tX-short-name`. If the ticket depends on an unmerged ticket, branch from that ticket's branch and set it as the PR base instead of `dev`.
2. Build the ticket. Stay inside its scope.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`. All must pass before reviewing.
4. Commit (`tX: <summary>`), then run the local Codex review against the PR base:
   `codex -c review_model='"gpt-6-astra"' -c model_reasoning_effort='"low"' review --base dev`
   Use the parent ticket branch instead of `dev` for stacked tickets.
5. Fix findings, rerun checks, commit, review again. Stop when Codex reports no P0/P1 issues. Max 2 fix rounds: after that, stop and list open findings in the PR.
6. Push and open a PR with `gh pr create --base dev` using `.github/pull_request_template.md`. Fill in the Codex review section.
7. Update the ticket heading in the sprint doc to `(built, in review: <PR link>)`, commit, push.

Never merge a PR. The human merges after the manual test; merging marks the ticket done.

## Review findings

- Fix findings that are real bugs or break the ticket's acceptance criteria.
- Skip findings that are out of scope or style-only. List each in the PR with a one-line reason.
- Do not expand scope to satisfy a reviewer.

## Manual test

If a ticket touches rendering, interaction, or animation, the PR must list manual test steps for the human to run on the local build (`pnpm dev`). Leave those boxes unchecked.

## Review guidelines

For Codex reviews:

- Flag only P0/P1 issues: bugs, broken acceptance criteria, type holes, missing tests for new logic.
- Check the change against the ticket in `docs/sprints/`. Flag scope creep.
- `@duelist/shared` must stay free of rendering and browser code.
