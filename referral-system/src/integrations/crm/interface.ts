/** CRM adapter interface — implemented by HubSpot (primary) and Salesforce */
export interface CRMAdapter {
  getAccount(accountId: string): Promise<CRMAccount>;
  listAccounts(filters?: AccountFilters): Promise<CRMAccount[]>;
  getAccountContacts(accountId: string): Promise<CRMContact[]>;
  createOpportunity(data: CreateOpportunityInput): Promise<string>;
  updateOpportunity(oppId: string, data: Partial<CRMOpportunity>): Promise<void>;
  getOpportunitiesByAccount(accountId: string): Promise<CRMOpportunity[]>;
  logActivity(data: ActivityInput): Promise<void>;
  setReferralFields(accountId: string, fields: ReferralCustomFields): Promise<void>;
}

export interface CRMAccount {
  id: string;
  name: string;
  industry?: string;
  employeeCount?: number;
  annualRevenue?: number;
  website?: string;
  healthScore?: number;
  npsScore?: number;
  lastActivityDate?: Date;
  contractStartDate?: Date;
  renewalDate?: Date;
  metadata?: Record<string, unknown>;
}

export interface CRMContact {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  phone?: string;
  linkedinUrl?: string;
  isDecisionMaker?: boolean;
  lastActivityDate?: Date;
}

export interface CRMOpportunity {
  id: string;
  accountId: string;
  name: string;
  amount?: number;
  stage: string;
  closeDate?: Date;
  probability?: number;
  source?: string;
  referralId?: string;
}

export interface AccountFilters {
  industry?: string;
  minAcv?: number;
  maxAcv?: number;
  minEmployees?: number;
  maxEmployees?: number;
}

export interface CreateOpportunityInput {
  accountId: string;
  name: string;
  amount?: number;
  stage: string;
  closeDate?: Date;
  source: string;
  referralId?: string;
}

export interface ActivityInput {
  accountId: string;
  contactId?: string;
  type: 'referral_ask' | 'referral_intro' | 'referral_followup' | 'referral_close';
  subject: string;
  body: string;
  date: Date;
}

export interface ReferralCustomFields {
  referralStatus?: string;
  referralSource?: string;
  referralChampion?: string;
  referralDate?: Date;
}
