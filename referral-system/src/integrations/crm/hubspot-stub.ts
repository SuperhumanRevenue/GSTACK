import type {
  CRMAdapter,
  CRMAccount,
  CRMContact,
  CRMOpportunity,
  AccountFilters,
  CreateOpportunityInput,
  ActivityInput,
  ReferralCustomFields,
} from './interface.js';

/**
 * HubSpot stub — returns fixture data for development and testing.
 * Replace with real HubSpot API calls in Phase 5.
 */
export class HubSpotStub implements CRMAdapter {
  private accounts: Map<string, CRMAccount> = new Map();
  private contacts: Map<string, CRMContact[]> = new Map();
  private opportunities: Map<string, CRMOpportunity[]> = new Map();
  private activityLog: ActivityInput[] = [];

  constructor(initialAccounts?: CRMAccount[]) {
    if (initialAccounts) {
      for (const account of initialAccounts) {
        this.accounts.set(account.id, account);
      }
    }
  }

  async getAccount(accountId: string): Promise<CRMAccount> {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    return account;
  }

  async listAccounts(filters?: AccountFilters): Promise<CRMAccount[]> {
    let results = Array.from(this.accounts.values());
    if (filters?.industry) {
      results = results.filter((a) => a.industry === filters.industry);
    }
    if (filters?.minAcv !== undefined) {
      results = results.filter((a) => (a.annualRevenue ?? 0) >= filters.minAcv!);
    }
    return results;
  }

  async getAccountContacts(accountId: string): Promise<CRMContact[]> {
    return this.contacts.get(accountId) ?? [];
  }

  async createOpportunity(data: CreateOpportunityInput): Promise<string> {
    const id = `opp_${Date.now()}`;
    const opp: CRMOpportunity = {
      id,
      accountId: data.accountId,
      name: data.name,
      amount: data.amount,
      stage: data.stage,
      closeDate: data.closeDate,
      source: data.source,
      referralId: data.referralId,
    };
    const existing = this.opportunities.get(data.accountId) ?? [];
    existing.push(opp);
    this.opportunities.set(data.accountId, existing);
    return id;
  }

  async updateOpportunity(oppId: string, data: Partial<CRMOpportunity>): Promise<void> {
    for (const [, opps] of this.opportunities) {
      const opp = opps.find((o) => o.id === oppId);
      if (opp) {
        Object.assign(opp, data);
        return;
      }
    }
  }

  async getOpportunitiesByAccount(accountId: string): Promise<CRMOpportunity[]> {
    return this.opportunities.get(accountId) ?? [];
  }

  async logActivity(data: ActivityInput): Promise<void> {
    this.activityLog.push(data);
  }

  async setReferralFields(_accountId: string, _fields: ReferralCustomFields): Promise<void> {
    // Stub — no-op
  }

  // Test helpers
  seedAccount(account: CRMAccount): void {
    this.accounts.set(account.id, account);
  }

  seedContacts(accountId: string, contacts: CRMContact[]): void {
    this.contacts.set(accountId, contacts);
  }

  getActivityLog(): ActivityInput[] {
    return this.activityLog;
  }
}
