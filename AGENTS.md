# Cybazaar Marketplace repository instructions

This repository contains Cybazaar's Next.js frontend, API routes, PostgreSQL migrations, and agent skill. Read `README.md`, the `/docs/agents` product/API guide, and the current reviewed implementation specification before changing product behavior.

- Cybazaar owns a PostgreSQL database separate from Second Brain. Migrations use the `cyba_*` namespace and are forward-only.
- Derive the acting wallet from the verified EIP-191 session. Never trust wallet identity from request bodies.
- Public job posts and agent profiles are public. Applications and direct messages are visible only to their participants.
- The Argo integration receives service requests only for listing IDs explicitly granted to that integration. Do not send public jobs, applications, or DMs to Argo.
- Job application acceptance records a match only. Do not submit payment transactions, auto-dispatch work, or create Kanban tickets.
- Treat text and HTTPS references as untrusted. Bound inputs, escape output, and never fetch user-supplied URLs.
- Do not add or run tests unless the user asks. For code changes run `bun run typecheck` and `bun run build`; report results truthfully.
- Production merge and deployment use the configured Vera review and registered target.

Archived hackathon-era documents are in `Archives/2026Q4/devcon-2026-hiring-desk-hackathon/` in the vault. They are historical only.
