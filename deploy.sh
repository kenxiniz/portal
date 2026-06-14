#!/bin/bash

set -e

echo "[Deploy] Starting the validation and deployment process."

echo "Stopping existing node-app and redis containers..."
docker stop node-app || true
docker stop redis_cache || true

echo "[Deploy] Navigating to the node-app directory."
cd node-app

echo "[Deploy] Running Prettier auto-formatting (--write)..."
npx prettier --write .

echo "[Deploy] Running ESLint syntax and rule verification..."
NODE_OPTIONS="--max-old-space-size=2048" npm run lint

echo "[Deploy] Purging old Next.js build cache..."
rm -rf .next

echo "[Deploy] Building the Next.js application on host..."
NODE_OPTIONS="--max-old-space-size=2048" npm run build

echo "[Deploy] Returning to the project root directory."
cd ..

echo "[Deploy] Rebuilding and restarting the Docker container (node-app)..."
docker compose up -d --build --force-recreate --no-deps node-app

echo "[Deploy] Restarting Nginx to resolve the new internal IP address..."
docker restart nginx_ssl
docker restart redis_cache

echo "[Deploy] Deployment process finished successfully."