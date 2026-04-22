import type { TriggerEvent } from '../../src/db/schema.js';

const BASE_TRIGGER: TriggerEvent = {
  id: '00000000-0000-0000-0002-000000000001',
  accountId: '00000000-0000-0000-0000-000000000010',
  championId: '00000000-0000-0000-0001-000000000010',
  eventType: 'qbr_success',
  eventCategory: 'relationship',
  eventDescription: 'Positive QBR at TechCorp Pro',
  eventDate: new Date('2026-03-20'),
  dataSource: 'crm',
  isAntiTrigger: false,
  processedForScoring: false,
  createdAt: new Date(),
};

export function buildTriggerEvent(overrides?: Partial<TriggerEvent>): TriggerEvent {
  return {
    ...BASE_TRIGGER,
    id: overrides?.id ?? `00000000-0000-0000-0002-${String(Date.now()).slice(-12).padStart(12, '0')}`,
    ...overrides,
  };
}

// ─── Positive trigger presets ───

export const QBR_SUCCESS = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000010',
  eventType: 'qbr_success',
  eventCategory: 'relationship',
  eventDescription: 'Positive QBR at TechCorp Pro',
  eventDate: new Date('2026-03-20'),
});

export const HIGH_NPS = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000011',
  eventType: 'nps_high',
  eventCategory: 'relationship',
  eventDescription: 'NPS score of 10 at TechCorp Pro',
  eventDate: new Date('2026-03-15'),
});

export const USAGE_GROWING = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000012',
  eventType: 'usage_growing',
  eventCategory: 'usage',
  eventDescription: 'Usage trending up at TechCorp Pro',
  eventDate: new Date('2026-03-10'),
});

export const RENEWAL_APPROACHING = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000013',
  eventType: 'renewal_approaching',
  eventCategory: 'calendar',
  eventDescription: 'Renewal approaching at MidRange Inc',
  eventDate: new Date('2026-05-01'),
  accountId: '00000000-0000-0000-0000-000000000011',
});

// ─── Anti-trigger presets ───

export const SUPPORT_ESCALATION = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000020',
  eventType: 'support_escalation',
  eventCategory: 'risk_flip',
  eventDescription: 'Active support escalation at TroubleCo',
  isAntiTrigger: true,
  accountId: '00000000-0000-0000-0000-000000000013',
});

export const COMPETITOR_EVAL = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000021',
  eventType: 'competitor_evaluation',
  eventCategory: 'risk_flip',
  eventDescription: 'Competitor evaluation detected at AtRiskCo',
  isAntiTrigger: true,
  accountId: '00000000-0000-0000-0000-000000000014',
});

export const CHAMPION_DEPARTED = buildTriggerEvent({
  id: '00000000-0000-0000-0002-000000000022',
  eventType: 'champion_departed',
  eventCategory: 'relationship',
  eventDescription: 'Champion Tom Richards departed from TroubleCo',
  isAntiTrigger: true,
  accountId: '00000000-0000-0000-0000-000000000013',
});
