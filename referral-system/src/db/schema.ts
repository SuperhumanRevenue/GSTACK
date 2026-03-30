import {
  pgTable,
  uuid,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// ─── Enums ───

export const readinessTierEnum = pgEnum('readiness_tier', [
  'hot',
  'warm',
  'not_yet',
]);

export const askTypeEnum = pgEnum('ask_type', ['live', 'async', 'soft_seed']);

export const responseEnum = pgEnum('response_type', [
  'yes',
  'maybe',
  'no',
  'no_response',
  'pending',
]);

export const referralStatusEnum = pgEnum('referral_status', [
  'ask_pending',
  'ask_sent',
  'intro_pending',
  'intro_sent',
  'meeting_booked',
  'opportunity_created',
  'closed_won',
  'closed_lost',
  'deferred',
  'expired',
  'declined',
]);

export const superReferrerTierEnum = pgEnum('super_referrer_tier', [
  'platinum',
  'gold',
  'silver',
  'bronze',
]);

export const rewardCategoryEnum = pgEnum('reward_category', [
  'recognition',
  'reciprocal',
  'economic',
  'access',
  'co_marketing',
]);

// ─── Core Tables ───

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    crmAccountId: text('crm_account_id').unique(),
    companyName: text('company_name').notNull(),
    industry: text('industry'),
    employeeCount: integer('employee_count'),
    currentAcv: decimal('current_acv', { precision: 12, scale: 2 }),
    contractStartDate: timestamp('contract_start_date'),
    renewalDate: timestamp('renewal_date'),
    tenureMonths: integer('tenure_months'),
    csHealthScore: integer('cs_health_score'), // 0-100
    npsScore: integer('nps_score'), // 0-10
    lastQbrDate: timestamp('last_qbr_date'),
    lastQbrOutcome: text('last_qbr_outcome'), // positive/neutral/negative
    supportEscalationActive: boolean('support_escalation_active').default(false),
    churnRiskActive: boolean('churn_risk_active').default(false),
    usageTrend: text('usage_trend'), // growing/stable/declining
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_accounts_industry').on(table.industry),
    index('idx_accounts_acv').on(table.currentAcv),
  ]
);

export const champions = pgTable(
  'champions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id)
      .notNull(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    email: text('email'),
    linkedinUrl: text('linkedin_url'),
    seniorityLevel: text('seniority_level'), // c_suite/vp/director/manager
    relationshipStrength: text('relationship_strength'), // strong/warm/cold
    isExecutiveSponsor: boolean('is_executive_sponsor').default(false),
    formerCompanies: jsonb('former_companies').$type<string[]>(),
    industryCommunities: jsonb('industry_communities').$type<string[]>(),
    communicationStyle: text('communication_style'), // formal/casual
    networkReachScore: integer('network_reach_score'), // 0-100 (from enrichment)
    lastInteractionDate: timestamp('last_interaction_date'),
    departedAt: timestamp('departed_at'), // null = still active
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('idx_champions_account').on(table.accountId)]
);

export const readinessScores = pgTable(
  'readiness_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id)
      .notNull(),
    championId: uuid('champion_id')
      .references(() => champions.id)
      .notNull(),
    totalScore: integer('total_score').notNull(), // 0-100
    tier: readinessTierEnum('tier').notNull(),
    valueDeliveredScore: integer('value_delivered_score').notNull(), // 0-25
    relationshipStrengthScore: integer('relationship_strength_score').notNull(), // 0-20
    recencyOfWinScore: integer('recency_of_win_score').notNull(), // 0-20
    networkValueScore: integer('network_value_score').notNull(), // 0-20
    askHistoryScore: integer('ask_history_score').notNull(), // 0-15
    triggerEvent: text('trigger_event'),
    triggerDate: timestamp('trigger_date'),
    antiTriggers: jsonb('anti_triggers').$type<string[]>(),
    scoringRationale: text('scoring_rationale'),
    scoredAt: timestamp('scored_at').defaultNow(),
  },
  (table) => [
    index('idx_readiness_account').on(table.accountId),
    index('idx_readiness_tier').on(table.tier),
    index('idx_readiness_score').on(table.totalScore),
  ]
);

export const connectionMaps = pgTable(
  'connection_maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    championId: uuid('champion_id')
      .references(() => champions.id)
      .notNull(),
    targetCompany: text('target_company').notNull(),
    targetContact: text('target_contact').notNull(),
    targetTitle: text('target_title').notNull(),
    targetLinkedinUrl: text('target_linkedin_url'),
    connectionPath: text('connection_path').notNull(),
    connectionStrengthScore: integer('connection_strength_score'), // 1-10
    targetAccountPriority: integer('target_account_priority'), // 1-10
    roleMatchScore: integer('role_match_score'), // 1-10
    painAlignmentScore: integer('pain_alignment_score'), // 1-10
    timingSignalScore: integer('timing_signal_score'), // 1-10
    compositeScore: integer('composite_score'), // 1-10 weighted
    suggestedFraming: text('suggested_framing'),
    existingRelationship: text('existing_relationship'),
    mappedAt: timestamp('mapped_at').defaultNow(),
  },
  (table) => [
    index('idx_connections_champion').on(table.championId),
    index('idx_connections_score').on(table.compositeScore),
  ]
);

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id)
      .notNull(),
    championId: uuid('champion_id')
      .references(() => champions.id)
      .notNull(),
    connectionMapId: uuid('connection_map_id').references(
      () => connectionMaps.id
    ),
    readinessScoreId: uuid('readiness_score_id').references(
      () => readinessScores.id
    ),

    // Target info
    targetCompany: text('target_company').notNull(),
    targetContact: text('target_contact').notNull(),
    targetTitle: text('target_title').notNull(),

    // Ask details
    askType: askTypeEnum('ask_type').notNull(),
    askDate: timestamp('ask_date'),
    askContent: text('ask_content'),
    triggerEvent: text('trigger_event').notNull(),
    readinessScoreAtAsk: integer('readiness_score_at_ask'),

    // Response tracking
    response: responseEnum('response').default('pending'),
    responseDate: timestamp('response_date'),
    followUpCount: integer('follow_up_count').default(0),
    lastFollowUpDate: timestamp('last_follow_up_date'),

    // Pipeline progression
    status: referralStatusEnum('status').default('ask_pending'),
    introDate: timestamp('intro_date'),
    introContent: text('intro_content'),
    meetingDate: timestamp('meeting_date'),
    crmOpportunityId: text('crm_opportunity_id'),
    opportunityAmount: decimal('opportunity_amount', {
      precision: 12,
      scale: 2,
    }),
    closedDate: timestamp('closed_date'),
    closedAmount: decimal('closed_amount', { precision: 12, scale: 2 }),
    timeToCloseDays: integer('time_to_close_days'),

    // Reward tracking
    championReward: text('champion_reward'),
    rewardDate: timestamp('reward_date'),

    // Ownership
    owningAe: text('owning_ae'),
    notes: text('notes'),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_referrals_account').on(table.accountId),
    index('idx_referrals_champion').on(table.championId),
    index('idx_referrals_status').on(table.status),
    index('idx_referrals_ask_date').on(table.askDate),
  ]
);

export const superReferrers = pgTable(
  'super_referrers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    championId: uuid('champion_id')
      .references(() => champions.id)
      .notNull()
      .unique(),
    superScore: integer('super_score').notNull(), // 0-100
    tier: superReferrerTierEnum('tier').notNull(),
    volumeScore: integer('volume_score').notNull(), // 0-20
    qualityScore: integer('quality_score').notNull(), // 0-25
    valueScore: integer('value_score').notNull(), // 0-20
    networkScore: integer('network_score').notNull(), // 0-20
    velocityScore: integer('velocity_score').notNull(), // 0-15
    totalReferrals: integer('total_referrals').default(0),
    totalIntros: integer('total_intros').default(0),
    totalMeetings: integer('total_meetings').default(0),
    totalClosed: integer('total_closed').default(0),
    totalRevenue: decimal('total_revenue', { precision: 12, scale: 2 }).default(
      '0'
    ),
    avgDealSize: decimal('avg_deal_size', { precision: 12, scale: 2 }),
    avgTimeToClose: integer('avg_time_to_close'),
    responseRate: decimal('response_rate', { precision: 5, scale: 4 }),
    lastReferralDate: timestamp('last_referral_date'),
    programJoinDate: timestamp('program_join_date'),
    rewardsDelivered: jsonb('rewards_delivered').$type<
      { type: string; date: string; description: string }[]
    >(),
    recalculatedAt: timestamp('recalculated_at').defaultNow(),
  },
  (table) => [
    index('idx_super_referrers_score').on(table.superScore),
    index('idx_super_referrers_tier').on(table.tier),
  ]
);

export const referralTargets = pgTable('referral_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  referralId: uuid('referral_id').references(() => referrals.id),
  targetCompany: text('target_company').notNull(),
  targetContact: text('target_contact').notNull(),
  targetTitle: text('target_title').notNull(),
  referredByChampionId: uuid('referred_by_champion_id').references(
    () => champions.id
  ),
  icpFitScore: integer('icp_fit_score'), // 0-30
  painAlignmentScore: integer('pain_alignment_score'), // 0-25
  championCredibilityScore: integer('champion_credibility_score'), // 0-20
  timingScore: integer('timing_score'), // 0-15
  dealSizeScore: integer('deal_size_score'), // 0-10
  totalTargetScore: integer('total_target_score'), // 0-100
  priority: text('priority'), // high/medium/low
  scoredAt: timestamp('scored_at').defaultNow(),
});

export const triggerEvents = pgTable(
  'trigger_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id)
      .notNull(),
    championId: uuid('champion_id').references(() => champions.id),
    eventType: text('event_type').notNull(),
    eventCategory: text('event_category').notNull(), // usage/relationship/business/calendar/risk_flip
    eventDescription: text('event_description').notNull(),
    eventDate: timestamp('event_date').notNull(),
    dataSource: text('data_source'), // crm/gong/nps_platform/manual
    isAntiTrigger: boolean('is_anti_trigger').default(false),
    processedForScoring: boolean('processed_for_scoring').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_trigger_events_account').on(table.accountId),
    index('idx_trigger_events_date').on(table.eventDate),
    index('idx_trigger_events_type').on(table.eventType),
  ]
);

export const incentivePackages = pgTable(
  'incentive_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Company context
    companyName: text('company_name').notNull(),
    companyStage: text('company_stage'), // startup/growth/enterprise
    companyArr: decimal('company_arr', { precision: 14, scale: 2 }),
    companyIndustry: text('company_industry'),
    avgAcv: decimal('avg_acv', { precision: 12, scale: 2 }),
    acvRangeLow: decimal('acv_range_low', { precision: 12, scale: 2 }),
    acvRangeHigh: decimal('acv_range_high', { precision: 12, scale: 2 }),
    currentOutboundCac: decimal('current_outbound_cac', {
      precision: 12,
      scale: 2,
    }),
    customerCount: integer('customer_count'),
    // Referrer context (null for program-wide defaults)
    championId: uuid('champion_id').references(() => champions.id),
    referrerSeniority: text('referrer_seniority'),
    referrerMotivation: text('referrer_motivation'),
    superReferrerTier: superReferrerTierEnum('super_referrer_tier'),
    // Economics
    rewardCeiling: decimal('reward_ceiling', { precision: 12, scale: 2 }),
    annualProgramBudget: decimal('annual_program_budget', {
      precision: 12,
      scale: 2,
    }),
    // Package
    primaryRewardCategory: rewardCategoryEnum('primary_reward_category'),
    primaryRewardDescription: text('primary_reward_description'),
    primaryRewardCost: decimal('primary_reward_cost', {
      precision: 12,
      scale: 2,
    }),
    primaryRewardTiming: text('primary_reward_timing'),
    secondaryRewardCategory: rewardCategoryEnum('secondary_reward_category'),
    secondaryRewardDescription: text('secondary_reward_description'),
    secondaryRewardCost: decimal('secondary_reward_cost', {
      precision: 12,
      scale: 2,
    }),
    secondaryRewardTiming: text('secondary_reward_timing'),
    ongoingBenefits: jsonb('ongoing_benefits').$type<string[]>(),
    totalCostPerReferral: decimal('total_cost_per_referral', {
      precision: 12,
      scale: 2,
    }),
    cacSavingsPct: decimal('cac_savings_pct', { precision: 5, scale: 2 }),
    // Escalation
    escalationPath: jsonb('escalation_path').$type<
      { referral_number: number; reward_change: string }[]
    >(),
    // Language guidance
    languageToUse: text('language_to_use'),
    languageToAvoid: text('language_to_avoid'),
    // Edge case handling
    edgeCaseNotes: text('edge_case_notes'),
    // Performance tracking
    timesUsed: integer('times_used').default(0),
    conversionRate: decimal('conversion_rate', { precision: 5, scale: 4 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_incentive_champion').on(table.championId),
    index('idx_incentive_company').on(table.companyName),
  ]
);

// ─── Signal Guide Enums ───

export const signalStrengthEnum = pgEnum('signal_strength', [
  'low',
  'medium',
  'high',
]);

export const signalTagEnum = pgEnum('signal_tag', [
  'sales_led',
  'product_led',
  'nearbound',
  'event',
  'competitor',
  'community_led',
]);

export const signalChannelEnum = pgEnum('signal_channel', [
  'dark_funnel',
  'crm',
  'website',
  'product',
  'community',
  'open_source',
]);

export const funnelStageEnum = pgEnum('funnel_stage', [
  'top_awareness',
  'mid_consideration',
  'bottom_conversion',
]);

export const customerContextStatusEnum = pgEnum('customer_context_status', [
  'intake',
  'researching',
  'generating',
  'complete',
]);

// ─── Signal Guide Tables ───

/** Master 100-signal library — seed data that ships with the system */
export const signalTemplates = pgTable(
  'signal_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalName: text('signal_name').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    strength: signalStrengthEnum('strength').notNull(),
    tag: signalTagEnum('tag').notNull(),
    channel: signalChannelEnum('channel').notNull(),
    funnelStage: funnelStageEnum('funnel_stage').notNull(),
    hasPlaybook: boolean('has_playbook').default(false),
    playbook: text('playbook'),
    categoryOrder: integer('category_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_signal_templates_tag').on(table.tag),
    index('idx_signal_templates_strength').on(table.strength),
  ]
);

/** Customer intake data for custom signal guide generation */
export const customerContexts = pgTable(
  'customer_contexts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyName: text('company_name').notNull(),
    positioning: text('positioning'),
    messaging: text('messaging'),
    caseStudies: jsonb('case_studies').$type<{ title: string; summary: string; metrics?: string[] }[]>(),
    masterDeckSummary: text('master_deck_summary'),
    packaging: jsonb('packaging').$type<{ tier: string; description: string; price?: string }[]>(),
    productDescription: text('product_description'),
    targetIndustries: jsonb('target_industries').$type<string[]>(),
    targetPersonas: jsonb('target_personas').$type<{ title: string; painPoints: string[]; goals: string[] }[]>(),
    competitors: jsonb('competitors').$type<{ name: string; positioning?: string; weaknesses?: string[] }[]>(),
    techStackAdjacencies: jsonb('tech_stack_adjacencies').$type<string[]>(),
    marketResearch: jsonb('market_research').$type<{
      industryTrends: string[];
      competitorInsights: { competitor: string; findings: string[] }[];
      marketDynamics: string[];
      techLandscape: string[];
    }>(),
    status: customerContextStatusEnum('status').default('intake'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_customer_contexts_company').on(table.companyName),
    index('idx_customer_contexts_status').on(table.status),
  ]
);

/** Generated per-customer signal guide entries */
export const customSignalGuides = pgTable(
  'custom_signal_guides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerContextId: uuid('customer_context_id')
      .references(() => customerContexts.id)
      .notNull(),
    signalTemplateId: uuid('signal_template_id')
      .references(() => signalTemplates.id)
      .notNull(),
    customizedName: text('customized_name').notNull(),
    customizedDescription: text('customized_description').notNull(),
    customizedPlaybook: text('customized_playbook'),
    strength: signalStrengthEnum('strength').notNull(),
    tag: signalTagEnum('tag').notNull(),
    channel: signalChannelEnum('channel').notNull(),
    funnelStage: funnelStageEnum('funnel_stage').notNull(),
    relevanceScore: integer('relevance_score').notNull(), // 0-100
    exampleTriggers: jsonb('example_triggers').$type<string[]>(),
    active: boolean('active').default(true),
    generatedAt: timestamp('generated_at').defaultNow(),
  },
  (table) => [
    index('idx_custom_signals_context').on(table.customerContextId),
    index('idx_custom_signals_relevance').on(table.relevanceScore),
    index('idx_custom_signals_active').on(table.active),
  ]
);

// ─── PCP (Perfect Customer Profile) Enums ───

export const pcpTierEnum = pgEnum('pcp_tier', [
  'power_law',    // Top 3% — drives ~35% of revenue
  'high_value',   // Next 7% — strong contributors
  'core',         // Middle 40% — steady base
  'long_tail',    // Bottom 50% — low revenue per account
]);

export const pcpAnalysisStatusEnum = pgEnum('pcp_analysis_status', [
  'pending',
  'analyzing',
  'complete',
  'stale',
]);

// ─── PCP Tables ───

/** Revenue snapshot per account — input for power-law analysis */
export const revenueSnapshots = pgTable(
  'revenue_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id)
      .notNull(),
    period: text('period').notNull(), // e.g. '2025-Q4', '2026-Q1'
    revenue: decimal('revenue', { precision: 14, scale: 2 }).notNull(),
    dealCount: integer('deal_count').default(1),
    productLines: jsonb('product_lines').$type<string[]>(),
    expansionRevenue: decimal('expansion_revenue', { precision: 14, scale: 2 }),
    referralSourced: boolean('referral_sourced').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_revenue_snapshots_account').on(table.accountId),
    index('idx_revenue_snapshots_period').on(table.period),
  ]
);

/** PCP analysis run — stores power-law distribution results */
export const pcpAnalyses = pgTable(
  'pcp_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(), // e.g. 'Q1 2026 Analysis'
    period: text('period').notNull(), // date range analyzed
    totalAccounts: integer('total_accounts').notNull(),
    totalRevenue: decimal('total_revenue', { precision: 14, scale: 2 }).notNull(),
    // Power-law distribution
    powerLawThresholdPct: decimal('power_law_threshold_pct', { precision: 5, scale: 2 }).default('3'),
    powerLawAccountCount: integer('power_law_account_count').notNull(),
    powerLawRevenuePct: decimal('power_law_revenue_pct', { precision: 5, scale: 2 }).notNull(),
    highValueAccountCount: integer('high_value_account_count').notNull(),
    highValueRevenuePct: decimal('high_value_revenue_pct', { precision: 5, scale: 2 }).notNull(),
    coreAccountCount: integer('core_account_count').notNull(),
    coreRevenuePct: decimal('core_revenue_pct', { precision: 5, scale: 2 }).notNull(),
    longTailAccountCount: integer('long_tail_account_count').notNull(),
    longTailRevenuePct: decimal('long_tail_revenue_pct', { precision: 5, scale: 2 }).notNull(),
    // Gini coefficient for concentration measurement
    giniCoefficient: decimal('gini_coefficient', { precision: 5, scale: 4 }),
    status: pcpAnalysisStatusEnum('status').default('pending'),
    analyzedAt: timestamp('analyzed_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_pcp_analyses_status').on(table.status),
  ]
);

/** Account tier assignment from a PCP analysis */
export const pcpAccountTiers = pgTable(
  'pcp_account_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id')
      .references(() => pcpAnalyses.id)
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id)
      .notNull(),
    tier: pcpTierEnum('tier').notNull(),
    totalRevenue: decimal('total_revenue', { precision: 14, scale: 2 }).notNull(),
    revenuePctOfTotal: decimal('revenue_pct_of_total', { precision: 5, scale: 2 }).notNull(),
    revenueRank: integer('revenue_rank').notNull(),
    assignedAt: timestamp('assigned_at').defaultNow(),
  },
  (table) => [
    index('idx_pcp_account_tiers_analysis').on(table.analysisId),
    index('idx_pcp_account_tiers_tier').on(table.tier),
    index('idx_pcp_account_tiers_account').on(table.accountId),
  ]
);

/** Empirical ICP weights derived from power-law account attributes */
export const pcpIcpWeights = pgTable(
  'pcp_icp_weights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id')
      .references(() => pcpAnalyses.id)
      .notNull(),
    attribute: text('attribute').notNull(), // e.g. 'industry', 'employee_count_range', 'tech_stack'
    attributeValue: text('attribute_value').notNull(), // e.g. 'SaaS', '500-2000', 'Salesforce'
    powerLawFrequency: decimal('power_law_frequency', { precision: 5, scale: 4 }).notNull(), // % of power-law accounts with this attribute
    overallFrequency: decimal('overall_frequency', { precision: 5, scale: 4 }).notNull(), // % of all accounts with this attribute
    liftScore: decimal('lift_score', { precision: 7, scale: 4 }).notNull(), // power_law_freq / overall_freq
    weight: decimal('weight', { precision: 5, scale: 4 }).notNull(), // normalized 0-1 weight for ICP scoring
    sampleSize: integer('sample_size').notNull(), // number of power-law accounts with this attribute
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_pcp_icp_weights_analysis').on(table.analysisId),
    index('idx_pcp_icp_weights_attribute').on(table.attribute),
    index('idx_pcp_icp_weights_lift').on(table.liftScore),
  ]
);

// ─── Type Exports ───

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Champion = typeof champions.$inferSelect;
export type NewChampion = typeof champions.$inferInsert;
export type ReadinessScore = typeof readinessScores.$inferSelect;
export type NewReadinessScore = typeof readinessScores.$inferInsert;
export type ConnectionMap = typeof connectionMaps.$inferSelect;
export type NewConnectionMap = typeof connectionMaps.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type SuperReferrer = typeof superReferrers.$inferSelect;
export type NewSuperReferrer = typeof superReferrers.$inferInsert;
export type ReferralTarget = typeof referralTargets.$inferSelect;
export type NewReferralTarget = typeof referralTargets.$inferInsert;
export type TriggerEvent = typeof triggerEvents.$inferSelect;
export type NewTriggerEvent = typeof triggerEvents.$inferInsert;
export type IncentivePackage = typeof incentivePackages.$inferSelect;
export type NewIncentivePackage = typeof incentivePackages.$inferInsert;
export type SignalTemplate = typeof signalTemplates.$inferSelect;
export type NewSignalTemplate = typeof signalTemplates.$inferInsert;
export type CustomerContext = typeof customerContexts.$inferSelect;
export type NewCustomerContext = typeof customerContexts.$inferInsert;
export type CustomSignalGuide = typeof customSignalGuides.$inferSelect;
export type NewCustomSignalGuide = typeof customSignalGuides.$inferInsert;
export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type NewRevenueSnapshot = typeof revenueSnapshots.$inferInsert;
export type PcpAnalysis = typeof pcpAnalyses.$inferSelect;
export type NewPcpAnalysis = typeof pcpAnalyses.$inferInsert;
export type PcpAccountTier = typeof pcpAccountTiers.$inferSelect;
export type NewPcpAccountTier = typeof pcpAccountTiers.$inferInsert;
export type PcpIcpWeight = typeof pcpIcpWeights.$inferSelect;
export type NewPcpIcpWeight = typeof pcpIcpWeights.$inferInsert;
