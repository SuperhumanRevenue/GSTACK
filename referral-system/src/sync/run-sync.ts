#!/usr/bin/env tsx
/**
 * Sync Orchestrator — Runs all data sync modules.
 *
 * Usage:
 *   bun run sync              # Run all syncs
 *   bun run sync:hubspot      # HubSpot only
 *   bun run sync:fathom       # Fathom only
 *   bun run sync:sheets       # Google Sheets only
 *
 * Environment variables:
 *   HUBSPOT_ACCESS_TOKEN     — HubSpot private app token
 *   FATHOM_API_KEY           — Fathom API key
 *   GOOGLE_SHEETS_API_KEY    — Google Sheets API key
 *   SURVEY_SPREADSHEET_ID    — Survey responses spreadsheet ID
 *   REFERRAL_SPREADSHEET_ID  — Referral tracking spreadsheet ID
 *   DATABASE_URL             — PostgreSQL connection string
 *   DRY_RUN=1               — Preview without writing to DB
 */

import 'dotenv/config';
import { createDbClient } from '../db/client.js';
import { syncHubSpot, type HubSpotSyncResult } from './hubspot-sync.js';
import { syncFathom, type FathomSyncResult } from './fathom-sync.js';
import { syncSheets, type SheetsSyncResult } from './sheets-sync.js';

interface SyncAllResult {
  hubspot?: HubSpotSyncResult;
  fathom?: FathomSyncResult;
  sheets?: SheetsSyncResult;
  errors: { source: string; error: string }[];
  durationMs: number;
}

export async function runAllSyncs(options?: {
  sources?: ('hubspot' | 'fathom' | 'sheets')[];
  dryRun?: boolean;
  since?: Date;
}): Promise<SyncAllResult> {
  const start = Date.now();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const db = createDbClient(databaseUrl);
  const dryRun = options?.dryRun ?? process.env.DRY_RUN === '1';
  const sources = options?.sources ?? ['hubspot', 'fathom', 'sheets'];

  const result: SyncAllResult = { errors: [], durationMs: 0 };

  if (dryRun) console.log('🔍 DRY RUN — no data will be written\n');

  // ─── HubSpot ───
  if (sources.includes('hubspot')) {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) {
      result.errors.push({ source: 'hubspot', error: 'HUBSPOT_ACCESS_TOKEN not set' });
      console.log('⚠ Skipping HubSpot (no token)\n');
    } else {
      try {
        console.log('━━━ HubSpot Sync ━━━');
        result.hubspot = await syncHubSpot(db, token, { dryRun });
        console.log('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ source: 'hubspot', error: msg });
        console.error(`✗ HubSpot sync failed: ${msg}\n`);
      }
    }
  }

  // ─── Fathom ───
  if (sources.includes('fathom')) {
    const token = process.env.FATHOM_API_KEY;
    if (!token) {
      result.errors.push({ source: 'fathom', error: 'FATHOM_API_KEY not set' });
      console.log('⚠ Skipping Fathom (no API key)\n');
    } else {
      try {
        console.log('━━━ Fathom Sync ━━━');
        result.fathom = await syncFathom(db, token, { dryRun, since: options?.since });
        console.log('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ source: 'fathom', error: msg });
        console.error(`✗ Fathom sync failed: ${msg}\n`);
      }
    }
  }

  // ─── Google Sheets ───
  if (sources.includes('sheets')) {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) {
      result.errors.push({ source: 'sheets', error: 'GOOGLE_SHEETS_API_KEY not set' });
      console.log('⚠ Skipping Sheets (no API key)\n');
    } else {
      try {
        console.log('━━━ Google Sheets Sync ━━━');
        result.sheets = await syncSheets(db, {
          apiKey,
          surveySpreadsheetId: process.env.SURVEY_SPREADSHEET_ID,
          surveyRange: process.env.SURVEY_SHEET_RANGE,
          referralSpreadsheetId: process.env.REFERRAL_SPREADSHEET_ID,
          referralRange: process.env.REFERRAL_SHEET_RANGE,
        }, { dryRun });
        console.log('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ source: 'sheets', error: msg });
        console.error(`✗ Sheets sync failed: ${msg}\n`);
      }
    }
  }

  result.durationMs = Date.now() - start;

  // ─── Summary ───
  console.log('━━━ Sync Summary ━━━');
  if (result.hubspot) {
    const h = result.hubspot;
    console.log(`  HubSpot: ${h.accounts.synced} accounts, ${h.champions.synced} champions, ${h.deals.synced} deals, ${h.triggers.created} triggers`);
  }
  if (result.fathom) {
    const f = result.fathom;
    console.log(`  Fathom: ${f.callsProcessed} calls, ${f.signalsCreated} signals, ${f.championsUpdated} champions updated`);
  }
  if (result.sheets) {
    const s = result.sheets;
    console.log(`  Sheets: ${s.surveyResponses.processed} surveys (${s.surveyResponses.referralsFound} referrals), ${s.referralSheet.processed} referral entries`);
  }
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.map((e) => `${e.source}: ${e.error}`).join(', ')}`);
  }
  console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

  return result;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const sourceArg = args[0];

  let sources: ('hubspot' | 'fathom' | 'sheets')[] | undefined;
  if (sourceArg === 'hubspot') sources = ['hubspot'];
  else if (sourceArg === 'fathom') sources = ['fathom'];
  else if (sourceArg === 'sheets') sources = ['sheets'];

  runAllSyncs({ sources }).catch((err) => {
    console.error('Fatal sync error:', err);
    process.exit(1);
  });
}

// Only run when executed directly (not when imported)
const isDirectExecution = process.argv[1]?.includes('run-sync');
if (isDirectExecution) main();
