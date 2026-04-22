/**
 * Attribute Extractor — Extracts and normalizes account attributes for ICP weight analysis.
 *
 * Takes account data and produces a set of attribute key-value pairs that can
 * be compared across the power-law tier vs overall population.
 */

import type { Account } from '../../db/schema.js';
import type { AccountAttribute } from './types.js';

/**
 * Extract normalized attributes from an account for ICP analysis.
 */
export function extractAttributes(account: Account): AccountAttribute[] {
  const attrs: AccountAttribute[] = [];

  // Industry
  if (account.industry) {
    attrs.push({ attribute: 'industry', value: account.industry });
  }

  // Employee count range (bucketed)
  if (account.employeeCount != null) {
    attrs.push({
      attribute: 'employee_count_range',
      value: bucketEmployeeCount(account.employeeCount),
    });
  }

  // ACV range (bucketed)
  if (account.currentAcv != null) {
    const acv = parseFloat(account.currentAcv);
    if (acv > 0) {
      attrs.push({ attribute: 'acv_range', value: bucketAcv(acv) });
    }
  }

  // Usage trend
  if (account.usageTrend) {
    attrs.push({ attribute: 'usage_trend', value: account.usageTrend });
  }

  // CS Health Score range
  if (account.csHealthScore != null) {
    attrs.push({
      attribute: 'cs_health_range',
      value: bucketHealthScore(account.csHealthScore),
    });
  }

  // NPS range
  if (account.npsScore != null) {
    attrs.push({ attribute: 'nps_range', value: bucketNps(account.npsScore) });
  }

  // Tenure range
  if (account.tenureMonths != null) {
    attrs.push({
      attribute: 'tenure_range',
      value: bucketTenure(account.tenureMonths),
    });
  }

  // Support escalation (boolean as attribute)
  if (account.supportEscalationActive != null) {
    attrs.push({
      attribute: 'support_escalation',
      value: account.supportEscalationActive ? 'yes' : 'no',
    });
  }

  // Churn risk
  if (account.churnRiskActive != null) {
    attrs.push({
      attribute: 'churn_risk',
      value: account.churnRiskActive ? 'yes' : 'no',
    });
  }

  return attrs;
}

/**
 * Bucket employee count into standard ranges.
 */
export function bucketEmployeeCount(count: number): string {
  if (count < 50) return '1-49';
  if (count < 200) return '50-199';
  if (count < 500) return '200-499';
  if (count < 1000) return '500-999';
  if (count < 5000) return '1000-4999';
  return '5000+';
}

/**
 * Bucket ACV into standard ranges.
 */
export function bucketAcv(acv: number): string {
  if (acv < 30000) return 'under_30k';
  if (acv < 75000) return '30k_75k';
  if (acv < 250000) return '75k_250k';
  if (acv < 1000000) return '250k_1m';
  return '1m_plus';
}

/**
 * Bucket CS health score.
 */
export function bucketHealthScore(score: number): string {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'moderate';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

/**
 * Bucket NPS score.
 */
export function bucketNps(nps: number): string {
  if (nps >= 9) return 'promoter';
  if (nps >= 7) return 'passive';
  return 'detractor';
}

/**
 * Bucket tenure in months.
 */
export function bucketTenure(months: number): string {
  if (months < 6) return 'new';
  if (months < 12) return '6_12m';
  if (months < 24) return '1_2y';
  if (months < 48) return '2_4y';
  return '4y_plus';
}
