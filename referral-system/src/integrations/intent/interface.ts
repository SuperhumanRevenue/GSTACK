export interface IntentAdapter {
  getIntentSignals(companyName: string): Promise<IntentSignal[]>;
  getBuyerActivity(companyName: string): Promise<BuyerActivity[]>;
}

export interface IntentSignal {
  company: string;
  topic: string;
  intensity: 'high' | 'medium' | 'low';
  trend: 'surging' | 'stable' | 'declining';
  firstSeen: Date;
  lastSeen: Date;
}

export interface BuyerActivity {
  company: string;
  activityType: string;
  date: Date;
  description: string;
  confidence: number;
}
