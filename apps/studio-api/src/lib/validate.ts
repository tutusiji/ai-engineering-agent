/**
 * validate — 统一的 Zod schema 校验
 */

import { z } from 'zod';

export const SessionIdParamSchema = z.object({
  id: z.string().min(1),
});

export const CreateSessionSchema = z.object({
  profileId: z.string().optional(),
  name: z.string().optional(),
});

export const UpdateSessionSchema = z.object({
  name: z.string().min(1).optional(),
  profileId: z.string().optional(),
  featureName: z.string().optional(),
});

export const ChatSchema = z.object({
  sessionId: z.string().min(1).default('default'),
  profileId: z.string().optional(),
  userMessage: z.string().min(1, 'userMessage is required'),
  mode: z.string().default('gather'),
});

export const DocumentGenerateSchema = z.object({
  sessionId: z.string().min(1, 'sessionId required'),
});

export const DocumentOptimizeSchema = z.object({
  sessionId: z.string().min(1, 'sessionId required'),
  module: z.string().min(1, 'module required'),
  instruction: z.string().min(1, 'instruction required'),
});

export const GenerateSchema = z.object({
  sessionId: z.string().min(1).default('default'),
  profileId: z.string().optional(),
  phaseId: z.string().default('P1'),
});

export const SwitchModelSchema = z.object({
  modelId: z.string().min(1, 'modelId required'),
});

export const ActiveDesignSchema = z.object({
  designId: z.string().min(1, 'designId required'),
});

export const ActiveArchitectureSchema = z.object({
  architectureId: z.string().min(1, 'architectureId required'),
});

export const SaveArchitectureSchema = z.object({
  architecture: z.record(z.unknown()),
  markdown: z.string().min(1, 'markdown required'),
  model: z.string().optional(),
});

export const WorkflowRunSchema = z.object({
  profileId: z.string().optional(),
  sessionId: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});

export const RunApprovalSchema = z.object({
  by: z.string().default('user'),
  comment: z.string().optional(),
});

export const ArtifactDownloadSchema = z.object({
  id: z.string().optional(),
  ids: z.string().optional(),
});
