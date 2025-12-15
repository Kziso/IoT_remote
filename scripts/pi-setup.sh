#!/usr/bin/env bash
set -euo pipefail

DOC_ROOT="/var/www/html"
NGINX_DEFAULT="/etc/nginx/sites-available/default"

sudo apt update
sudo apt install -y nginx

sudo mkdir -p "${DOC_ROOT}/m" "${DOC_ROOT}/pc"
sudo chown -R "$USER":"$USER" "${DOC_ROOT}"

sudo tee "${NGINX_DEFAULT}" >/dev/null <<'CONF'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /m/ {
        alias /var/www/html/m/;
        try_files $uri $uri/ /m/index.html;
    }

    location /pc/ {
        alias /var/www/html/pc/;
        try_files $uri $uri/ /pc/index.html;
    }
}
CONF

sudo nginx -t
sudo systemctl reload nginx
