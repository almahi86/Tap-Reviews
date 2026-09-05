export interface Business {
  id: string;
  ownerUid: string;
  businessName: string;
  googleMapsReviewUrl: string;
  subscriptionStatus: 'active' | 'inactive' | 'trialing' | 'canceled';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackItem {
  id: string;
  businessId: string;
  rating: 'like' | 'dislike';
  customerNote: string;
  customerContact?: string;
  customerName?: string;
  status: 'new' | 'reviewed' | 'resolved';
  internalNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  isDemo?: boolean;
}

export type RatingFlowState = 'initial' | 'redirecting_like' | 'dislike_form' | 'dislike_submitted';
