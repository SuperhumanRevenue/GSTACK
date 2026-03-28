import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../../shared/types.js';
import { buildPackage } from './package-builder.js';
import { calculateRewardCeiling, calculateAnnualBudget, projectROI, estimateReferralVolume } from './economics-engine.js';
import { matchCompany } from './company-matcher.js';
import { matchReferrer } from './referrer-matcher.js';
import { getMultiplierForCount } from './escalation-engine.js';
import { formatCurrency } from '../../shared/formatting.js';
import type { CompanyProfile, ReferrerProfile, IndustryNorms } from './types.js';

export function registerIncentiveTools(server: McpServer, deps: ServerDeps) {
  // ─── Tool 1: Design package for specific referrer ───
  server.tool(
    'referral_incentive_design_package',
    'Design a personalized incentive package for a specific champion based on company + referrer profile',
    {
      // Company profile
      company_name: z.string(),
      company_stage: z.enum(['startup', 'growth', 'enterprise']),
      company_arr: z.number(),
      company_industry: z.string(),
      avg_acv: z.number(),
      acv_range_low: z.number(),
      acv_range_high: z.number(),
      current_outbound_cac: z.number(),
      customer_count: z.number(),
      is_regulated: z.boolean().optional().default(false),
      // Referrer profile
      referrer_seniority: z.enum(['c_suite', 'vp', 'director', 'manager']),
      referrer_motivation: z.enum(['altruistic', 'reciprocal', 'economic', 'status']),
      super_referrer_tier: z.enum(['platinum', 'gold', 'silver', 'bronze']).optional(),
    },
    async (input) => {
      try {
        const company: CompanyProfile = {
          name: input.company_name,
          stage: input.company_stage,
          arr: input.company_arr,
          industry: input.company_industry,
          avgAcv: input.avg_acv,
          acvRange: { low: input.acv_range_low, high: input.acv_range_high },
          currentOutboundCac: input.current_outbound_cac,
          customerCount: input.customer_count,
          isRegulated: input.is_regulated,
        };

        const referrer: ReferrerProfile = {
          seniority: input.referrer_seniority,
          motivation: input.referrer_motivation,
          superReferrerTier: input.super_referrer_tier,
        };

        const pkg = buildPackage(company, referrer);

        const lines = [
          `# Incentive Package: ${input.company_name}`,
          '',
          '## Primary Reward',
          `- **Category:** ${pkg.primaryReward.category}`,
          `- **Description:** ${pkg.primaryReward.description}`,
          `- **Estimated Cost:** ${formatCurrency(pkg.primaryReward.cost)}`,
          `- **Timing:** ${pkg.primaryReward.timing}`,
          '',
          '## Secondary Reward',
          `- **Category:** ${pkg.secondaryReward.category}`,
          `- **Description:** ${pkg.secondaryReward.description}`,
          `- **Estimated Cost:** ${formatCurrency(pkg.secondaryReward.cost)}`,
          `- **Timing:** ${pkg.secondaryReward.timing}`,
          '',
          '## Economics',
          `- **Total Cost Per Referral:** ${formatCurrency(pkg.totalCostPerReferral)}`,
          `- **Reward Ceiling:** ${formatCurrency(pkg.rewardCeiling)} (30% of outbound CAC)`,
          `- **CAC Savings:** ${Math.round(pkg.cacSavingsPct * 100)}%`,
          '',
          '## Ongoing Benefits',
          ...pkg.ongoingBenefits.map((b) => `- ${b}`),
          '',
          '## Escalation Path',
          ...pkg.escalationPath.map((s) => `- **Referral #${s.referralNumber}:** ${s.rewardChange} (${s.multiplier}x)`),
          '',
          '## Language Guidance',
          `**Use:** ${pkg.languageGuidance.toUse.join(', ')}`,
          `**Avoid:** ${pkg.languageGuidance.toAvoid.join(', ')}`,
        ];

        if (pkg.edgeCaseNotes.length > 0) {
          lines.push('', '## Notes', ...pkg.edgeCaseNotes.map((n) => `- ${n}`));
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error designing package: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 2: Design program-wide incentive structure ───
  server.tool(
    'referral_incentive_design_program',
    'Design a complete referral incentive program for a company with budget, tiers, and ROI projection',
    {
      company_name: z.string(),
      company_stage: z.enum(['startup', 'growth', 'enterprise']),
      company_arr: z.number(),
      company_industry: z.string(),
      avg_acv: z.number(),
      acv_range_low: z.number(),
      acv_range_high: z.number(),
      current_outbound_cac: z.number(),
      customer_count: z.number(),
      is_regulated: z.boolean().optional().default(false),
      expected_close_rate: z.number().optional().default(0.25),
    },
    async (input) => {
      try {
        const company: CompanyProfile = {
          name: input.company_name,
          stage: input.company_stage,
          arr: input.company_arr,
          industry: input.company_industry,
          avgAcv: input.avg_acv,
          acvRange: { low: input.acv_range_low, high: input.acv_range_high },
          currentOutboundCac: input.current_outbound_cac,
          customerCount: input.customer_count,
          isRegulated: input.is_regulated,
        };

        const rewardCeiling = calculateRewardCeiling(company.currentOutboundCac);
        const expectedVolume = estimateReferralVolume(company.customerCount);
        const annualBudget = calculateAnnualBudget(rewardCeiling, expectedVolume);
        const roi = projectROI({
          company,
          expectedReferralsPerYear: expectedVolume,
          expectedCloseRate: input.expected_close_rate,
          programCost: annualBudget,
        });

        // Build sample packages for different referrer types
        const defaultPkg = buildPackage(company, { seniority: 'director', motivation: 'reciprocal' });
        const companyMatch = matchCompany(company);

        const lines = [
          `# Referral Incentive Program: ${input.company_name}`,
          '',
          '## Company Profile',
          `- **Stage:** ${input.company_stage}`,
          `- **ARR:** ${formatCurrency(input.company_arr)}`,
          `- **Avg ACV:** ${formatCurrency(input.avg_acv)}`,
          `- **Customers:** ${input.customer_count}`,
          `- **Outbound CAC:** ${formatCurrency(input.current_outbound_cac)}`,
          '',
          '## Program Economics',
          `- **Reward Ceiling:** ${formatCurrency(rewardCeiling)} per referral (30% of outbound CAC)`,
          `- **Expected Referrals/Year:** ${expectedVolume}`,
          `- **Annual Budget:** ${formatCurrency(annualBudget)}`,
          '',
          '## ROI Projection',
          `- **Expected Closed Deals:** ${Math.round(roi.expectedReferrals * roi.expectedCloseRate)}`,
          `- **Expected Revenue:** ${formatCurrency(roi.expectedRevenue)}`,
          `- **ROI Multiple:** ${roi.roiMultiple.toFixed(1)}x`,
          '',
          '## Reward Strategy',
          `- **Primary Category:** ${companyMatch.primaryCategory} — ${companyMatch.rationale}`,
          `- **Secondary Category:** ${companyMatch.secondaryCategory}`,
          '',
          '## Default Package',
          `- **Primary:** ${defaultPkg.primaryReward.description} (${formatCurrency(defaultPkg.primaryReward.cost)})`,
          `- **Secondary:** ${defaultPkg.secondaryReward.description} (${formatCurrency(defaultPkg.secondaryReward.cost)})`,
          `- **Total Cost:** ${formatCurrency(defaultPkg.totalCostPerReferral)}`,
          '',
          '## Escalation Ladder',
          ...defaultPkg.escalationPath.map((s) => `- **Referral #${s.referralNumber}:** ${s.rewardChange} (${s.multiplier}x)`),
        ];

        if (companyMatch.complianceWarnings.length > 0) {
          lines.push('', '## Compliance Warnings', ...companyMatch.complianceWarnings.map((w) => `- ${w}`));
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error designing program: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 3: Evaluate existing package ───
  server.tool(
    'referral_incentive_evaluate',
    'Evaluate whether a proposed reward is within budget constraints and appropriate for the context',
    {
      outbound_cac: z.number(),
      proposed_reward_cost: z.number(),
      referrer_seniority: z.enum(['c_suite', 'vp', 'director', 'manager']),
      referral_count: z.number().describe('How many referrals this person has made'),
      company_stage: z.enum(['startup', 'growth', 'enterprise']),
      is_regulated: z.boolean().optional().default(false),
    },
    async (input) => {
      try {
        const ceiling = calculateRewardCeiling(input.outbound_cac);
        const multiplier = getMultiplierForCount(input.referral_count);
        const adjustedCeiling = Math.round(ceiling * multiplier);
        const withinBudget = input.proposed_reward_cost <= adjustedCeiling;

        const lines = [
          '# Reward Evaluation',
          '',
          `**Proposed Cost:** ${formatCurrency(input.proposed_reward_cost)}`,
          `**Reward Ceiling:** ${formatCurrency(ceiling)} (base) → ${formatCurrency(adjustedCeiling)} (with ${multiplier}x multiplier for ${input.referral_count} referrals)`,
          `**Within Budget:** ${withinBudget ? 'Yes' : 'NO — exceeds ceiling'}`,
          '',
        ];

        if (!withinBudget) {
          lines.push(`**Recommendation:** Reduce reward to ${formatCurrency(adjustedCeiling)} or below.`);
        }

        if (input.is_regulated) {
          lines.push('**Compliance:** Regulated industry — ensure reward is non-monetary (recognition, donation).');
        }

        if (input.referrer_seniority === 'c_suite' && input.proposed_reward_cost > 0) {
          lines.push('**Note:** C-suite referrers typically prefer access/recognition over monetary rewards.');
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error evaluating: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ─── Tool 4: Get industry norms ───
  server.tool(
    'referral_incentive_get_industry_norms',
    'Get referral incentive benchmarks and norms for a specific industry',
    {
      industry: z.string(),
      company_stage: z.enum(['startup', 'growth', 'enterprise']).optional(),
    },
    async (input) => {
      try {
        const norms = getIndustryNorms(input.industry, input.company_stage);

        const lines = [
          `# Industry Norms: ${norms.industry}`,
          '',
          `**Avg Reward Value:** ${formatCurrency(norms.avgRewardValue)}`,
          '',
          '## Common Reward Types',
          ...norms.commonRewardTypes.map((t) => `- ${t}`),
          '',
          '## Benchmarks',
          ...norms.benchmarks.map((b) => `- **${b.metric}:** ${b.value}`),
        ];

        if (norms.complianceNotes.length > 0) {
          lines.push('', '## Compliance Notes', ...norms.complianceNotes.map((n) => `- ${n}`));
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error getting norms: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}

// ─── Industry Norms Data ───

function getIndustryNorms(industry: string, stage?: string): IndustryNorms {
  const lower = industry.toLowerCase();

  if (lower.includes('fintech') || lower.includes('financial') || lower.includes('banking')) {
    return {
      industry: 'Financial Services / Fintech',
      avgRewardValue: 250,
      commonRewardTypes: ['Charitable donations', 'Professional development', 'Conference invitations', 'Recognition programs'],
      complianceNotes: [
        'Financial services are heavily regulated — avoid direct monetary incentives',
        'Check SEC, FINRA, and state regulations before offering any rewards',
        'Document all referral rewards for audit compliance',
      ],
      benchmarks: [
        { metric: 'Avg referral conversion rate', value: '18-22%' },
        { metric: 'Avg time to close (referral)', value: '45-60 days' },
        { metric: 'Referral vs outbound close rate', value: '2.5x higher' },
      ],
    };
  }

  if (lower.includes('health') || lower.includes('pharma') || lower.includes('medical')) {
    return {
      industry: 'Healthcare / Life Sciences',
      avgRewardValue: 200,
      commonRewardTypes: ['Charitable donations', 'Educational stipends', 'Conference sponsorship', 'Recognition awards'],
      complianceNotes: [
        'Healthcare industry has strict anti-kickback regulations',
        'Consult legal before offering any referral incentives',
        'HIPAA considerations may apply if referral involves patient data systems',
      ],
      benchmarks: [
        { metric: 'Avg referral conversion rate', value: '15-20%' },
        { metric: 'Avg time to close (referral)', value: '60-90 days' },
        { metric: 'Referral vs outbound close rate', value: '2x higher' },
      ],
    };
  }

  if (lower.includes('saas') || lower.includes('software') || lower.includes('tech')) {
    return {
      industry: 'SaaS / Technology',
      avgRewardValue: 500,
      commonRewardTypes: ['Gift cards', 'Exclusive feature access', 'Conference tickets', 'Co-marketing', 'Advisory board seats'],
      complianceNotes: [
        'Generally fewer regulatory constraints — more flexibility in reward design',
        'Consider tax implications for rewards over $600/year',
      ],
      benchmarks: [
        { metric: 'Avg referral conversion rate', value: '25-35%' },
        { metric: 'Avg time to close (referral)', value: '30-45 days' },
        { metric: 'Referral vs outbound close rate', value: '3x higher' },
        { metric: 'Avg CAC savings from referrals', value: '60-75%' },
      ],
    };
  }

  // Default
  return {
    industry: industry,
    avgRewardValue: 350,
    commonRewardTypes: ['Gift cards', 'Recognition programs', 'Exclusive access', 'Co-marketing opportunities'],
    complianceNotes: [
      'Verify industry-specific regulations before launching incentive programs',
      'Consider tax implications for rewards over $600/year',
    ],
    benchmarks: [
      { metric: 'Avg referral conversion rate', value: '20-30%' },
      { metric: 'Avg time to close (referral)', value: '40-60 days' },
      { metric: 'Referral vs outbound close rate', value: '2-3x higher' },
    ],
  };
}
