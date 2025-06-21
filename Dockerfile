# 1. Base Image
FROM node:20-alpine AS base
WORKDIR /app

# 2. Dependency Layer - 캐시 핵심 부분
COPY package*.json ./
RUN npm install

# 3. App Layer
COPY . .

# 4. Expose & Run
EXPOSE 3000
CMD ["npm", "run", "start"]

