#!/bin/sh
set -eu

escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

API_UPSTREAM="${API_UPSTREAM:-http://api:8080}"
export API_UPSTREAM

printf 'window.__APP_CONFIG__ = { apiBaseUrl: "%s", docsUrl: "%s", grafanaUrl: "%s" };\n' \
    "$(escape "${WEB_API_BASE_URL:-/api/v1}")" \
    "$(escape "${WEB_DOCS_URL:-/api/v1/docs}")" \
    "$(escape "${WEB_GRAFANA_URL:-}")" \
    > /usr/share/nginx/html/config.js

envsubst '${API_UPSTREAM}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
