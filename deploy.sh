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
# Apply memory limit to prevent host OOM killer during linting
NODE_OPTIONS="--max-old-space-size=4096" npm run lint

# 3. Return to the project root directory
echo "[Deploy] Returning to the project root directory."
cd ..

# 4. Rebuild and restart the Docker container
echo "[Deploy] Rebuilding and restarting the Docker container (node-app)..."
# Docker will focus solely on building the app without redundant lint checks
docker compose up -d --build --no-deps node-app

echo "[Deploy] Deployment process finished successfully."