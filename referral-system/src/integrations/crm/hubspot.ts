import pino from 'pino';
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

const logger = pino({ name: 'hubspot' });

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * HubSpot CRM adapter — maps HubSpot's API to our CRMAdapter interface.
 * Uses HubSpot's V3 API with private app access token.
 */
export class HubSpotAdapter implements CRMAdapter {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${HUBSPOT_API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, path }, 'HubSpot API error');
      throw new Error(`HubSpot API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async getAccount(accountId: string): Promise<CRMAccount> {
    const data = await this.request<HubSpotCompanyResponse>(
      `/crm/v3/objects/companies/${accountId}?properties=name,industry,numberofemployees,annualrevenue,website,hs_lead_status`
    );
    return mapCompanyToAccount(data);
  }

  async listAccounts(filters?: AccountFilters): Promise<CRMAccount[]> {
    const filterGroups: HubSpotFilterGroup[] = [];

    if (filters?.industry) {
      filterGroups.push({
        filters: [{ propertyName: 'industry', operator: 'EQ', value: filters.industry }],
      });
    }

    const data = await this.request<HubSpotSearchResponse>('/crm/v3/objects/companies/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: filterGroups.length > 0 ? filterGroups : undefined,
        properties: ['name', 'industry', 'numberofemployees', 'annualrevenue', 'website'],
        limit: 100,
      }),
    });

    return data.results.map(mapCompanyToAccount);
  }

  async getAccountContacts(accountId: string): Promise<CRMContact[]> {
    const data = await this.request<HubSpotAssociationsResponse>(
      `/crm/v3/objects/companies/${accountId}/associations/contacts`
    );

    const contacts: CRMContact[] = [];
    for (const assoc of data.results) {
      const contactData = await this.request<HubSpotContactResponse>(
        `/crm/v3/objects/contacts/${assoc.id}?properties=firstname,lastname,email,jobtitle,phone,hs_linkedinbio`
      );
      contacts.push(mapContactToCRMContact(contactData, accountId));
    }

    return contacts;
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<string> {
    const data = await this.request<HubSpotDealResponse>('/crm/v3/objects/deals', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          dealname: input.name,
          amount: input.amount?.toString(),
          dealstage: input.stage,
          closedate: input.closeDate?.toISOString(),
          pipeline: 'default',
          referral_source: input.source,
          referral_id: input.referralId,
        },
      }),
    });

    // Associate with company
    if (input.accountId) {
      await this.request(`/crm/v3/objects/deals/${data.id}/associations/companies/${input.accountId}/deal_to_company`, {
        method: 'PUT',
      });
    }

    return data.id;
  }

  async updateOpportunity(oppId: string, data: Partial<CRMOpportunity>): Promise<void> {
    const properties: Record<string, string> = {};
    if (data.amount !== undefined) properties.amount = data.amount.toString();
    if (data.stage) properties.dealstage = data.stage;
    if (data.closeDate) properties.closedate = data.closeDate.toISOString();

    await this.request(`/crm/v3/objects/deals/${oppId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }

  async getOpportunitiesByAccount(accountId: string): Promise<CRMOpportunity[]> {
    const data = await this.request<HubSpotAssociationsResponse>(
      `/crm/v3/objects/companies/${accountId}/associations/deals`
    );

    const opps: CRMOpportunity[] = [];
    for (const assoc of data.results) {
      const dealData = await this.request<HubSpotDealResponse>(
        `/crm/v3/objects/deals/${assoc.id}?properties=dealname,amount,dealstage,closedate,pipeline`
      );
      opps.push({
        id: dealData.id,
        accountId,
        name: dealData.properties.dealname ?? '',
        amount: dealData.properties.amount ? parseFloat(dealData.properties.amount) : undefined,
        stage: dealData.properties.dealstage ?? '',
        closeDate: dealData.properties.closedate ? new Date(dealData.properties.closedate) : undefined,
      });
    }

    return opps;
  }

  async logActivity(input: ActivityInput): Promise<void> {
    await this.request('/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_note_body: `[${input.type}] ${input.subject}\n\n${input.body}`,
          hs_timestamp: input.date.toISOString(),
        },
        associations: [
          {
            to: { id: input.accountId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }],
          },
        ],
      }),
    });
  }

  async setReferralFields(accountId: string, fields: ReferralCustomFields): Promise<void> {
    const properties: Record<string, string> = {};
    if (fields.referralStatus) properties.referral_status = fields.referralStatus;
    if (fields.referralSource) properties.referral_source = fields.referralSource;
    if (fields.referralChampion) properties.referral_champion = fields.referralChampion;
    if (fields.referralDate) properties.referral_date = fields.referralDate.toISOString();

    await this.request(`/crm/v3/objects/companies/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }
}

// ─── HubSpot Response Types ───

interface HubSpotCompanyResponse {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotContactResponse {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotDealResponse {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotSearchResponse {
  results: HubSpotCompanyResponse[];
  total: number;
}

interface HubSpotAssociationsResponse {
  results: { id: string; type: string }[];
}

interface HubSpotFilterGroup {
  filters: { propertyName: string; operator: string; value: string }[];
}

// ─── Mappers ───

function mapCompanyToAccount(data: HubSpotCompanyResponse): CRMAccount {
  return {
    id: data.id,
    name: data.properties.name ?? '',
    industry: data.properties.industry ?? undefined,
    employeeCount: data.properties.numberofemployees ? parseInt(data.properties.numberofemployees, 10) : undefined,
    annualRevenue: data.properties.annualrevenue ? parseFloat(data.properties.annualrevenue) : undefined,
    website: data.properties.website ?? undefined,
  };
}

function mapContactToCRMContact(data: HubSpotContactResponse, accountId: string): CRMContact {
  return {
    id: data.id,
    accountId,
    firstName: data.properties.firstname ?? '',
    lastName: data.properties.lastname ?? '',
    email: data.properties.email ?? undefined,
    title: data.properties.jobtitle ?? undefined,
    linkedinUrl: data.properties.hs_linkedinbio ?? undefined,
  };
}
