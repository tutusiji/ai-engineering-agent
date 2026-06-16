/**
 * Skill registry — maps skill names from workflow YAML to SkillDefinition instances.
 */

import type { SkillDefinition } from '../../skill-sdk/src';

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
export { UI_CATALOG, getCompatibleLibraries, getUiLibrary, getLibrarySummary } from './ui-catalog';
export type { RequirementDocument } from './skills/interactive-requirement';
export {
  generateFullDocument,
  optimizeModule,
  mergeDocumentDeep,
  estimateCompleteness,
  type DocumentModule,
} from './document-generator';
