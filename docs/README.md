# Docs

Durable contracts only. Progress, status, plans, audits, and migration records live in Issues, PRs,
and Git history. Read the index for your task, then one document.

| Area | Index | Holds |
| --- | --- | --- |
| Product rules | [product-rules/README.md](product-rules/README.md) | Behavior, lifecycles, cross-service workflows |
| Dev rules | [dev-rules/README.md](dev-rules/README.md) | Architecture, data and security, migrations, testing |
| Design rules | [design-rules/README.md](design-rules/README.md) | Portal UI, copy, terminology, changelog |
| ADRs | [adr/](adr/) | Accepted decisions (history; constraints still bind) |
| Deployment | [api-github-actions.md](deployment/api-github-actions.md), [api-observability.md](deployment/api-observability.md), [portal-cloudflare.md](deployment/portal-cloudflare.md) | API and Portal deploy, secrets, production verification |
| API contract | [api/openapi.json](api/openapi.json) | Machine-readable routes; update with code |

ADRs: [0001 stack](adr/0001-platform-technology-stack.md),
[0002 submission-status reads](adr/0002-submission-status-d1-reads.md),
[0003 domain convergence](adr/0003-platform-domain-convergence.md),
[0004 storage reads](adr/0004-storage-read-standard.md).

Placement: behavior goes in product rules, engineering constraints in dev rules, UI in design rules,
decisions in `adr/`, operations in `deployment/`. Project intro: [README](../README.md).
