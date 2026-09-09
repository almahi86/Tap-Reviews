export interface Business {
  id: string;
  ownerUid: string;
  businessName: string;
  googleMapsReviewUrl: string;
  googleReviewUrl?: string;
  subscriptionStatus: 'active' | 'inactive' | 'trialing' | 'canceled' | 'past_due';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackReply {
  id: string;
  message: string;
  sentAt: string;
  sentBy?: string;
  method: 'email' | 'sms' | 'system';
  recipientContact?: string;
}

export interface FeedbackItem {
  id: string;
  businessId: string;
  sentiment?: 'positive' | 'negative';
  message?: string;
  rating?: 'like' | 'dislike';
  customerNote?: string;
  customerContact?: string;
  customerName?: string;
  status?: 'new' | 'reviewed' | 'resolved';
  internalNote?: string;
  replies?: FeedbackReply[];
  lastRepliedAt?: string;
  createdAt: string | any;
  updatedAt?: string;
}

export interface AuthUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified?: boolean;
  isDemo?: boolean;
}

export interface VerificationCodeRecord {
  email: string;
  code: string;
  uid?: string;
  expiresAt: string; // ISO string
  createdAt: string;
}

export interface VerificationResult {
  success: boolean;
  message?: string;
  emailVerified?: boolean;
}

export type RatingFlowState = 'initial' | 'redirecting_like' | 'dislike_form' | 'dislike_submitted';
