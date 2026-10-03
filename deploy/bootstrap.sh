#!/usr/bin/env bash
# Run once on the existing Ubuntu host; nginx.conf must sit beside this script.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
install -d -m 700 /opt/industrial-monitoring
if [[ ! -e /opt/industrial-monitoring/.env ]]; then
  db_password=$(openssl rand -hex 32)
  demo_password=$(openssl rand -hex 16)
  demo_hash=$(printf '%s' "$demo_password" | python3 -W ignore::DeprecationWarning -c \
    'import crypt,sys; print(crypt.crypt(sys.stdin.read(), crypt.mksalt(crypt.METHOD_BLOWFISH)))')
  [[ "$demo_hash" == '$2'* ]] || { echo "bcrypt generation failed" >&2; exit 1; }
  {
    printf 'IMAGE_PREFIX=ghcr.io/codecow8/industrial-monitoring\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$db_password"
    printf 'DEMO_USERNAME=demo-admin\n'
    printf "DEMO_PASSWORD_HASH='%s'\n" "$demo_hash"
    printf 'AI_PROVIDER=deepseek\nDEEPSEEK_API_KEY=\nOPENAI_API_KEY=\nAI_MODEL=\n'
  } > /opt/industrial-monitoring/.env
  printf 'URL: https://industrial.everdojo.cn/editor/demo\nUsername: demo-admin\nPassword: %s\n' \
    "$demo_password" > /opt/industrial-monitoring/demo-credentials.local
fi

site=/etc/nginx/sites-available/industrial-monitoring
if [[ -e "$site" ]]; then
  cmp nginx.conf "$site" || { echo "Existing industrial Nginx config differs; inspect before replacing." >&2; exit 1; }
else
  install -m 644 nginx.conf "$site"
fi
if [[ ! -e /etc/nginx/sites-enabled/industrial-monitoring ]]; then
  ln -s "$site" /etc/nginx/sites-enabled/industrial-monitoring
fi
nginx -t
systemctl reload nginx
echo 'Industrial environment and Nginx HTTP site are prepared.'
