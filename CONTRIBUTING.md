# Contributing

Thanks for helping document Greenwich's utility pole problems.

- **Start with [AGENTS.md](./AGENTS.md).** It is the canonical guide for people and coding agents alike: stack, commands, secrets procedure, engineering rules.
- **Branch and open a pull request.** `main` is protected; CI (lint, typecheck, tests, build, secret scan) must be green before merge.
- **Keep it small.** One concern per PR, tests for logic in `lib/`, no new dependencies without a reason in the PR body.
- **Security issues** go to the address in [SECURITY.md](./SECURITY.md), not to a public issue.
- **Privacy.** Never add code paths that expose submitter contact details; the public read model is defined in `lib/publicReport.ts`.

Project history and internal operations material are kept privately; this repository holds the code and the documentation needed to run it.
