import { assertSpeechFree } from './firewall';
import { dialogueWithModel, rankWithModel, readModelConfig } from './model';
import { applyProcessMarkPayloads, buildSnapshot, type SnapshotInput } from './snapshot';
import { runPlaybook } from './playbook';
import type { CopilotResult } from './types';

export { COPILOT_DISCLOSURE } from './types';
export { assertSpeechFree } from './firewall';
export { runPlaybook, inferStage, buildMinuteOutline } from './playbook';
export { buildSnapshot, applyProcessMarkPayloads } from './snapshot';
export { mergeModelOutput, readModelConfig, copilotStatus, dialogueWithModel } from './model';
export { AGENT_RULES, AGENT_ROOM_RULES, looksLikeSpeechPaste, SPEECH_REFUSAL, LEGAL_REFUSAL } from './rules';
export type { CopilotResult, CopilotAction, ProcessSnapshot, ProcessStage } from './types';
export { TECHNIQUES, TECHNIQUE_IDS, selectTechnique, detectLooping } from './techniques';
export type { TechniqueId, TechniqueMove } from './techniques';

export type AdviseInput = SnapshotInput & { processMarkPayloads?: Array<string | undefined> };

export function snapshotFromInput(input: AdviseInput) {
  let snapshot = buildSnapshot(input);
  if (input.processMarkPayloads) {
    snapshot = applyProcessMarkPayloads(snapshot, input.processMarkPayloads);
  }
  assertSpeechFree(snapshot);
  return snapshot;
}

export async function advise(input: AdviseInput): Promise<CopilotResult> {
  const snapshot = snapshotFromInput(input);
  const playbook = runPlaybook(snapshot);
  const cfg = readModelConfig();
  if (!cfg) return playbook;
  try {
    return await rankWithModel(snapshot, playbook, cfg);
  } catch {
    return playbook;
  }
}

export async function ask(input: AdviseInput, question: string) {
  const snapshot = snapshotFromInput(input);
  try {
    return await dialogueWithModel(snapshot, question, readModelConfig());
  } catch {
    return dialogueWithModel(snapshot, question, null);
  }
}
