import type {
  EnrichmentAdapter,
  PersonEnrichInput,
  EnrichedPerson,
  CompanyEnrichInput,
  EnrichedCompany,
  ConnectionFilters,
  EnrichedConnection,
  MutualConnection,
} from './interface.js';

export class EnrichmentStub implements EnrichmentAdapter {
  async enrichPerson(input: PersonEnrichInput): Promise<EnrichedPerson> {
    return {
      id: `person_${Date.now()}`,
      name: input.name ?? 'Unknown',
      title: 'VP of Engineering',
      company: 'Acme Corp',
      linkedinUrl: input.linkedinUrl,
      networkReachScore: 65,
      formerCompanies: ['PreviousCo', 'StartupXYZ'],
      industryCommunities: ['SaaStr', 'Pavilion'],
      seniorityLevel: 'vp',
      notableConnections: [
        { name: 'Jane Smith', title: 'CTO', company: 'TargetCo' },
      ],
    };
  }

  async enrichCompany(input: CompanyEnrichInput): Promise<EnrichedCompany> {
    return {
      id: `company_${Date.now()}`,
      name: input.name ?? 'Unknown Corp',
      domain: input.domain,
      industry: 'Technology',
      employeeCount: 500,
      annualRevenue: 50000000,
      technologies: ['AWS', 'React', 'PostgreSQL'],
      fundingStage: 'Series C',
    };
  }

  async getConnections(_personId: string, _filters?: ConnectionFilters): Promise<EnrichedConnection[]> {
    return [
      {
        id: 'conn_1',
        name: 'Jane Smith',
        title: 'CTO',
        company: 'TargetCo',
        connectionType: 'former_colleague',
        connectionStrength: 8,
      },
      {
        id: 'conn_2',
        name: 'Bob Johnson',
        title: 'VP Sales',
        company: 'AnotherCo',
        connectionType: 'linkedin',
        connectionStrength: 5,
      },
    ];
  }

  async findMutualConnections(_person1: string, _person2: string): Promise<MutualConnection[]> {
    return [];
  }
}
