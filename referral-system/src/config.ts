import { z } from 'zod';
import 'dotenv/config';

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3001),
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  mcpTransport: z.enum(['stdio', 'streamable_http']).default('stdio'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  databaseUrl: z.string().min(1),

  // Redis (optional)
  redisUrl: z.string().optional(),

  // CRM
  crmProvider: z.enum(['hubspot', 'salesforce']).default('hubspot'),
  hubspotAccessToken: z.string().optional(),
  salesforceClientId: z.string().optional(),
  salesforceClientSecret: z.string().optional(),
  salesforceInstanceUrl: z.string().optional(),

  // Enrichment
  enrichmentProvider: z.enum(['apollo', 'clearbit']).default('apollo'),
  apolloApiKey: z.string().optional(),
  clearbitApiKey: z.string().optional(),

  // LLM
  llmProvider: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),

  // Web Search
  exaApiKey: z.string().optional(),

  // LinkedIn Enrichment (PhantomBuster)
  phantombusterApiKey: z.string().optional(),
  phantombusterProfileAgentId: z.string().optional(),
  phantombusterCompanyAgentId: z.string().optional(),

  // Conversation Intelligence
  convoIntelProvider: z.enum(['gong', 'fathom']).default('gong'),
  gongApiKey: z.string().optional(),

  // Notifications
  slackBotToken: z.string().optional(),
  slackReferralChannel: z.string().optional(),
  slackApprovalChannel: z.string().optional(),

  // Feature Flags
  enableEnrichment: z.coerce.boolean().default(false),
  enableConvoIntel: z.coerce.boolean().default(false),
  enableIntentData: z.coerce.boolean().default(false),
  enableSlackNotifications: z.coerce.boolean().default(false),
  enableAutoTriggerScan: z.coerce.boolean().default(false),
  enableLLM: z.coerce.boolean().default(false),
  enableWebSearch: z.coerce.boolean().default(false),

  // Scoring Configuration
  readinessHotThreshold: z.coerce.number().default(80),
  readinessWarmThreshold: z.coerce.number().default(55),
  superReferrerPlatinumThreshold: z.coerce.number().default(80),
  superReferrerGoldThreshold: z.coerce.number().default(60),
  superReferrerSilverThreshold: z.coerce.number().default(40),
  maxFollowUps: z.coerce.number().default(2),
  askCooldownDays: z.coerce.number().default(90),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const raw = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    mcpTransport: process.env.MCP_TRANSPORT,
    logLevel: process.env.LOG_LEVEL,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    crmProvider: process.env.CRM_PROVIDER,
    hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN,
    salesforceClientId: process.env.SALESFORCE_CLIENT_ID,
    salesforceClientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    salesforceInstanceUrl: process.env.SALESFORCE_INSTANCE_URL,
    enrichmentProvider: process.env.ENRICHMENT_PROVIDER,
    apolloApiKey: process.env.APOLLO_API_KEY,
    clearbitApiKey: process.env.CLEARBIT_API_KEY,
    llmProvider: process.env.LLM_PROVIDER,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    exaApiKey: process.env.EXA_API_KEY,
    phantombusterApiKey: process.env.PHANTOMBUSTER_API_KEY,
    phantombusterProfileAgentId: process.env.PHANTOMBUSTER_PROFILE_AGENT_ID,
    phantombusterCompanyAgentId: process.env.PHANTOMBUSTER_COMPANY_AGENT_ID,
    convoIntelProvider: process.env.CONVO_INTEL_PROVIDER,
    gongApiKey: process.env.GONG_API_KEY,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    slackReferralChannel: process.env.SLACK_REFERRAL_CHANNEL,
    slackApprovalChannel: process.env.SLACK_APPROVAL_CHANNEL,
    enableEnrichment: process.env.ENABLE_ENRICHMENT,
    enableConvoIntel: process.env.ENABLE_CONVO_INTEL,
    enableIntentData: process.env.ENABLE_INTENT_DATA,
    enableSlackNotifications: process.env.ENABLE_SLACK_NOTIFICATIONS,
    enableAutoTriggerScan: process.env.ENABLE_AUTO_TRIGGER_SCAN,
    enableLLM: process.env.ENABLE_LLM,
    enableWebSearch: process.env.ENABLE_WEB_SEARCH,
    readinessHotThreshold: process.env.READINESS_HOT_THRESHOLD,
    readinessWarmThreshold: process.env.READINESS_WARM_THRESHOLD,
    superReferrerPlatinumThreshold: process.env.SUPER_REFERRER_PLATINUM_THRESHOLD,
    superReferrerGoldThreshold: process.env.SUPER_REFERRER_GOLD_THRESHOLD,
    superReferrerSilverThreshold: process.env.SUPER_REFERRER_SILVER_THRESHOLD,
    maxFollowUps: process.env.MAX_FOLLOW_UPS,
    askCooldownDays: process.env.ASK_COOLDOWN_DAYS,
  };

  return configSchema.parse(raw);
}
