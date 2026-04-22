/** Types for Portfolio/Subsidiary Mapping */

export type EntityRelationType =
  | 'parent_subsidiary'
  | 'pe_portfolio'
  | 'vc_portfolio'
  | 'holding_company'
  | 'joint_venture'
  | 'strategic_partner';

export type ReferralOpportunityType =
  | 'portfolio_expansion' // Same PE/VC, different portfolio co
  | 'subsidiary_cross_sell' // Same parent, different subsidiary
  | 'holding_lateral' // Same holding co, different division
  | 'investor_intro' // Investor-facilitated intro;
  | 'partner_referral'; // Strategic partner intro

export interface CorporateEntity {
  name: string;
  entityType: 'company' | 'investor' | 'holding_company';
  industry?: string;
  website?: string;
  employeeCount?: number;
}

export interface EntityRelationship {
  parentEntity: CorporateEntity;
  childEntity: CorporateEntity;
  relationType: EntityRelationType;
  confidence: number; // 0-1
  source: string; // 'apollo' | 'web_search' | 'manual' | 'crm'
  verifiedAt?: Date;
}

export interface PortfolioMap {
  investorName: string;
  investorType: 'pe' | 'vc' | 'holding_company' | 'corporate';
  portfolioCompanies: {
    name: string;
    industry?: string;
    isCustomer: boolean;
    accountId?: string;
    investmentDate?: string;
    investmentStage?: string;
  }[];
  totalCompanies: number;
  customerOverlap: number; // How many are already customers
}

export interface SecondOrderOpportunity {
  sourceAccount: string; // Your existing customer
  sourceAccountId: string;
  targetCompany: string;
  connectionType: ReferralOpportunityType;
  connectionPath: string; // e.g. "Acme → Sequoia Capital → TargetCo"
  intermediary: string; // The PE/VC/parent connecting them
  confidence: number; // 0-1
  estimatedAcv?: number;
  rationale: string;
  suggestedApproach: string;
}

export interface PortfolioAnalysisResult {
  totalEntitiesMapped: number;
  totalRelationships: number;
  portfoliosMapped: number;
  secondOrderOpportunities: SecondOrderOpportunity[];
  topInvestors: { name: string; portfolioSize: number; customerOverlap: number }[];
}
