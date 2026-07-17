# node-app/Dockerfile.localbuild

# ===============================================================================
# STAGE: 프로덕션 러너 (Runner)
# ===============================================================================
FROM node:20-bullseye-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Disable Next.js telemetry to save memory and network bandwidth
ENV NEXT_TELEMETRY_DISABLED=1

# Set Node.js memory limit for the runtime environment to prevent OOM on 1GB EC2
ENV NODE_OPTIONS="--max-old-space-size=512"

# -------------------------------------------------------------------------
# [Step 1] Install dependencies and Chromium for Puppeteer
# -------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer 환경변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# -------------------------------------------------------------------------
# [Step 2] Setup Users and Groups
# -------------------------------------------------------------------------
RUN groupadd --system --gid 1001 appgroup
RUN useradd --system --uid 1001 --gid appgroup --shell /bin/false appuser

# -------------------------------------------------------------------------
# [Step 3] Copy Local Build Artifacts (Removing --from=builder)
# -------------------------------------------------------------------------
# 호스트(EC2)의 .next 폴더에서 직접 복사합니다.
# Change ownership to the created non-root user for security
COPY --chown=appuser:appgroup ./public ./public
COPY --chown=appuser:appgroup ./.next/standalone ./
COPY --chown=appuser:appgroup ./.next/static ./.next/static
COPY --chown=appuser:appgroup ./scripts ./scripts

# screenshots 폴더 생성
RUN mkdir -p /app/screenshots && chown appuser:appgroup /app/screenshots

# -------------------------------------------------------------------------
# [Step 4] Finalize
# -------------------------------------------------------------------------
# Switch to the securely created non-root user instead of default node user
USER appuser

EXPOSE 3000

# server.js is in the root of standalone output
# Wrap with dumb-init for safe process management
CMD ["dumb-init", "node", "server.js"]
