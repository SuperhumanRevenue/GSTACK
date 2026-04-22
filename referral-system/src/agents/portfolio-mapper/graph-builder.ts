/**
 * Graph Builder — Builds and queries a corporate relationship graph.
 *
 * Pure function engine that takes entity relationships and identifies
 * second-order referral opportunities through shared investors,
 * parent companies, and strategic partners.
 */

import type {
  EntityRelationship,
  SecondOrderOpportunity,
  ReferralOpportunityType,
  PortfolioMap,
} from './types.js';

interface GraphNode {
  name: string;
  entityType: 'company' | 'investor' | 'holding_company';
  isCustomer: boolean;
  accountId?: string;
  industry?: string;
}

interface GraphEdge {
  from: string; // node name
  to: string; // node name
  relationType: EntityRelationship['relationType'];
  confidence: number;
}

/**
 * Build a relationship graph from entity relationships.
 */
export function buildGraph(
  relationships: EntityRelationship[],
  customerAccounts: { name: string; accountId: string; industry?: string }[]
): { nodes: Map<string, GraphNode>; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const customerSet = new Map(customerAccounts.map((c) => [c.name.toLowerCase(), c]));

  for (const rel of relationships) {
    // Add parent node
    const parentKey = rel.parentEntity.name.toLowerCase();
    if (!nodes.has(parentKey)) {
      const customer = customerSet.get(parentKey);
      nodes.set(parentKey, {
        name: rel.parentEntity.name,
        entityType: rel.parentEntity.entityType,
        isCustomer: !!customer,
        accountId: customer?.accountId,
        industry: rel.parentEntity.industry,
      });
    }

    // Add child node
    const childKey = rel.childEntity.name.toLowerCase();
    if (!nodes.has(childKey)) {
      const customer = customerSet.get(childKey);
      nodes.set(childKey, {
        name: rel.childEntity.name,
        entityType: rel.childEntity.entityType,
        isCustomer: !!customer,
        accountId: customer?.accountId,
        industry: rel.childEntity.industry,
      });
    }

    edges.push({
      from: parentKey,
      to: childKey,
      relationType: rel.relationType,
      confidence: rel.confidence,
    });
  }

  return { nodes, edges };
}

/**
 * Find second-order referral opportunities:
 * Customer → Shared Entity (investor/parent) → Non-Customer Target
 */
export function findSecondOrderOpportunities(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[]
): SecondOrderOpportunity[] {
  const opportunities: SecondOrderOpportunity[] = [];

  // Build adjacency lists
  const neighbors = new Map<string, { node: string; edge: GraphEdge }[]>();
  for (const edge of edges) {
    // Bidirectional
    if (!neighbors.has(edge.from)) neighbors.set(edge.from, []);
    if (!neighbors.has(edge.to)) neighbors.set(edge.to, []);
    neighbors.get(edge.from)!.push({ node: edge.to, edge });
    neighbors.get(edge.to)!.push({ node: edge.from, edge });
  }

  // For each customer, find 2-hop paths to non-customers through intermediaries
  for (const [nodeKey, node] of nodes) {
    if (!node.isCustomer) continue;

    const myNeighbors = neighbors.get(nodeKey) ?? [];
    for (const { node: intermediaryKey, edge: edge1 } of myNeighbors) {
      const intermediary = nodes.get(intermediaryKey);
      if (!intermediary) continue;

      // Intermediary should be an investor or holding company
      if (intermediary.entityType === 'company' && edge1.relationType !== 'strategic_partner') continue;

      const intermediaryNeighbors = neighbors.get(intermediaryKey) ?? [];
      for (const { node: targetKey, edge: edge2 } of intermediaryNeighbors) {
        if (targetKey === nodeKey) continue; // skip self
        const target = nodes.get(targetKey);
        if (!target) continue;
        if (target.isCustomer) continue; // already a customer
        if (target.entityType !== 'company') continue; // only target companies

        const connectionType = classifyOpportunityType(edge1.relationType, edge2.relationType);
        const confidence = Math.min(edge1.confidence, edge2.confidence);

        opportunities.push({
          sourceAccount: node.name,
          sourceAccountId: node.accountId ?? '',
          targetCompany: target.name,
          connectionType,
          connectionPath: `${node.name} → ${intermediary.name} → ${target.name}`,
          intermediary: intermediary.name,
          confidence,
          rationale: buildRationale(connectionType, intermediary.name, node.name, target.name),
          suggestedApproach: buildApproach(connectionType, intermediary.name),
        });
      }
    }
  }

  // Deduplicate and sort by confidence
  const seen = new Set<string>();
  const unique = opportunities.filter((o) => {
    const key = `${o.sourceAccountId}:${o.targetCompany}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => b.confidence - a.confidence);
  return unique;
}

/**
 * Build portfolio maps from the graph — grouped by investor/parent.
 */
export function buildPortfolioMaps(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[]
): PortfolioMap[] {
  // Find all investor/holding company nodes
  const portfolios = new Map<string, PortfolioMap>();

  for (const edge of edges) {
    const parent = nodes.get(edge.from);
    const child = nodes.get(edge.to);
    if (!parent || !child) continue;

    // Determine the investor/holding company
    let investorKey: string;
    let investorNode: GraphNode;
    let portfolioCo: GraphNode;

    if (parent.entityType === 'investor' || parent.entityType === 'holding_company') {
      investorKey = edge.from;
      investorNode = parent;
      portfolioCo = child;
    } else if (child.entityType === 'investor' || child.entityType === 'holding_company') {
      investorKey = edge.to;
      investorNode = child;
      portfolioCo = parent;
    } else {
      continue;
    }

    if (!portfolios.has(investorKey)) {
      portfolios.set(investorKey, {
        investorName: investorNode.name,
        investorType: investorNode.entityType === 'investor'
          ? (edge.relationType === 'pe_portfolio' ? 'pe' : 'vc')
          : 'holding_company',
        portfolioCompanies: [],
        totalCompanies: 0,
        customerOverlap: 0,
      });
    }

    const portfolio = portfolios.get(investorKey)!;
    // Avoid duplicates
    if (!portfolio.portfolioCompanies.some((c) => c.name === portfolioCo.name)) {
      portfolio.portfolioCompanies.push({
        name: portfolioCo.name,
        industry: portfolioCo.industry,
        isCustomer: portfolioCo.isCustomer,
        accountId: portfolioCo.accountId,
      });
    }
  }

  // Compute totals
  for (const portfolio of portfolios.values()) {
    portfolio.totalCompanies = portfolio.portfolioCompanies.length;
    portfolio.customerOverlap = portfolio.portfolioCompanies.filter((c) => c.isCustomer).length;
  }

  return [...portfolios.values()].sort((a, b) => b.customerOverlap - a.customerOverlap);
}

// ─── Internal helpers ───

function classifyOpportunityType(
  edge1Type: EntityRelationship['relationType'],
  edge2Type: EntityRelationship['relationType']
): ReferralOpportunityType {
  if (edge1Type === 'pe_portfolio' || edge2Type === 'pe_portfolio') return 'portfolio_expansion';
  if (edge1Type === 'vc_portfolio' || edge2Type === 'vc_portfolio') return 'investor_intro';
  if (edge1Type === 'parent_subsidiary' || edge2Type === 'parent_subsidiary') return 'subsidiary_cross_sell';
  if (edge1Type === 'holding_company' || edge2Type === 'holding_company') return 'holding_lateral';
  if (edge1Type === 'strategic_partner' || edge2Type === 'strategic_partner') return 'partner_referral';
  return 'portfolio_expansion';
}

function buildRationale(
  type: ReferralOpportunityType,
  intermediary: string,
  source: string,
  target: string
): string {
  switch (type) {
    case 'portfolio_expansion':
      return `${source} and ${target} are both in ${intermediary}'s portfolio. Success at ${source} creates a warm intro path.`;
    case 'subsidiary_cross_sell':
      return `${target} is a sibling subsidiary under ${intermediary}. Cross-divisional referrals have high credibility.`;
    case 'holding_lateral':
      return `Both companies operate under ${intermediary}. Lateral expansion within holding companies has proven high conversion.`;
    case 'investor_intro':
      return `${intermediary} invested in both companies. Investor-facilitated intros carry significant weight.`;
    case 'partner_referral':
      return `${intermediary} partners with both ${source} and ${target}. Strategic partner intros align incentives.`;
  }
}

function buildApproach(type: ReferralOpportunityType, intermediary: string): string {
  switch (type) {
    case 'portfolio_expansion':
    case 'investor_intro':
      return `Request intro through ${intermediary} partner relations. Lead with portfolio success story.`;
    case 'subsidiary_cross_sell':
      return `Leverage internal champion to request warm intro to sibling division. Highlight shared infrastructure benefits.`;
    case 'holding_lateral':
      return `Approach through corporate development or shared services team at ${intermediary}.`;
    case 'partner_referral':
      return `Co-sell through ${intermediary}. Joint value proposition with partner endorsement.`;
  }
}
