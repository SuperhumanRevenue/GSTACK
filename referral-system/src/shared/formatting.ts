import type { ScoringResult, ReadinessTier } from './types.js';

export function formatScore(score: number, max: number): string {
  return `${score}/${max}`;
}

export function formatTierEmoji(tier: ReadinessTier): string {
  switch (tier) {
    case 'hot':
      return 'HOT';
    case 'warm':
      return 'WARM';
    case 'not_yet':
      return 'NOT YET';
  }
}

export function formatScoringResult(result: ScoringResult): string {
  const lines = [
    `## Readiness Score: ${result.totalScore}/100 [${formatTierEmoji(result.tier)}]`,
    '',
    '### Dimensions',
    `| Dimension | Score |`,
    `|-----------|-------|`,
    `| Value Delivered | ${formatScore(result.dimensions.valueDelivered, 25)} |`,
    `| Relationship Strength | ${formatScore(result.dimensions.relationshipStrength, 20)} |`,
    `| Recency of Win | ${formatScore(result.dimensions.recencyOfWin, 20)} |`,
    `| Network Value | ${formatScore(result.dimensions.networkValue, 20)} |`,
    `| Ask History | ${formatScore(result.dimensions.askHistory, 15)} |`,
    '',
  ];

  if (result.triggerEvent) {
    lines.push(`**Trigger Event:** ${result.triggerEvent}`);
  }

  if (result.antiTriggers.length > 0) {
    lines.push(`**Anti-Triggers:** ${result.antiTriggers.join(', ')}`);
  }

  lines.push('', `**Rationale:** ${result.rationale}`);
  lines.push(`**Recommended Action:** ${result.recommendedAction}`);

  return lines.join('\n');
}

export function toMarkdownTable(
  headers: string[],
  rows: string[][]
): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map((row) => `| ${row.join(' | ')} |`);
  return [headerRow, separator, ...dataRows].join('\n');
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
