import type { CustomerIntakeInput } from './types.js';
import { ValidationError } from '../../shared/errors.js';

/**
 * Pure function: validates and structures customer intake documents.
 * Extracts key themes for signal customization.
 */

export interface ProcessedIntake {
  companyName: string;
  productDescription: string;
  valueProposition: string;
  painPointsSolved: string[];
  targetIndustries: string[];
  targetPersonas: string[];
  competitors: string[];
  competitorWeaknesses: string[];
  techAdjacencies: string[];
  caseStudyMetrics: string[];
  productTiers: string[];
}

export function processIntake(input: CustomerIntakeInput): ProcessedIntake {
  if (!input.companyName || input.companyName.trim().length === 0) {
    throw new ValidationError('Company name is required');
  }

  // Extract pain points from personas
  const painPointsSolved = (input.targetPersonas ?? [])
    .flatMap((p) => p.painPoints)
    .filter(Boolean);

  // Extract value prop from positioning + messaging
  const valueProposition = [input.positioning, input.messaging]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Not provided';

  // Extract competitor names and weaknesses
  const competitors = (input.competitors ?? []).map((c) => c.name).filter(Boolean);
  const competitorWeaknesses = (input.competitors ?? [])
    .flatMap((c) => c.weaknesses ?? [])
    .filter(Boolean);

  // Extract metrics from case studies
  const caseStudyMetrics = (input.caseStudies ?? [])
    .flatMap((cs) => cs.metrics ?? [])
    .filter(Boolean);

  // Extract persona titles
  const targetPersonas = (input.targetPersonas ?? [])
    .map((p) => p.title)
    .filter(Boolean);

  // Extract product tier names
  const productTiers = (input.packaging ?? [])
    .map((p) => `${p.tier}: ${p.description}`)
    .filter(Boolean);

  return {
    companyName: input.companyName.trim(),
    productDescription: input.productDescription?.trim() || 'Not provided',
    valueProposition,
    painPointsSolved,
    targetIndustries: input.targetIndustries ?? [],
    targetPersonas,
    competitors,
    competitorWeaknesses,
    techAdjacencies: input.techStackAdjacencies ?? [],
    caseStudyMetrics,
    productTiers,
  };
}

/**
 * Build the LLM prompt context from processed intake.
 * This gives the LLM everything it needs to customize signals.
 */
export function buildContextSummary(intake: ProcessedIntake): string {
  const sections: string[] = [];

  sections.push(`Company: ${intake.companyName}`);
  sections.push(`Product: ${intake.productDescription}`);
  sections.push(`Value Proposition: ${intake.valueProposition}`);

  if (intake.painPointsSolved.length > 0) {
    sections.push(`Pain Points Solved: ${intake.painPointsSolved.join(', ')}`);
  }
  if (intake.targetIndustries.length > 0) {
    sections.push(`Target Industries: ${intake.targetIndustries.join(', ')}`);
  }
  if (intake.targetPersonas.length > 0) {
    sections.push(`Target Personas: ${intake.targetPersonas.join(', ')}`);
  }
  if (intake.competitors.length > 0) {
    sections.push(`Competitors: ${intake.competitors.join(', ')}`);
  }
  if (intake.competitorWeaknesses.length > 0) {
    sections.push(`Competitor Weaknesses: ${intake.competitorWeaknesses.join(', ')}`);
  }
  if (intake.techAdjacencies.length > 0) {
    sections.push(`Tech Stack Adjacencies: ${intake.techAdjacencies.join(', ')}`);
  }
  if (intake.caseStudyMetrics.length > 0) {
    sections.push(`Proven Metrics: ${intake.caseStudyMetrics.join(', ')}`);
  }
  if (intake.productTiers.length > 0) {
    sections.push(`Product Tiers: ${intake.productTiers.join(' | ')}`);
  }

  return sections.join('\n');
}
