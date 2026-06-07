import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { JsonObject, TargetProfileRef } from '../../shared-types/src';

export interface PolicyRegistryOptions {
  policiesDir: string;
  targetPoliciesDir: string;
}

export interface BackendProfile {
  framework: string;
  language: string;
  orm?: string;
  patterns: string[];
  testing?: string[];
}

export interface DatabaseProfile {
  strategy: 'auto-recommend' | 'fixed';
  candidates?: string[];
  migration: 'auto' | 'manual';
}

export interface DeploymentProfile {
  strategy: 'docker-compose' | 'k8s' | 'static';
  components: string[];
}

export interface TargetProfileDefinition extends TargetProfileRef {
  uiLibrary?: string;
  routingMode?: string;
  styling?: string[];
  pagePatterns?: JsonObject;
  preferredPlugins?: JsonObject;
  validation?: JsonObject;
  backend?: BackendProfile;
  database?: DatabaseProfile;
  deployment?: DeploymentProfile;
}

export class FilePolicyRegistry {
  constructor(private readonly options: PolicyRegistryOptions) {}

  // 读取通用策略文件，例如 interaction-policy 或 testing-policy。
  async get(name: string): Promise<JsonObject | undefined> {
    const filePath = path.join(this.options.policiesDir, `${name}.yaml`);
    return this.readYamlObject(filePath);
  }

  async getTargetProfile(profileId: string): Promise<TargetProfileDefinition | undefined> {
    const filePath = path.join(this.options.targetPoliciesDir, `${profileId}.yaml`);
    const parsed = await this.readYamlObject(filePath);
    if (!parsed) {
      return undefined;
    }
    return parsed as unknown as TargetProfileDefinition;
  }

  async listTargetProfiles(): Promise<string[]> {
    const entries = await fs.readdir(this.options.targetPoliciesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
      .map((entry) => entry.name.replace(/\.yaml$/, ''))
      .sort();
  }

  private async readYamlObject(filePath: string): Promise<JsonObject | undefined> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`策略文件不是有效对象: ${filePath}`);
      }
      return parsed as JsonObject;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
