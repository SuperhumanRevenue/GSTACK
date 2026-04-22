/**
 * HubSpot Sync — Pulls companies, contacts, and deals into the referral system.
 *
 * Maps HubSpot objects to our schema:
 *   Companies → accounts
 *   Contacts  → champions
 *   Deals     → referrals (where source is referral) + trigger events
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { accounts, champions, referrals, triggerEvents } from '../db/schema.js';

const HUBSPOT_API = 'https://api.hubapi.com';

interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    industry?: string;
    numberofemployees?: string;
    annualrevenue?: string;
    hs_lead_status?: string;
    notes_last_updated?: string;
    [key: string]: string | undefined;
  };
}

interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    jobtitle?: string;
    email?: string;
    hs_linkedin_url?: string;
    associatedcompanyid?: string;
    notes_last_updated?: string;
    [key: string]: string | undefined;
  };
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    createdate?: string;
    pipeline?: string;
    hs_deal_stage_probability?: string;
    deal_source?: string;
    referred_by?: string;
    [key: string]: string | undefined;
  };
  associations?: {
    companies?: { results: { id: string }[] };
    contacts?: { results: { id: string }[] };
  };
}

// ─── API Client ───────────────────────────────────────────────────────────────

async function hubspotFetch<T>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${HUBSPOT_API}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`HubSpot API ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

async function fetchAllPages<T extends { id: string }>(
  path: string,
  token: string,
  properties: string[]
): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = {
      limit: '100',
      properties: properties.join(','),
    };
    if (after) params.after = after;

    const data = await hubspotFetch<{
      results: T[];
      paging?: { next?: { after: string } };
    }>(path, token, params);

    all.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);

  return all;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function inferSeniority(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('ceo') || t.includes('cto') || t.includes('cfo') || t.includes('coo') || t.includes('chief')) return 'c_suite';
  if (t.includes('vp') || t.includes('vice president')) return 'vp';
  if (t.includes('director') || t.includes('head of')) return 'director';
  return 'manager';
}

function inferRelationshipStrength(contact: HubSpotContact): string {
  const lastUpdated = contact.properties.notes_last_updated;
  if (!lastUpdated) return 'cold';
  const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / 86400000;
  if (daysSince < 30) return 'strong';
  if (daysSince < 90) return 'warm';
  return 'cold';
}

function mapDealStageToStatus(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes('closed') && s.includes('won')) return 'closed_won';
  if (s.includes('closed') && s.includes('lost')) return 'closed_lost';
  if (s.includes('proposal') || s.includes('contract')) return 'opportunity_created';
  if (s.includes('meeting') || s.includes('demo') || s.includes('qualified')) return 'meeting_booked';
  if (s.includes('intro') || s.includes('connect')) return 'intro_sent';
  return 'ask_pending';
}

// ─── Sync Functions ───────────────────────────────────────────────────────────

export interface HubSpotSyncResult {
  accounts: { synced: number; skipped: number };
  champions: { synced: number; skipped: number };
  deals: { synced: number; skipped: number };
  triggers: { created: number };
}

export async function syncHubSpot(
  db: DbClient,
  token: string,
  options?: { dryRun?: boolean }
): Promise<HubSpotSyncResult> {
  const result: HubSpotSyncResult = {
    accounts: { synced: 0, skipped: 0 },
    champions: { synced: 0, skipped: 0 },
    deals: { synced: 0, skipped: 0 },
    triggers: { created: 0 },
  };

  console.log('  Fetching HubSpot companies...');
  const companies = await fetchAllPages<HubSpotCompany>(
    '/crm/v3/objects/companies',
    token,
    ['name', 'industry', 'numberofemployees', 'annualrevenue', 'hs_lead_status', 'notes_last_updated']
  );
  console.log(`  Found ${companies.length} companies`);

  // Sync companies → accounts
  const companyIdToAccountId = new Map<string, string>();

  for (const company of companies) {
    if (!company.properties.name) { result.accounts.skipped++; continue; }

    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.crmAccountId, company.id))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db.update(accounts)
        .set({
          companyName: company.properties.name,
          industry: company.properties.industry ?? null,
          employeeCount: company.properties.numberofemployees ? parseInt(company.properties.numberofemployees) : null,
          currentAcv: company.properties.annualrevenue ?? null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.crmAccountId, company.id));
      companyIdToAccountId.set(company.id, existing[0].id);
    } else {
      // Insert new
      const [inserted] = await db.insert(accounts).values({
        crmAccountId: company.id,
        companyName: company.properties.name,
        industry: company.properties.industry ?? null,
        employeeCount: company.properties.numberofemployees ? parseInt(company.properties.numberofemployees) : null,
        currentAcv: company.properties.annualrevenue ?? null,
      }).returning({ id: accounts.id });
      companyIdToAccountId.set(company.id, inserted.id);
    }
    result.accounts.synced++;
  }

  console.log(`  Synced ${result.accounts.synced} accounts`);

  // Fetch contacts
  console.log('  Fetching HubSpot contacts...');
  const contacts = await fetchAllPages<HubSpotContact>(
    '/crm/v3/objects/contacts',
    token,
    ['firstname', 'lastname', 'jobtitle', 'email', 'hs_linkedin_url', 'associatedcompanyid', 'notes_last_updated']
  );
  console.log(`  Found ${contacts.length} contacts`);

  const contactIdToChampionId = new Map<string, string>();

  for (const contact of contacts) {
    const name = [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ');
    if (!name || !contact.properties.jobtitle) { result.champions.skipped++; continue; }

    const accountId = contact.properties.associatedcompanyid
      ? companyIdToAccountId.get(contact.properties.associatedcompanyid)
      : undefined;

    if (!accountId) { result.champions.skipped++; continue; }

    const existing = await db
      .select()
      .from(champions)
      .where(eq(champions.email, contact.properties.email ?? ''))
      .limit(1);

    const championData = {
      accountId,
      name,
      title: contact.properties.jobtitle,
      email: contact.properties.email ?? null,
      linkedinUrl: contact.properties.hs_linkedin_url ?? null,
      seniorityLevel: inferSeniority(contact.properties.jobtitle),
      relationshipStrength: inferRelationshipStrength(contact),
    };

    if (existing.length > 0) {
      await db.update(champions).set({ ...championData, updatedAt: new Date() }).where(eq(champions.id, existing[0].id));
      contactIdToChampionId.set(contact.id, existing[0].id);
    } else {
      const [inserted] = await db.insert(champions).values(championData).returning({ id: champions.id });
      contactIdToChampionId.set(contact.id, inserted.id);
    }
    result.champions.synced++;
  }

  console.log(`  Synced ${result.champions.synced} champions`);

  // Fetch deals
  console.log('  Fetching HubSpot deals...');
  const deals = await fetchAllPages<HubSpotDeal>(
    '/crm/v3/objects/deals',
    token,
    ['dealname', 'amount', 'dealstage', 'closedate', 'createdate', 'pipeline', 'deal_source', 'referred_by']
  );
  console.log(`  Found ${deals.length} deals`);

  for (const deal of deals) {
    if (!deal.properties.dealname) { result.deals.skipped++; continue; }

    // Create trigger events for closed-won deals
    const stage = deal.properties.dealstage ?? '';
    if (stage.toLowerCase().includes('closedwon') || stage.toLowerCase().includes('closed_won')) {
      const companyId = deal.associations?.companies?.results?.[0]?.id;
      const accountId = companyId ? companyIdToAccountId.get(companyId) : undefined;

      if (accountId) {
        await db.insert(triggerEvents).values({
          accountId,
          eventType: 'expansion_closed',
          eventCategory: 'business',
          eventDescription: `Deal closed: ${deal.properties.dealname} ($${deal.properties.amount ?? '?'})`,
          eventDate: deal.properties.closedate ? new Date(deal.properties.closedate) : new Date(),
          dataSource: 'crm',
          isAntiTrigger: false,
        });
        result.triggers.created++;
      }
    }

    result.deals.synced++;
  }

  console.log(`  Synced ${result.deals.synced} deals, created ${result.triggers.created} triggers`);

  return result;
}
