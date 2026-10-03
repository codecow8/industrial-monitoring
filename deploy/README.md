# Industrial demo deployment

Target: Ubuntu 24.04 x86_64, `39.106.98.214`, `industrial.everdojo.cn`.
Existing EverDojo containers and host Nginx remain in place. Industrial uses loopback port 8081 and a separate Compose project/database volume.

## Initial setup

1. Add the `industrial` A record to `39.106.98.214`; confirm domain filing status with the hosting provider before public launch.
2. Create `/opt/industrial-monitoring`, owned by the SSH deployment user. The user needs Docker access (equivalent to administrative access).
3. Copy `.env.example` to `/opt/industrial-monitoring/.env`, mode 600. Set a random hex database password and bcrypt demo password hash. Leave AI keys empty until you want paid diagnosis requests. Later password changes also require updating the existing database role password.
4. Install `nginx.conf` as a separate host site, run `nginx -t`, then reload. Once DNS resolves, run `sudo certbot --nginx -d industrial.everdojo.cn` and verify renewal with `sudo certbot renew --dry-run`.
5. Configure GitHub secrets/variables below. Actions passes a temporary read-only GHCR token to an isolated Docker config directory for each release and logs out afterward. Packages can remain private even though the code repository is public. Manual deployments require GHCR read access or images already downloaded locally.

Repository secrets:

- `DEPLOY_SSH_KEY`: private key authorized for the deployment user; never commit it.
- `DEPLOY_KNOWN_HOSTS`: verified host-key entry from trusted local known_hosts, or verified through the server console.

Repository variables:

- `DEPLOY_HOST=39.106.98.214`
- `DEPLOY_USER`: deployment user.
- `DEPLOY_DOMAIN=industrial.everdojo.cn`
- `DEPLOY_READY=true`: enable after SSH, server .env, DNS, HTTPS and GHCR access are ready. Without it, CI/image builds run but deployment is skipped.

## Release flow

Push main → frontend/API/Agent tests → three linux/amd64 application images tagged by SHA and a PostgreSQL mirror at 18.6-alpine → SSH deployment → database backup → stop API/simulator → migration → container health/database checks → HTTPS smoke check.
The upstream PostgreSQL image is mirrored unchanged to GHCR because this server cannot reliably reach Docker Hub.
If the fixed database image is not cached on the server, the runner downloads it and transfers a compressed Docker archive over SSH. Database startup never pulls from a registry on the host; direct database downloads were observed to stall. Application images continue to use GHCR normally.
Pull requests only verify. Live AI evaluations do not run in CI.

Deployments are serialized. API uses one worker because telemetry/WebSocket state is in process. Migration/replacement causes a short interruption; this is not zero-downtime deployment.
Startup/database failures restore previous application images. Database migrations are not reversed. HTTPS smoke failures fail the workflow but leave healthy containers running for DNS/certificate repair.

Backups are retained at `/opt/industrial-monitoring/backups`; copy them off-server periodically and monitor storage. Never run `docker compose down -v` in production.

Application rollback:

```bash
bash /opt/industrial-monitoring/<previous-40-character-sha>/deploy.sh <previous-40-character-sha>
```

Logs:

```bash
cd /opt/industrial-monitoring/current
RELEASE_SHA=$(basename "$(pwd -P)") docker compose --env-file ../.env -f compose.yml logs --tail=100
```

## Demo access

- Public: `/runtime/demo`, published schemas, alarm snapshots/history/evidence and WebSocket telemetry.
- Basic Auth: `/editor/demo`, drafts, publishing, diagnosis and other API routes. Sharing the account also grants editing rights; only give it to trusted reviewers.
- Telemetry ingestion: internal Docker network only; denied at gateway.
- Product help: 503; personal Pi credentials are not deployed.

First open `/editor/demo`, enter the demo account, save and publish. Then open `/runtime/demo` without credentials. Verify realtime WebSocket updates, page refresh, unauthorized writes (401), telemetry denial (404), and existing EverDojo availability.
