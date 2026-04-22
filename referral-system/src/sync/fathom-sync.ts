/**
 * Fathom Sync — Pulls call transcripts and extracts relationship signals.
 *
 * Maps Fathom calls to trigger events and champion relationship updates:
 *   Calls → trigger_events (relationship signals)
 *   Call sentiment → champion relationship_strength updates
 */

import { eq, and } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { accounts, champions, triggerEvents } from '../db/schema.js';

const FATHOM_API = 'https://api.fathom.video/v1';

interface FathomCall {
  id: string;
  title: string;
  date: string;
  duration_seconds: number;
  participants: { name: string; email?: string }[];
  summary?: string;
  action_items?: string[];
  highlights?: { text: string; timestamp: number }[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

interface FathomCallListResponse {
  calls: FathomCall[];
  has_more: boolean;
  cursor?: string;
}

// ─── API Client ───────────────────────────────────────────────────────────────

async function fathomFetch<T>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${FATHOM_API}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Fathom API ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

async function fetchAllCalls(token: string, since?: Date): Promise<FathomCall[]> {
  const all: FathomCall[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = { limit: '50' };
    if (cursor) params.cursor = cursor;
    if (since) params.since = since.toISOString();

    const data = await fathomFetch<FathomCallListResponse>('/calls', token, params);
    all.push(...data.calls);
    cursor = data.has_more ? data.cursor : undefined;
  } while (cursor);

  return all;
}

// ─── Signal Extraction ───────────────────────────────────────────────────────

interface RelationshipSignal {
  type: string;
  category: string;
  description: string;
  isAntiTrigger: boolean;
}

function extractSignals(call: FathomCall): RelationshipSignal[] {
  const signals: RelationshipSignal[] = [];
  const title = call.title.toLowerCase();
  const summary = (call.summary ?? '').toLowerCase();

  // QBR detection
  if (title.includes('qbr') || title.includes('quarterly') || title.includes('business review')) {
    const isPositive = call.sentiment === 'positive';
    signals.push({
      type: isPositive ? 'qbr_success' : 'qbr_neutral',
      category: 'relationship',
      description: `QBR call: "${call.title}" — ${call.sentiment ?? 'unknown'} sentiment`,
      isAntiTrigger: call.sentiment === 'negative',
    });
  }

  // Renewal / expansion discussions
  if (title.includes('renewal') || summary.includes('renewal') || summary.includes('expand')) {
    signals.push({
      type: 'renewal_discussion',
      category: 'business',
      description: `Renewal/expansion discussed in: "${call.title}"`,
      isAntiTrigger: false,
    });
  }

  // Case study / reference willingness
  if (summary.includes('case study') || summary.includes('reference') || summary.includes('testimonial')) {
    signals.push({
      type: 'case_study_willingness',
      category: 'relationship',
      description: `Reference/case study mentioned in: "${call.title}"`,
      isAntiTrigger: false,
    });
  }

  // Champion promotion mentions
  if (summary.includes('promoted') || summary.includes('new role') || summary.includes('taking over')) {
    signals.push({
      type: 'champion_promoted',
      category: 'relationship',
      description: `Role change mentioned in: "${call.title}"`,
      isAntiTrigger: false,
    });
  }

  // Escalation / frustration signals
  if (call.sentiment === 'negative' || summary.includes('escalat') || summary.includes('frustrat') || summary.includes('cancel')) {
    signals.push({
      type: 'support_escalation',
      category: 'risk_flip',
      description: `Negative sentiment in: "${call.title}"`,
      isAntiTrigger: true,
    });
  }

  // Training calls = active engagement
  if (title.includes('training') || title.includes('onboard') || title.includes('enablement')) {
    signals.push({
      type: 'active_engagement',
      category: 'usage',
      description: `Training/enablement call: "${call.title}"`,
      isAntiTrigger: false,
    });
  }

  // NPS / satisfaction mentions in conversation
  if (summary.includes('nps') || summary.includes('love the product') || summary.includes('great results')) {
    signals.push({
      type: 'nps_high',
      category: 'relationship',
      description: `Positive satisfaction signal in: "${call.title}"`,
      isAntiTrigger: false,
    });
  }

  return signals;
}

function inferRelationshipFromCall(call: FathomCall): 'strong' | 'warm' | 'cold' | null {
  if (call.sentiment === 'positive') return 'strong';
  if (call.sentiment === 'negative') return 'cold';
  // Recent call = at least warm
  const daysSince = (Date.now() - new Date(call.date).getTime()) / 86400000;
  if (daysSince < 30) return 'warm';
  return null;
}

// ─── Sync Function ───────────────────────────────────────────────────────────

export interface FathomSyncResult {
  callsProcessed: number;
  signalsCreated: number;
  championsUpdated: number;
  unmatchedParticipants: string[];
}

export async function syncFathom(
  db: DbClient,
  token: string,
  options?: { since?: Date; dryRun?: boolean }
): Promise<FathomSyncResult> {
  const result: FathomSyncResult = {
    callsProcessed: 0,
    signalsCreated: 0,
    championsUpdated: 0,
    unmatchedParticipants: [],
  };

  console.log('  Fetching Fathom calls...');
  const calls = await fetchAllCalls(token, options?.since);
  console.log(`  Found ${calls.length} calls`);

  // Build email → champion lookup
  const allChampions = await db.select().from(champions);
  const emailToChampion = new Map(
    allChampions
      .filter((c) => c.email)
      .map((c) => [c.email!.toLowerCase(), c])
  );

  for (const call of calls) {
    result.callsProcessed++;

    // Match participants to champions
    const matchedChampions = new Set<typeof allChampions[0]>();
    for (const participant of call.participants) {
      if (participant.email) {
        const champion = emailToChampion.get(participant.email.toLowerCase());
        if (champion) {
          matchedChampions.add(champion);
        } else {
          result.unmatchedParticipants.push(participant.email);
        }
      }
    }

    if (matchedChampions.size === 0) continue;

    // Extract signals from call
    const signals = extractSignals(call);

    // Create trigger events for each matched champion's account
    for (const champion of matchedChampions) {
      for (const signal of signals) {
        if (options?.dryRun) continue;

        await db.insert(triggerEvents).values({
          accountId: champion.accountId,
          championId: champion.id,
          eventType: signal.type,
          eventCategory: signal.category,
          eventDescription: signal.description,
          eventDate: new Date(call.date),
          dataSource: 'fathom',
          isAntiTrigger: signal.isAntiTrigger,
        });
        result.signalsCreated++;
      }

      // Update champion relationship strength based on most recent call
      const newStrength = inferRelationshipFromCall(call);
      if (newStrength && !options?.dryRun) {
        await db.update(champions).set({
          relationshipStrength: newStrength,
          lastInteractionDate: new Date(call.date),
          updatedAt: new Date(),
        }).where(eq(champions.id, champion.id));
        result.championsUpdated++;
      }
    }
  }

  console.log(`  Processed ${result.callsProcessed} calls, created ${result.signalsCreated} signals, updated ${result.championsUpdated} champions`);
  if (result.unmatchedParticipants.length > 0) {
    const unique = [...new Set(result.unmatchedParticipants)];
    console.log(`  ⚠ ${unique.length} unmatched participant emails (not in champions table)`);
  }

  return result;
}
