/**
 * Skill registry — maps skill names from workflow YAML to SkillDefinition instances.
 */

import type { SkillDefinition } from '@ai-engineering-agent/skill-sdk';

// Existing skills
import { requirementAnalysisSkill } from './skills/requirement-analysis';
import { targetProfileSelectionSkill } from './skills/target-profile-selection';
import { pagePlanningSkill } from './skills/page-planning';
import { frontendCodingSkill } from './skills/frontend-coding';

// New skills for interactive requirement flow
import { interactiveRequirementSkill } from './skills/interactive-requirement';
import { designGenerationSkill } from './skills/design-generation';
import { codeGenerationSkill } from './skills/code-generation';
import { uiLibrarySelectionSkill } from './skills/ui-library-selection';

// New fullstack skills
import { dataModelingSkill } from './skills/data-modeling';
import { apiDesignSkill } from './skills/api-design';
import { backendCodingSkill } from './skills/backend-coding';
import { deploymentPlanningSkill } from './skills/deployment-planning';
import { architecturePlanningSkill } from './skills/architecture-planning';

export const skillRegistry: Record<string, SkillDefinition> = {
  // Original workflow skills
  'requirement-analysis': requirementAnalysisSkill,
  'target-profile-selection': targetProfileSelectionSkill,
  'page-planning': pagePlanningSkill,
  'frontend-coding-core': frontendCodingSkill,

  // Interactive requirement flow skills
  'interactive-requirement': interactiveRequirementSkill,
  'design-generation': designGenerationSkill,
  'code-generation': codeGenerationSkill,
  'ui-library-selection': uiLibrarySelectionSkill,

  // Fullstack skills
  'data-modeling': dataModelingSkill,
  'api-design': apiDesignSkill,
  'backend-coding': backendCodingSkill,
  'deployment-planning': deploymentPlanningSkill,
  'architecture-planning': architecturePlanningSkill,
};

export function getSkill(name: string): SkillDefinition | undefined {
  return skillRegistry[name];
}

export { runSkillThroughLlm, extractJson, type AgentRunResult } from './agent-runner';
export { chatCompletion, loadLlmConfigFromEnv, type LlmConfig, type LlmCallResult } from './llm-client';
export { extractRequirementInfo, mergeDocument, type ExtractedInfo } from './requirement-extractor';
export { requirementAnalysisSkill } from './skills/requirement-analysis';
export { targetProfileSelectionSkill } from './skills/target-profile-selection';
export { pagePlanningSkill } from './skills/page-planning';
export { frontendCodingSkill } from './skills/frontend-coding';
export { interactiveRequirementSkill } from './skills/interactive-requirement';
export { designGenerationSkill } from './skills/design-generation';
export { codeGenerationSkill } from './skills/code-generation';
export { uiLibrarySelectionSkill } from './skills/ui-library-selection';
export { dataModelingSkill } from './skills/data-modeling';
export { apiDesignSkill } from './skills/api-design';
export { backendCodingSkill } from './skills/backend-coding';
export { deploymentPlanningSkill } from './skills/deployment-planning';
export { architecturePlanningSkill } from './skills/architecture-planning';
export { UI_CATALOG, getCompatibleLibraries, getUiLibrary, getLibrarySummary } from './ui-catalog';
export type { RequirementDocument } from './skills/interactive-requirement';
export {
  generateFullDocument,
  optimizeModule,
  mergeDocumentDeep,
  estimateCompleteness,
  type DocumentModule,
} from './document-generator';
