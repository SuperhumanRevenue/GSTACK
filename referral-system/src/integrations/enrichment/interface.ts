export interface EnrichmentAdapter {
  enrichPerson(input: PersonEnrichInput): Promise<EnrichedPerson>;
  enrichCompany(input: CompanyEnrichInput): Promise<EnrichedCompany>;
  getConnections(personId: string, filters?: ConnectionFilters): Promise<EnrichedConnection[]>;
  findMutualConnections(person1: string, person2: string): Promise<MutualConnection[]>;
}

export interface PersonEnrichInput {
  name?: string;
  email?: string;
  linkedinUrl?: string;
}

export interface EnrichedPerson {
  id: string;
  name: string;
  title?: string;
  company?: string;
  linkedinUrl?: string;
  networkReachScore: number; // 0-100
  formerCompanies: string[];
  industryCommunities: string[];
  seniorityLevel?: string;
  notableConnections: { name: string; title: string; company: string }[];
}

export interface CompanyEnrichInput {
  name?: string;
  domain?: string;
}

export interface EnrichedCompany {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  employeeCount?: number;
  annualRevenue?: number;
  technologies?: string[];
  fundingStage?: string;
}

export interface ConnectionFilters {
  industries?: string[];
  minEmployees?: number;
  maxEmployees?: number;
  titles?: string[];
}

export interface EnrichedConnection {
  id: string;
  name: string;
  title: string;
  company: string;
  connectionType: 'former_colleague' | 'linkedin' | 'community' | 'other';
  connectionStrength: number; // 1-10
}

export interface MutualConnection {
  id: string;
  name: string;
  title: string;
  company: string;
  sharedWith: string[];
}
