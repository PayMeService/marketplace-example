# marketplace-example

Vite + React + Tailwind 4 (frontend) — NestJS + TypeORM (backend) — Postgres. Dockerized for both dev (hot reload) and prod (nginx).

## Bootstrap a new project from this template

```bash
git clone <this-repo> my-app
cd my-app
./scripts/init-project.sh my-app
make dev
```

`init-project.sh` renames every occurrence of `marketplace-example` to your app name, drops the upstream git history, re-inits a fresh repo on `main`, and seeds `.env` from `.env.example`.

## Quick start (already initialized)

```bash
cp .env.example .env   # if not present
make dev               # dev stack: vite + nest watch + postgres
# or
make up                # prod stack: nginx + nest + postgres
```

URLs:
- **Dev frontend**: http://localhost:5173 (Vite, HMR)
- **Dev backend**:  http://localhost:3000/api
- **Prod app**:     http://localhost:8080 (nginx serves SPA, proxies `/api`)
- **Adminer**:      http://localhost:8081 (server: `postgres`, user/pass from `.env`)
- **Debug**:        attach to `localhost:9229` (dev backend)

## Layout

```
.
├── backend/                  # NestJS API
│   ├── Dockerfile            # multi-stage prod (alpine + tini)
│   ├── Dockerfile.dev        # hot reload + --inspect 9229
│   └── src/health/           # /api/health (db ping)
├── frontend/                 # Vite + React + Tailwind 4
│   ├── Dockerfile            # build → nginx:alpine
│   ├── Dockerfile.dev        # vite dev server
│   └── nginx.conf            # SPA fallback + /api proxy
├── init-scripts/             # mounted into postgres on first boot
├── docker-compose.yml        # prod
├── docker-compose.dev.yml    # dev
├── Makefile                  # `make help`
└── .env.example
```

## Common tasks

```bash
make help        # list all targets
make psql        # open psql in the dev postgres
make db-reset    # nuke dev DB volume + recreate
make logs        # tail prod logs
make clean       # tear down + prune volumes
```

## Notes

- **Tailwind 4** is wired via `@tailwindcss/vite`; just `@import "tailwindcss";` in `src/index.css`.
- **`DB_SYNCHRONIZE=true`** is convenient for dev only. Switch to TypeORM migrations before prod.
- The dev compose mounts source for HMR; the prod compose builds and serves static + compiled output.
