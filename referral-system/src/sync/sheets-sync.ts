/**
 * Google Sheets Sync — Pulls survey responses and referral mapping data.
 *
 * Two data sources:
 *   1. Survey responses (Google Forms → Sheets) — includes the referral column:
 *      "If you enjoyed the work we did together, do you 2-3 peers, former colleagues
 *       or friends that would benefit from AI adoption..."
 *   2. Referral tracking sheet — manual mapping of referrals by account
 *
 * Uses Google Sheets API v4 (REST).
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { accounts, champions, referrals, triggerEvents, connectionMaps } from '../db/schema.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface SheetValues {
  range: string;
  majorDimension: string;
  values: string[][];
}

// ─── API Client ───────────────────────────────────────────────────────────────

async function fetchSheetData(
  spreadsheetId: string,
  range: string,
  apiKey: string
): Promise<string[][]> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Google Sheets API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as SheetValues;
  return data.values ?? [];
}

// ─── Survey Response Parsing ─────────────────────────────────────────────────

interface SurveyResponse {
  timestamp: string;
  email: string;
  name: string;
  company: string;
  npsScore?: number;
  testimonial?: string;
  referrals: ParsedReferral[];
  rawReferralText: string;
}

interface ParsedReferral {
  name: string;
  email?: string;
  company?: string;
}

/**
 * Parse the referral column text into structured referrals.
 * People submit in various formats:
 *   - "John Smith - john@company.com"
 *   - "Jane Doe, jane@example.com, Acme Corp"
 *   - "Bob (bob@test.com)"
 *   - Just emails: "alice@foo.com, bob@bar.com"
 *   - Freeform: "My friend John at Acme"
 */
function parseReferralText(text: string): ParsedReferral[] {
  if (!text || text.trim().length === 0) return [];

  const referrals: ParsedReferral[] = [];
  // Split on common delimiters: newlines, semicolons, numbered lists
  const entries = text.split(/[\n;]|(?:\d+[.)]\s*)/).map((s) => s.trim()).filter(Boolean);

  for (const entry of entries) {
    // Extract email if present
    const emailMatch = entry.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    const email = emailMatch?.[0];

    // Remove the email from the text to get the name
    let remaining = entry.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/, '').trim();
    // Clean up separators
    remaining = remaining.replace(/^[-–—,\s()]+|[-–—,\s()]+$/g, '').trim();

    // Try to extract company (after "at", "from", last comma-separated segment)
    let name = remaining;
    let company: string | undefined;

    const atMatch = remaining.match(/^(.+?)\s+(?:at|from|@)\s+(.+)$/i);
    if (atMatch) {
      name = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      // Check for comma-separated: "Name, Company"
      const parts = remaining.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        name = parts[0];
        company = parts[parts.length - 1];
      }
    }

    // If we only got an email with no name, use email prefix
    if (!name && email) {
      name = email.split('@')[0].replace(/[._-]/g, ' ');
    }

    if (name || email) {
      referrals.push({ name: name || 'Unknown', email, company });
    }
  }

  return referrals;
}

function parseSurveyRow(headers: string[], row: string[]): SurveyResponse | null {
  const get = (col: string) => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(col.toLowerCase()));
    return idx >= 0 ? row[idx]?.trim() : undefined;
  };

  const email = get('email');
  const name = get('name') ?? get('full name');
  if (!email && !name) return null;

  // Find the referral column
  const referralIdx = headers.findIndex((h) =>
    h.toLowerCase().includes('peers') ||
    h.toLowerCase().includes('referral') ||
    h.toLowerCase().includes('colleagues') ||
    h.toLowerCase().includes('benefit from ai')
  );
  const rawReferralText = referralIdx >= 0 ? (row[referralIdx] ?? '') : '';

  const npsStr = get('nps') ?? get('score') ?? get('rate');
  const npsScore = npsStr ? parseInt(npsStr) : undefined;

  return {
    timestamp: get('timestamp') ?? new Date().toISOString(),
    email: email ?? '',
    name: name ?? '',
    company: get('company') ?? get('organization') ?? '',
    npsScore: npsScore && !isNaN(npsScore) ? npsScore : undefined,
    testimonial: get('testimonial') ?? get('feedback') ?? get('comment'),
    referrals: parseReferralText(rawReferralText),
    rawReferralText,
  };
}

// ─── Referral Sheet Parsing ──────────────────────────────────────────────────

interface ReferralSheetRow {
  sourceCompany: string;
  sourceContact: string;
  targetCompany: string;
  targetContact: string;
  targetEmail?: string;
  targetTitle?: string;
  status?: string;
  date?: string;
  notes?: string;
}

function parseReferralSheetRow(headers: string[], row: string[]): ReferralSheetRow | null {
  const get = (col: string) => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(col.toLowerCase()));
    return idx >= 0 ? row[idx]?.trim() : undefined;
  };

  const sourceCompany = get('source company') ?? get('referring company') ?? get('from company') ?? '';
  const targetCompany = get('target company') ?? get('referred company') ?? get('to company') ?? '';
  if (!sourceCompany && !targetCompany) return null;

  return {
    sourceCompany,
    sourceContact: get('source contact') ?? get('referrer') ?? get('from') ?? '',
    targetCompany,
    targetContact: get('target contact') ?? get('referred') ?? get('to') ?? '',
    targetEmail: get('target email') ?? get('referred email'),
    targetTitle: get('target title') ?? get('referred title'),
    status: get('status') ?? get('stage'),
    date: get('date') ?? get('referral date'),
    notes: get('notes'),
  };
}

// ─── Sync Functions ──────────────────────────────────────────────────────────

export interface SheetsSyncResult {
  surveyResponses: { processed: number; referralsFound: number; signalsCreated: number };
  referralSheet: { processed: number; referralsCreated: number; connectionsCreated: number };
}

export interface SheetsSyncConfig {
  surveySpreadsheetId?: string;
  surveyRange?: string;
  referralSpreadsheetId?: string;
  referralRange?: string;
  apiKey: string;
}

export async function syncSheets(
  db: DbClient,
  config: SheetsSyncConfig,
  options?: { dryRun?: boolean }
): Promise<SheetsSyncResult> {
  const result: SheetsSyncResult = {
    surveyResponses: { processed: 0, referralsFound: 0, signalsCreated: 0 },
    referralSheet: { processed: 0, referralsCreated: 0, connectionsCreated: 0 },
  };

  // ─── Sync Survey Responses ───
  if (config.surveySpreadsheetId) {
    console.log('  Fetching survey responses...');
    const range = config.surveyRange ?? 'Form Responses 1';
    const rows = await fetchSheetData(config.surveySpreadsheetId, range, config.apiKey);

    if (rows.length < 2) {
      console.log('  No survey data found');
    } else {
      const headers = rows[0];
      const dataRows = rows.slice(1);
      console.log(`  Found ${dataRows.length} survey responses`);

      // Build email → champion + account lookups
      const allChampions = await db.select().from(champions);
      const allAccounts = await db.select().from(accounts);
      const emailToChampion = new Map(
        allChampions.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c])
      );
      const nameToAccount = new Map(
        allAccounts.map((a) => [a.companyName.toLowerCase(), a])
      );

      for (const row of dataRows) {
        const survey = parseSurveyRow(headers, row);
        if (!survey) continue;
        result.surveyResponses.processed++;

        // Match to champion
        const champion = survey.email
          ? emailToChampion.get(survey.email.toLowerCase())
          : undefined;

        // Create NPS trigger event if score provided
        if (survey.npsScore !== undefined && champion && !options?.dryRun) {
          await db.insert(triggerEvents).values({
            accountId: champion.accountId,
            championId: champion.id,
            eventType: survey.npsScore >= 9 ? 'nps_high' : survey.npsScore >= 7 ? 'nps_moderate' : 'nps_low',
            eventCategory: 'relationship',
            eventDescription: `Survey NPS: ${survey.npsScore}/10${survey.testimonial ? ` — "${survey.testimonial.slice(0, 100)}"` : ''}`,
            eventDate: new Date(survey.timestamp),
            dataSource: 'survey',
            isAntiTrigger: survey.npsScore < 7,
          });
          result.surveyResponses.signalsCreated++;
        }

        // Process referrals from survey
        for (const ref of survey.referrals) {
          result.surveyResponses.referralsFound++;

          if (!champion || options?.dryRun) continue;

          // Create connection map entry
          await db.insert(connectionMaps).values({
            championId: champion.id,
            targetCompany: ref.company ?? 'Unknown',
            targetContact: ref.name,
            targetTitle: 'Unknown', // Survey doesn't capture title
            connectionPath: `Survey referral from ${survey.name} (${survey.company})`,
            connectionStrengthScore: 8, // Survey referrals are warm by definition
            suggestedFraming: `${survey.name} recommended reaching out to ${ref.name}${ref.company ? ` at ${ref.company}` : ''} via post-engagement survey.`,
          });
          result.surveyResponses.signalsCreated++;
        }
      }

      console.log(`  Processed ${result.surveyResponses.processed} surveys, found ${result.surveyResponses.referralsFound} referrals`);
    }
  }

  // ─── Sync Referral Tracking Sheet ───
  if (config.referralSpreadsheetId) {
    console.log('  Fetching referral tracking sheet...');
    const range = config.referralRange ?? 'Sheet1';
    const rows = await fetchSheetData(config.referralSpreadsheetId, range, config.apiKey);

    if (rows.length < 2) {
      console.log('  No referral sheet data found');
    } else {
      const headers = rows[0];
      const dataRows = rows.slice(1);
      console.log(`  Found ${dataRows.length} referral entries`);

      // Build lookups
      const allChampions = await db.select().from(champions);
      const allAccounts = await db.select().from(accounts);
      const nameToChampion = new Map(
        allChampions.map((c) => [c.name.toLowerCase(), c])
      );
      const nameToAccount = new Map(
        allAccounts.map((a) => [a.companyName.toLowerCase(), a])
      );

      for (const row of dataRows) {
        const entry = parseReferralSheetRow(headers, row);
        if (!entry || (!entry.sourceCompany && !entry.targetCompany)) continue;
        result.referralSheet.processed++;

        if (options?.dryRun) continue;

        // Find source champion
        const champion = nameToChampion.get(entry.sourceContact.toLowerCase());
        const sourceAccount = nameToAccount.get(entry.sourceCompany.toLowerCase());

        if (!champion || !sourceAccount) continue;

        // Create connection map
        await db.insert(connectionMaps).values({
          championId: champion.id,
          targetCompany: entry.targetCompany,
          targetContact: entry.targetContact,
          targetTitle: entry.targetTitle ?? 'Unknown',
          targetLinkedinUrl: null,
          connectionPath: `Referral sheet: ${entry.sourceContact} (${entry.sourceCompany}) → ${entry.targetContact} (${entry.targetCompany})`,
          connectionStrengthScore: 9, // Explicit referrals are very warm
          suggestedFraming: entry.notes ?? `${entry.sourceContact} referred ${entry.targetContact} at ${entry.targetCompany}.`,
        });
        result.referralSheet.connectionsCreated++;

        // Create referral record if status indicates progression
        const status = mapSheetStatus(entry.status);
        if (status) {
          await db.insert(referrals).values({
            accountId: sourceAccount.id,
            championId: champion.id,
            targetCompany: entry.targetCompany,
            targetContact: entry.targetContact,
            targetTitle: entry.targetTitle ?? 'Unknown',
            askType: 'live',
            triggerEvent: 'manual_referral_sheet',
            status,
            askDate: entry.date ? new Date(entry.date) : new Date(),
          });
          result.referralSheet.referralsCreated++;
        }
      }

      console.log(`  Processed ${result.referralSheet.processed} entries, created ${result.referralSheet.referralsCreated} referrals`);
    }
  }

  return result;
}

function mapSheetStatus(status?: string): 'ask_pending' | 'intro_sent' | 'meeting_booked' | 'opportunity_created' | 'closed_won' | 'closed_lost' | null {
  if (!status) return 'ask_pending';
  const s = status.toLowerCase();
  if (s.includes('won') || s.includes('closed won')) return 'closed_won';
  if (s.includes('lost') || s.includes('closed lost')) return 'closed_lost';
  if (s.includes('opp') || s.includes('pipeline')) return 'opportunity_created';
  if (s.includes('meeting') || s.includes('demo')) return 'meeting_booked';
  if (s.includes('intro') || s.includes('sent')) return 'intro_sent';
  if (s.includes('pending') || s.includes('new')) return 'ask_pending';
  return 'ask_pending';
}
