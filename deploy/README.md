# Industrial demo deployment

Target: Ubuntu 24.04 x86_64, `39.106.98.214`, `industrial.everdojo.cn`.
Existing EverDojo containers and host Nginx remain in place. Industrial uses loopback port 8081 and a separate Compose project/database volume.

## Initial setup

1. Add the `industrial` A record to `39.106.98.214`; confirm domain filing status with the hosting provider before public launch.
2. Create `/opt/industrial-monitoring`, owned by the SSH deployment user. The user needs Docker access (equivalent to administrative access).
3. Copy `.env.example` to `/opt/industrial-monitoring/.env`, mode 600. Set a random hex database password and DEPLOY_DOMAIN. Leave AI keys empty until you want paid diagnosis requests. Later password changes also require updating the existing database role password.
4. Install `nginx.conf` as a separate host site, run `nginx -t`, then reload. Once DNS resolves, run `sudo certbot --nginx -d industrial.everdojo.cn` and verify renewal with `sudo certbot renew --dry-run`.
5. Configure GitHub secrets/variables below. Actions passes a temporary read-only GHCR token to an isolated Docker config directory for each release and logs out afterward. Packages can remain private even though the code repository is public. Manual deployments require GHCR read access and the fixed database image already cached on the server.

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

Application rollback (uses cached images and retains the migrated database; confirm schema compatibility first):

```bash
previous_sha=<previous-40-character-sha>
RELEASE_SHA="$previous_sha" docker compose \
  --env-file /opt/industrial-monitoring/.env \
  -f "/opt/industrial-monitoring/$previous_sha/compose.yml" \
  up -d --pull never --remove-orphans --wait
ln -sfn "/opt/industrial-monitoring/$previous_sha" /opt/industrial-monitoring/current
```

Logs:

```bash
cd /opt/industrial-monitoring/current
RELEASE_SHA=$(basename "$(pwd -P)") docker compose --env-file ../.env -f compose.yml logs --tail=100
```

## Demo access

- Login required: editor/runtime pages, published schemas, alarm snapshots/history/evidence and WebSocket telemetry. Health and login remain reachable without a session; device ingestion retains its internal-network contract.
- Accounts have editor/viewer roles. Existing accounts remain editors. Viewer accounts may read published runtime data and alarms and request diagnosis, but draft reads, editing and publishing return 403.
- Telemetry ingestion: internal Docker network only; denied at gateway.
- Product help: 503; personal Pi credentials are not deployed.

After the authentication migration, provision the first account in the deployed API container (existing Basic Auth credentials are not imported):

```bash
docker compose --env-file ../.env -f compose.yml exec api python -m industrial_api.create_user demo-admin
```

The command prompts twice without echoing the password. It refuses to overwrite existing accounts. Run it after the first deployment and before distributing editor access. Browser accounts are stored in PostgreSQL; sessions expire after eight hours and logout revokes them. HTTPS deployment sets Secure cookies. The API has no published port; forwarded client addresses are trusted only from the internal Docker network. Login is limited to ten attempts per client per minute.

First open `/editor/demo`, sign in, save and publish. Then open `/runtime/demo` with the same login. Anonymous schema/alarm reads and WebSocket subscriptions must be rejected. Verify realtime WebSocket updates, page refresh, unauthorized writes (401), telemetry denial (404), and existing EverDojo availability.

## Mobile interview demo

`/mobile/` serves the uni-app H5 build from the same Web image and API origin. CI verifies H5 and WeChat builds and tests; deployment smoke checks require /mobile/assets/ references so the old Web SPA fallback cannot masquerade as a successful mobile release.

After deploying the account migrations, create a viewer account in the API container:

```bash
docker compose --env-file ../.env -f compose.yml exec api python -m industrial_api.create_user interviewer --role viewer
```

Keep the password in a secure channel and give it only to intended reviewers. The initial account migration does not import old Basic Auth passwords; provision an editor account for the project owner if no editor exists. Verify login, viewer role, read-only data/WSS, editing/publishing 403, logout and rejected session reuse. A shared-origin H5 smoke does not substitute for real WeChat device verification.

Application image preparation is bounded to 180 seconds on the server. If the registry stalls, the GitHub runner downloads the same SHA-tagged images and streams a Docker archive through SSH. The deployment script verifies each required cached image before stopping services. Manual deployment without `APP_IMAGES_PRELOADED=true` retains normal registry pulling.
