export interface DockerGenInput {
  appName: string; backendPort: number; frontendPort: number; dbType: string; services: string[];
}
export interface DockerGenResult {
  ok: boolean; files: Array<{ path: string; content: string }>;
}

const TEMPLATES = {
  dockerfileApi: (appName: string) => `# ─── API Service ───
FROM node:22-alpine AS builder
WORKDIR /app
COPY api/package*.json api/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY api/ ./
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]`,

  dockerfileWeb: `# ─── Web Service (Nginx) ───
FROM node:22-alpine AS builder
WORKDIR /app
COPY web/package*.json web/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,

  dockerCompose: (appName: string, dbType: string) => `version: '3.8'

services:
  nginx:
    build:
      context: .
      dockerfile: deploy/Dockerfile.web
    ports:
      - "80:80"
    depends_on:
      api:
        condition: service_healthy
    networks:
      - ${appName}-net

  api:
    build:
      context: .
      dockerfile: deploy/Dockerfile.api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=\${DATABASE_URL}
      - JWT_SECRET=\${JWT_SECRET}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ${appName}-net

  db:
    image: ${dbType}:alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: \${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "\${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ${appName}-net

volumes:
  pgdata:

networks:
  ${appName}-net:
    driver: bridge`,

  nginxConf: `server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /events/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}`,

  envExample: (appName: string) => `# ${appName} — Environment Variables
DATABASE_URL=postgresql://studio:studio2026@db:5432/${appName}
DB_USER=studio
DB_PASSWORD=studio2026
DB_NAME=${appName}
JWT_SECRET=change-me-to-a-random-string
API_PORT=3000
NODE_ENV=production`,
};

export function generateDocker(input: DockerGenInput): DockerGenResult {
  const { appName, dbType } = input;
  return {
    ok: true,
    files: [
      { path: 'deploy/Dockerfile.api', content: TEMPLATES.dockerfileApi(appName) },
      { path: 'deploy/Dockerfile.web', content: TEMPLATES.dockerfileWeb },
      { path: 'deploy/docker-compose.yml', content: TEMPLATES.dockerCompose(appName, dbType) },
      { path: 'deploy/nginx/default.conf', content: TEMPLATES.nginxConf },
      { path: 'deploy/.env.example', content: TEMPLATES.envExample(appName) },
    ],
  };
}
