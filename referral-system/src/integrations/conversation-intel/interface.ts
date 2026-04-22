export interface ConversationIntelAdapter {
  getRecentCalls(accountId: string, since: Date): Promise<CallSummary[]>;
  getSentimentTrend(accountId: string, period: string): Promise<SentimentTrend>;
  detectPraiseEvents(accountId: string, since: Date): Promise<PraiseEvent[]>;
  detectCompetitorMentions(accountId: string, since: Date): Promise<CompetitorMention[]>;
  detectExpansionSignals(accountId: string, since: Date): Promise<ExpansionSignal[]>;
}

export interface CallSummary {
  id: string;
  accountId: string;
  date: Date;
  duration: number; // minutes
  participants: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  keyTopics: string[];
  summary: string;
}

export interface SentimentTrend {
  accountId: string;
  period: string;
  trend: 'improving' | 'stable' | 'declining';
  averageSentiment: number; // -1 to 1
  callCount: number;
}

export interface PraiseEvent {
  id: string;
  accountId: string;
  date: Date;
  speaker: string;
  quote: string;
  context: string;
}

export interface CompetitorMention {
  id: string;
  accountId: string;
  date: Date;
  competitor: string;
  context: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface ExpansionSignal {
  id: string;
  accountId: string;
  date: Date;
  signalType: string;
  description: string;
  confidence: number; // 0-1
}
