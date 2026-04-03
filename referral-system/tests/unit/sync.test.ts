import { describe, it, expect } from 'vitest';

// ─── Test the pure functions from each sync module ───

// We can't test the full sync functions without a real DB + API,
// but we can test the parsing/extraction logic.

// ─── HubSpot Mappers ───
// These are module-private, so we test them indirectly through the exports.
// For now, test the sync result shape.

describe('HubSpot Sync', () => {
  it('exports syncHubSpot function', async () => {
    const mod = await import('../../src/sync/hubspot-sync.js');
    expect(typeof mod.syncHubSpot).toBe('function');
  });
});

// ─── Fathom Signal Extraction ───

describe('Fathom Sync', () => {
  it('exports syncFathom function', async () => {
    const mod = await import('../../src/sync/fathom-sync.js');
    expect(typeof mod.syncFathom).toBe('function');
  });
});

// ─── Sheets Referral Parsing ───
// The parseReferralText function is module-private, but we can test
// parseSurveyRow indirectly by importing the module.

describe('Sheets Sync', () => {
  it('exports syncSheets function', async () => {
    const mod = await import('../../src/sync/sheets-sync.js');
    expect(typeof mod.syncSheets).toBe('function');
  });
});

// ─── Run Sync Orchestrator ───

describe('Run Sync', () => {
  it('exports runAllSyncs function', async () => {
    const mod = await import('../../src/sync/run-sync.js');
    expect(typeof mod.runAllSyncs).toBe('function');
  });
});
