export interface NotificationAdapter {
  sendReadinessDigest(channel: string, report: ReadinessDigest): Promise<void>;
  sendAskForApproval(userId: string, ask: AskApprovalRequest): Promise<ApprovalResponse>;
  sendReferralUpdate(channel: string, update: ReferralStatusUpdate): Promise<void>;
  sendSuperReferrerAlert(channel: string, alert: SuperReferrerAlert): Promise<void>;
}

export interface ReadinessDigest {
  hotAccounts: { name: string; score: number; trigger: string }[];
  warmAccounts: { name: string; score: number }[];
  newTriggers: { account: string; event: string }[];
}

export interface AskApprovalRequest {
  referralId: string;
  championName: string;
  targetCompany: string;
  askType: string;
  askContent: string;
}

export interface ApprovalResponse {
  approved: boolean;
  modifiedContent?: string;
  notes?: string;
}

export interface ReferralStatusUpdate {
  referralId: string;
  championName: string;
  targetCompany: string;
  oldStatus: string;
  newStatus: string;
  details?: string;
}

export interface SuperReferrerAlert {
  championName: string;
  company: string;
  newTier: string;
  oldTier?: string;
  totalReferrals: number;
  totalRevenue: number;
}
