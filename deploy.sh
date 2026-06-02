#!/bin/bash

# Exit immediately if any command fails
set -e

echo "[Deploy] Starting the validation and deployment process."

# 1. Move to the Next.js application directory
echo "[Deploy] Navigating to the node-app directory."
cd node-app

# 2. Run Prettier auto-formatting and ESLint verification
echo "[Deploy] Running Prettier auto-formatting (--write)..."
npx prettier --write .

echo "[Deploy] Running ESLint syntax and rule verification..."
NODE_OPTIONS="--max-old-space-size=1024" npm run lint

# 3. Purge old Next.js build cache to prevent ghost builds
echo "[Deploy] Purging old Next.js build cache..."
rm -rf .next

# 4. Build the application on the host machine
echo "[Deploy] Building the Next.js application on host..."
# Apply memory limit to prevent host OOM killer during build
NODE_OPTIONS="--max-old-space-size=1024" npm run build

# 5. Return to the project root directory
echo "[Deploy] Returning to the project root directory."
cd ..

# 6. Rebuild and restart the Docker container
echo "[Deploy] Rebuilding and restarting the Docker container (node-app)..."
# Docker will now use the freshly built .next directory from the host
docker compose up -d --build --force-recreate --no-deps node-app

# 7. Nginx 재시작을 통해 새로 할당된 node-app의 내부 IP를 갱신
echo "[Deploy] Restarting Nginx to resolve the new internal IP address..."
docker restart nginx_ssl

echo "[Deploy] Deployment process finished successfully."