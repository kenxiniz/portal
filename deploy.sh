#!/bin/bash

# Exit immediately if any command fails
set -e

echo "[Deploy] Starting the build and deployment process."

# 1. Move to the Next.js application directory
echo "[Deploy] Navigating to the node-app directory."
cd node-app

# 2. 호스트(로컬) 환경에 의존성 패키지 설치 (여기가 핵심입니다!)
# 배포 전 포매팅(prettier)을 수행하려면 devDependencies가 필요하므로 확실하게 설치합니다.
echo "[Deploy] Installing dependencies for formatting and local build..."
#npm install

# 3. Build the Next.js application (이 안에서 npm run format이 자동으로 실행됩니다)
echo "[Deploy] Executing Next.js build (npm run build)..."
npm run build
echo "[Deploy] Next.js build completed successfully."

# 4. Return to the project root directory
echo "[Deploy] Returning to the project root directory."
cd ..

# 5. Rebuild and restart the Docker container
echo "[Deploy] Rebuilding and restarting the Docker container (node-app)..."
# 캐시 없이 깨끗하게 컨테이너를 다시 구워냅니다.
docker compose up -d --build --no-deps node-app

echo "[Deploy] Deployment process finished successfully."
