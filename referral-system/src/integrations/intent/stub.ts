import type { IntentAdapter, IntentSignal, BuyerActivity } from './interface.js';

export class IntentStub implements IntentAdapter {
  async getIntentSignals(_companyName: string): Promise<IntentSignal[]> {
    return [];
  }

  async getBuyerActivity(_companyName: string): Promise<BuyerActivity[]> {
    return [];
  }
}
