import type { LLMAdapter } from '../../integrations/llm/interface.js';
import type { MasterSignal, CustomizationResult, GuideGenerationResult } from './types.js';
import type { ProcessedIntake } from './intake-processor.js';
import { buildContextSummary } from './intake-processor.js';
import type { ResearchResult } from './research-orchestrator.js';

/**
 * Pure-ish function: takes master signals + customer context + research,
 * uses LLM to produce customized signal guide.
 * The LLM adapter is injected for testability.
 */

export interface GenerateGuideInput {
  masterSignals: MasterSignal[];
  intake: ProcessedIntake;
  research: ResearchResult;
}

export interface GeneratedSignal {
  masterSignal: MasterSignal;
  customizedName: string;
  customizedDescription: string;
  customizedPlaybook: string;
  relevanceScore: number;
  exampleTriggers: string[];
  active: boolean;
}

const RELEVANCE_ACTIVE_THRESHOLD = 30; // Signals below this are flagged inactive

export async function generateCustomGuide(
  input: GenerateGuideInput,
  llm: LLMAdapter
): Promise<GeneratedSignal[]> {
  const contextSummary = buildContextSummary(input.intake);
  const researchSummary = buildResearchSummary(input.research);

  const results: GeneratedSignal[] = [];

  for (const signal of input.masterSignals) {
    const customization = await customizeSignal(signal, contextSummary, researchSummary, llm);

    results.push({
      masterSignal: signal,
      customizedName: customization.customizedName,
      customizedDescription: customization.customizedDescription,
      customizedPlaybook: customization.customizedPlaybook,
      relevanceScore: customization.relevanceScore,
      exampleTriggers: customization.exampleTriggers,
      active: customization.relevanceScore >= RELEVANCE_ACTIVE_THRESHOLD,
    });
  }

  return results;
}

/**
 * Summarize the generation results without returning full signal data.
 */
export function summarizeGuide(signals: GeneratedSignal[]): GuideGenerationResult {
  const active = signals.filter((s) => s.active);
  const inactive = signals.filter((s) => !s.active);

  const byTag: Record<string, { total: number; active: number; avgRelevance: number }> = {};
  for (const signal of signals) {
    const tag = signal.masterSignal.tag;
    if (!byTag[tag]) byTag[tag] = { total: 0, active: 0, avgRelevance: 0 };
    byTag[tag].total++;
    if (signal.active) byTag[tag].active++;
    byTag[tag].avgRelevance += signal.relevanceScore;
  }
  for (const tag of Object.keys(byTag)) {
    byTag[tag].avgRelevance = Math.round(byTag[tag].avgRelevance / byTag[tag].total);
  }

  const topSignals = [...signals]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10)
    .map((s) => ({
      name: s.customizedName,
      relevance: s.relevanceScore,
      tag: s.masterSignal.tag,
    }));

  return {
    customerContextId: '', // Filled by the caller
    totalSignals: signals.length,
    activeSignals: active.length,
    inactiveSignals: inactive.length,
    byTag,
    topSignals,
  };
}

// ─── Internal ───

async function customizeSignal(
  signal: MasterSignal,
  contextSummary: string,
  researchSummary: string,
  llm: LLMAdapter
): Promise<CustomizationResult> {
  const prompt = `You are customizing a B2B prospecting signal for a specific company.

## Master Signal
Name: ${signal.signalName}
Category: ${signal.tag}
Why it matters: ${signal.whyItMatters}
Strength: ${signal.strength}
Funnel stage: ${signal.funnelStage}
${signal.playbook ? `Playbook: ${signal.playbook}` : ''}

## Customer Context
${contextSummary}

## Market Research
${researchSummary}

## Instructions
Customize this signal for this specific company. Return a JSON object with:
- "customizedName": The signal name adapted to reference specific competitors, products, or personas relevant to this company (keep concise, under 15 words)
- "customizedDescription": How this signal specifically applies to this company's product, market, and buyers (2-3 sentences)
- "customizedPlaybook": Specific action steps when this signal is detected, referencing the company's product, case studies, and value prop (2-3 sentences)
- "relevanceScore": 0-100 how relevant this signal is for this company (0 = not applicable, 100 = critical). Consider: does this company have a PLG motion? Do they sell to enterprises? Are they in a regulated industry?
- "exampleTriggers": Array of 2-3 concrete examples of this signal occurring in this company's market

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await llm.generateContent(prompt, { temperature: 0.3, maxTokens: 500 });
    const parsed = JSON.parse(response) as CustomizationResult;

    return {
      customizedName: parsed.customizedName || signal.signalName,
      customizedDescription: parsed.customizedDescription || signal.whyItMatters,
      customizedPlaybook: parsed.customizedPlaybook || signal.playbook || '',
      relevanceScore: clamp(parsed.relevanceScore ?? 50, 0, 100),
      exampleTriggers: Array.isArray(parsed.exampleTriggers) ? parsed.exampleTriggers : [],
    };
  } catch {
    // Fallback: return the master signal with moderate relevance
    return {
      customizedName: signal.signalName,
      customizedDescription: signal.whyItMatters,
      customizedPlaybook: signal.playbook || '',
      relevanceScore: 50,
      exampleTriggers: [],
    };
  }
}

function buildResearchSummary(research: ResearchResult): string {
  const sections: string[] = [];

  if (research.industryTrends.length > 0) {
    sections.push(`Industry Trends: ${research.industryTrends.slice(0, 5).join('; ')}`);
  }
  if (research.competitorInsights.length > 0) {
    const insights = research.competitorInsights
      .slice(0, 5)
      .map((c) => `${c.competitor}: ${c.findings.slice(0, 2).join('; ')}`)
      .join('\n');
    sections.push(`Competitor Insights:\n${insights}`);
  }
  if (research.marketDynamics.length > 0) {
    sections.push(`Market Dynamics: ${research.marketDynamics.slice(0, 3).join('; ')}`);
  }
  if (research.techLandscape.length > 0) {
    sections.push(`Tech Landscape: ${research.techLandscape.slice(0, 5).join(', ')}`);
  }

  return sections.join('\n\n');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
