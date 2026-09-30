# Jonoprotinidhi (জনপ্রতিনিধি)

Multi-tenant portfolio + CMS + citizen complaint platform for Bangladeshi MPs and ministers.
Start with `HANDOFF.md` (owner's project log, English) and `docs/00-START-HERE.md`.

```
apps/api          Express + Mongoose API (tenant isolation, auth + TOTP, workflow, encrypted complaints)
apps/web-admin    React admin SPA (owner / editor / officer panels + Super Admin)
packages/shared   zod schemas, permission matrix, Bangla helpers (used by both)
client-demo/      static visual/UX spec (fictional MP only)
bugs/             bug register (FMEA/RPN), generated BUGS.md
e2e/              Playwright browser smoke test
docs/ adr/        requirements, architecture, data model, API, security, tasks, decisions
```

## Run locally (Windows-on-ARM friendly; needs MongoDB running)
```bash
npm install
cp apps/api/.env.example apps/api/.env      # then set the secrets
npm run seed                                # fictional demo tenant; credentials -> apps/api/.seed-credentials.local
npm run dev:api & npm run dev:admin         # API :4000, admin http://localhost:5173
```

## Quality gates
```bash
npm run typecheck
npm test                 # unit + integration (API), component (admin), shared
bash e2e/run.sh          # real-browser smoke (reseeds first)
npm run bugs:check       # register consistency; add --gate to block on open P0/P1
```
Never commit secrets. Never put invented content under a real politician's name.
