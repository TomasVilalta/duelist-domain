# Agent workflow

## Planning

Use the `architect` subagent (`.cursor/agents/architect.md`) to design sprints, split tickets, and restructure `docs/`. Sprint docs must exist before the ticket loop starts.

## Ticket loop

Tickets live in `docs/sprints/sprint-N-*.md`. Work one ticket at a time, in the order the sprint doc gives.

1. Branch from `dev`: `sprint-N/tX-short-name`. If the ticket depends on an unmerged ticket, branch from that ticket's branch and set it as the PR base instead of `dev`.
2. Build the ticket. Stay inside its scope.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`. All must pass before pushing.
4. Commit (`tX: <summary>`), push, open a PR with `gh pr create --base dev` using `.github/pull_request_template.md`.
5. Update the ticket heading in the sprint doc to `(built, in review: <PR link>)`.
6. Wait for the Codex review (`gh pr view --comments`, poll every few minutes, not in a tight loop).
7. Fix review findings, push, then comment `@codex review` to request a re-review.
8. Stop when Codex reports no issues. Max 2 fix rounds: after that, stop and summarize open findings for the human.

Never merge a PR. The human merges after the manual test; merging marks the ticket done.

## Review findings

- Fix findings that are real bugs or break the ticket's acceptance criteria.
- Skip findings that are out of scope or style-only. Reply on the thread with one line explaining why.
- Do not expand scope to satisfy a reviewer.

## Manual test

If a ticket touches rendering, interaction, or animation, the PR must list manual test steps for the human to run on the local build (`pnpm dev`). Leave those boxes unchecked.

## Review guidelines

For Codex reviews:

- Flag only P0/P1 issues: bugs, broken acceptance criteria, type holes, missing tests for new logic.
- Check the change against the ticket in `docs/sprints/`. Flag scope creep.
- `@duelist/shared` must stay free of rendering and browser code.
