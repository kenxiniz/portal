#!/bin/bash

# Exit immediately if any command fails
set -e

echo "[Deploy] Starting the build and deployment process."

# 1. Move to the Next.js application directory
echo "[Deploy] Navigating to the node-app directory."
cd node-app

# 2. Build the Next.js application
echo "[Deploy] Executing Next.js build (npm run build)..."
npm run build
echo "[Deploy] Next.js build completed successfully."

# 3. Return to the project root directory
echo "[Deploy] Returning to the project root directory."
cd ..

# 4. Rebuild and restart the Docker container
echo "[Deploy] Rebuilding and restarting the Docker container (node-app)..."
docker-compose up -d --build node-app

echo "[Deploy] Deployment process finished successfully."
