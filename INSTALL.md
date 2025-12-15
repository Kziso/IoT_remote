# IoT Remote UI インストール手順

Raspberry Pi に nginx を入れて、PC / Mobile 向け UI を `/pc/` `/m/` で公開するための簡易手順です。  
開発マシンは Windows を想定し、`ui4mobile.tgz` と `ui4pc.tgz`　が手元にある前提。

---

## 1. 前提条件

- Raspberry Pi にSSH ログインできること
- Raspberrypiに設定したhost名、ユーザ名を、PWを思い出しておいてください。

---

## 2. Raspberry Pi 側セットアップ

SSH で RaspberryPi にログインし、以下を実行します。

```bash
sudo apt update
sudo apt install -y nginx
sudo mkdir -p /var/www/html/m /var/www/html/pc 
mkdir -p ~/work/temp
sudo chown -R $USER:$USER /var/www/html
```

nginx の既定サイト（`/etc/nginx/sites-available/default`）を下記のように調整します。`location /m/` と `location /pc/` を追加するだけで最低限動作します。

```nginx
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
```

設定後に nginx を再読み込みします。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3. Windows → Raspberry Pi へのデプロイ

1. WindowsのPowershellで操作
   ui4mobile.tgzと、ui4pc.tgzの2つのファイルをRaspberryPiに入れる。
   2つのファイルがあるディレクトリに、PowerShellで移動して、以下のコマンドを実行する。
   ユーザ名　isoとホスト名 web-cotrollerのところは、自身がアクセスするRaspberrypiに併せて修正すること。

   `scp ui4mobile.tgz iso@web-controller.local:~/work/temp/`  
   `scp ui4pc.tgz iso@web-controller.local:~/work/temp/`

2. Pi に SSH し、以下を実行:
   ```bash
   cd work/temp/
   sudo tar -xzf ui4mobile.tgz -C /var/www/html/m 
   sudo tar -xzf ui4pc.tgz -C /var/www/html/pc 
   rm ui4mobile.tgz ui4pc.tgz
   ```

---

## 4. 動作確認

ブラウザから以下へアクセスして UI の動作を確認します。

- Mobile UI: `http://<raspberry pi の IP>/m/`
- PC UI: `http://<raspberry pi の IP>/pc/`

表示がおかしい場合は nginx ログ（`/var/log/nginx/error.log`）やブラウザの DevTools で 404/403 が出ていないか確認してください。

以上でセットアップ完了です。次回以降は `.tgz` を更新して再度 `deploy-tgz.ps1` を実行するだけで UI を更新できます。
