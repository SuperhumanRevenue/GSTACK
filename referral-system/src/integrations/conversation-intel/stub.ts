import type {
  ConversationIntelAdapter,
  CallSummary,
  SentimentTrend,
  PraiseEvent,
  CompetitorMention,
  ExpansionSignal,
} from './interface.js';

export class ConversationIntelStub implements ConversationIntelAdapter {
  async getRecentCalls(_accountId: string, _since: Date): Promise<CallSummary[]> {
    return [];
  }

  async getSentimentTrend(accountId: string, period: string): Promise<SentimentTrend> {
    return {
      accountId,
      period,
      trend: 'stable',
      averageSentiment: 0.5,
      callCount: 0,
    };
  }

  async detectPraiseEvents(_accountId: string, _since: Date): Promise<PraiseEvent[]> {
    return [];
  }

  async detectCompetitorMentions(_accountId: string, _since: Date): Promise<CompetitorMention[]> {
    return [];
  }

  async detectExpansionSignals(_accountId: string, _since: Date): Promise<ExpansionSignal[]> {
    return [];
  }
}
