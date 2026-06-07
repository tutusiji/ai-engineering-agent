import type { JsonObject } from '../../../packages/shared-types/src';

export interface ScaffoldOptions {
  targetDir: string;
  apiContract: JsonObject;
  backendProfile: { framework: string; language: string; orm?: string };
}

export interface ScaffoldResult {
  ok: boolean;
  directories: string[];
  entryFiles: Array<{ path: string; content: string }>;
  error?: string;
}

const SCAFFOLD_TEMPLATES: Record<string, { dirs: string[]; files: Array<{ path: string; content: string }> }> = {
  nestjs: {
    dirs: ['src', 'src/modules', 'src/common', 'src/prisma', 'prisma', 'test'],
    files: [
      { path: 'src/main.ts', content: `import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  app.setGlobalPrefix('api/v1');\n  app.enableCors();\n  await app.listen(process.env.API_PORT ?? 3000);\n}\nbootstrap();` },
      { path: 'src/app.module.ts', content: `import { Module } from '@nestjs/common';\nimport { PrismaModule } from './prisma/prisma.module';\n\n@Module({\n  imports: [PrismaModule],\n  controllers: [],\n  providers: [],\n})\nexport class AppModule {}` },
      { path: 'src/prisma/prisma.module.ts', content: `import { Global, Module } from '@nestjs/common';\nimport { PrismaService } from './prisma.service';\n\n@Global()\n@Module({\n  providers: [PrismaService],\n  exports: [PrismaService],\n})\nexport class PrismaModule {}` },
      { path: 'src/prisma/prisma.service.ts', content: `import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';\nimport { PrismaClient } from '@prisma/client';\n\n@Injectable()\nexport class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {\n  async onModuleInit() {\n    await this.$connect();\n  }\n\n  async onModuleDestroy() {\n    await this.$disconnect();\n  }\n}` },
    ],
  },
  fastapi: {
    dirs: ['app', 'app/routers', 'app/models', 'app/schemas', 'app/core', 'migrations', 'tests'],
    files: [
      { path: 'app/main.py', content: `from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\n\napp = FastAPI(title="API", version="1.0.0")\n\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=["*"],\n    allow_credentials=True,\n    allow_methods=["*"],\n    allow_headers=["*"],\n)\n\n@app.get("/api/v1/health")\ndef health():\n    return {"status": "ok"}` },
    ],
  },
  gin: {
    dirs: ['cmd', 'internal', 'internal/handler', 'internal/model', 'internal/middleware', 'migrations'],
    files: [
      { path: 'cmd/main.go', content: `package main\n\nimport (\n    "github.com/gin-gonic/gin"\n)\n\nfunc main() {\n    r := gin.Default()\n    r.GET("/api/v1/health", func(c *gin.Context) {\n        c.JSON(200, gin.H{"status": "ok"})\n    })\n    r.Run(":3000")\n}` },
    ],
  },
};

export function scaffoldApi(options: ScaffoldOptions): ScaffoldResult {
  const { framework } = options.backendProfile;
  const template = SCAFFOLD_TEMPLATES[framework];
  if (!template) {
    return { ok: false, directories: [], entryFiles: [], error: `Unsupported backend framework: ${framework}. Supported: ${Object.keys(SCAFFOLD_TEMPLATES).join(', ')}` };
  }
  const directories = template.dirs.map(d => `${options.targetDir}/${d}`);
  const entryFiles = template.files.map(f => ({ path: `${options.targetDir}/${f.path}`, content: f.content }));
  return { ok: true, directories, entryFiles };
}
