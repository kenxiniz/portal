#!/bin/bash
set -e

CERT_PATH="/etc/letsencrypt/live"   # 진짜 인증서가 존재하는 경로
LOG_FILE="/var/log/certbot/renew.log"
NGINX_CONTAINER="nginx_ssl"
DAYS_LIMIT=30

echo "🔨🤖🔧 Certbot auto-renew service started at $(date)" | tee -a "$LOG_FILE"
echo "[$(date)] Using CERT_PATH=${CERT_PATH}" | tee -a "$LOG_FILE"

while true; do
  echo "[$(date)] Checking certificates..." | tee -a "$LOG_FILE"

  # --- [디버깅] 경로 유효성 검사 ---
  if [ ! -d "$CERT_PATH" ]; then
    echo "⚠️  Directory not found: $CERT_PATH" | tee -a "$LOG_FILE"
    echo "🔍 Contents of /etc/letsencrypt for debugging:" | tee -a "$LOG_FILE"
    ls -alR /etc/letsencrypt | tee -a "$LOG_FILE" || echo "❌ Could not list /etc/letsencrypt" | tee -a "$LOG_FILE"
    echo "[$(date)] Next check in 1 hour." | tee -a "$LOG_FILE"
    sleep 3600
    continue
  fi

  # --- [실제 인증서 검색 및 처리] ---
  echo "🔍 Searching for domains in: $CERT_PATH" | tee -a "$LOG_FILE"
  find "$CERT_PATH" -mindepth 1 -maxdepth 1 -type d | tee -a "$LOG_FILE" | while read -r domain_dir; do
    echo "➡️  Checking $domain_dir ..." | tee -a "$LOG_FILE"
    fullchain_file="$domain_dir/fullchain.pem"

    if [ -f "$fullchain_file" ]; then
      cert_date=$(stat -c %Y "$fullchain_file")
      now=$(date +%s)
      age_days=$(( (now - cert_date) / 86400 ))

      echo " - $(basename "$domain_dir") cert age: ${age_days} days" | tee -a "$LOG_FILE"

      if [ "$age_days" -ge "$DAYS_LIMIT" ]; then
        echo "   ❗ Renewing certificate for $(basename "$domain_dir")..." | tee -a "$LOG_FILE"
        certbot renew --quiet --no-random-sleep-on-renew | tee -a "$LOG_FILE"
        echo "   🔄 Reloading Nginx container..." | tee -a "$LOG_FILE"
        docker exec "$NGINX_CONTAINER" nginx -s reload || echo "   ⚠️ Nginx reload failed" | tee -a "$LOG_FILE"
      fi
    else
      echo "⚠️  No fullchain.pem found in $domain_dir" | tee -a "$LOG_FILE"
    fi
  done

  echo "[$(date)] Next check in 1 hour." | tee -a "$LOG_FILE"
  sleep 3600
done
