import { useState, useEffect, type FormEvent } from "react";
import {
  Shield,
  CreditCard,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  LogOut,
  Save,
  Radio,
  QrCode,
  Sparkles,
  User,
  ArrowRight,
  TrendingUp,
  Store,
  ThumbsUp,
  ThumbsDown,
  Mail,
  Phone,
  Send,
  CornerDownRight,
  CheckCheck,
  Lock,
  Settings,
  RefreshCw,
  X,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  fetchBusiness,
  saveBusinessProfile,
  subscribeToFeedbacks,
  getCachedFeedbacks,
  saveCachedFeedbacks,
  updateFeedbackItemStatus,
  replyToFeedbackItem,
  signOutUser,
  isFirebaseConfigured,
} from "../lib/firebase";
import {
  createEmbeddedCheckoutSession,
  triggerStripeSubscriptionCheckout,
  isProAccountEmail,
  checkAccountProStatus,
  getCanonicalUidForEmail,
} from "../lib/auth-service";
import type { Business, FeedbackItem, AuthUserProfile } from "../types";
import { WeeklyAnalyticsChart } from "./WeeklyAnalyticsChart";
import { StripeEmbeddedCheckoutModal } from "./StripeEmbeddedCheckout";
import { EmailVerificationScreen } from "./EmailVerificationScreen";

interface GatedDashboardProps {
  currentUser: AuthUserProfile | null;
  onOpenCustomerRateView: (businessId: string) => void;
  onUserAuthChange: (user: AuthUserProfile | null) => void;
  onSignOut?: () => void;
  onBackToLanding?: () => void;
  onOpenAuthModal?: () => void;
}

export function GatedDashboard({
  currentUser,
  onOpenCustomerRateView,
  onUserAuthChange,
  onSignOut,
  onBackToLanding,
  onOpenAuthModal,
}: GatedDashboardProps) {
  // Guard access: unverified users must verify email before accessing dashboard
  if (currentUser && !currentUser.emailVerified) {
    return (
      <EmailVerificationScreen
        currentUser={currentUser}
        onVerified={(verifiedUser) => onUserAuthChange(verifiedUser)}
        onSignOut={() => {
          if (onSignOut) {
            onSignOut();
          } else {
            onUserAuthChange(null);
          }
        }}
      />
    );
  }

  // Determine current effective business ID: real authenticated user uses their canonical user ID, demo uses demo-cafe
  const isDemoAccount = Boolean(currentUser?.isDemo || currentUser?.uid === "demo-cafe");
  const effectiveBusinessId =
    currentUser && !currentUser.isDemo
      ? getCanonicalUidForEmail(currentUser.email, currentUser.uid)
      : "demo-cafe";

  const [businessId, setBusinessId] = useState<string>(effectiveBusinessId);
  const [business, setBusiness] = useState<Business | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>(() => getCachedFeedbacks(effectiveBusinessId));
  const [loading, setLoading] = useState(true);

  // Form states
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Stripe checkout state
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [directCheckoutUrl, setDirectCheckoutUrl] = useState<string | null>(null);
  const [paywallBillingCycle, setPaywallBillingCycle] = useState<"month" | "year">("year");
  const [embeddedSession, setEmbeddedSession] = useState<{
    clientSecret: string;
    sessionId: string;
    publishableKey?: string;
    checkoutUrl?: string;
  } | null>(null);

  // Feedback filter
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [internalNoteInput, setInternalNoteInput] = useState("");

  // Business Reply State
  const [activeReplyFeedbackId, setActiveReplyFeedbackId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyNotice, setReplyNotice] = useState<{ id: string; message: string; isEmail: boolean } | null>(null);

  // Load business profile and subscribe to Firestore feedbacks
  useEffect(() => {
    let unsubscribeFeedbacks: (() => void) | null = null;
    let isMounted = true;

    // Immediately sync feedbacks with cache for this business
    setFeedbacks(getCachedFeedbacks(effectiveBusinessId));

    async function loadData() {
      try {
        setLoading(true);
        const accountIsPro = isProAccountEmail(currentUser?.email) || isDemoAccount;
        let biz = await fetchBusiness(effectiveBusinessId, currentUser?.email || undefined);

        if (!biz) {
          biz = {
            id: effectiveBusinessId,
            ownerUid: currentUser?.uid || `owner_${effectiveBusinessId}`,
            ownerEmail: currentUser?.email || undefined,
            businessName: currentUser?.displayName || "My Store",
            googleMapsReviewUrl: "",
            googleReviewUrl: "",
            subscriptionStatus: accountIsPro ? "active" : "inactive",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        } else if (accountIsPro && biz.subscriptionStatus !== "active") {
          biz = { ...biz, subscriptionStatus: "active" };
        }

        // If not active yet, check live Stripe subscription or backend pro status
        if (biz.subscriptionStatus !== "active" && currentUser) {
          try {
            const hasPro = await checkAccountProStatus(currentUser.uid, currentUser.email);
            if (hasPro) {
              biz = { ...biz, subscriptionStatus: "active" };
            }
          } catch {}
        }

        const targetBizId = biz.id || effectiveBusinessId;

        if (isMounted) {
          setBusiness(biz);
          setBusinessId(targetBizId);
          setGoogleMapsUrl(biz.googleMapsReviewUrl || "");
          setBusinessName(biz.businessName || "My Store");

          // The customer view data shouldn't count till they get the subscription
          const hasActiveSub = biz.subscriptionStatus === "active" || accountIsPro;
          if (!hasActiveSub && !isDemoAccount) {
            saveCachedFeedbacks(targetBizId, []);
            setFeedbacks([]);
          }
        }

        // Always subscribe to feedbacks for the effective business
        unsubscribeFeedbacks = subscribeToFeedbacks(targetBizId, (data) => {
          if (isMounted) {
            setFeedbacks(data);
          }
        });
      } catch (err) {
        console.error("Failed to load business data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
      if (unsubscribeFeedbacks) unsubscribeFeedbacks();
    };
  }, [effectiveBusinessId, currentUser]);

  // Check URL query parameters for Stripe success callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const isSubscribedParam = urlParams.get("subscribed") === "true";

    if (sessionId || isSubscribedParam) {
      // Confirm subscription
      verifyStripeSession(sessionId || "test_sess_return");
    }
  }, []);

  const verifyStripeSession = async (sessionId: string) => {
    try {
      const res = await fetch("/api/verify-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, businessId: effectiveBusinessId }),
      });
      const data = await res.json();
      if (data.verified || data.status === "active") {
        if (business) {
          const updated = { ...business, subscriptionStatus: "active" as const };
          setBusiness(updated);
          await saveBusinessProfile(updated);
        }
        setSaveSuccessMessage("🎉 Subscription activated successfully! Welcome to TapShield Pro.");
        setTimeout(() => setSaveSuccessMessage(null), 6000);
      }
    } catch (err) {
      console.warn("Error verifying session:", err);
    }
  };

  // Trigger Stripe Checkout flow
  const handleStartStripeCheckout = async (intervalToUse?: "month" | "year") => {
    const trimmedName = businessName.trim();
    if (!trimmedName) {
      setCheckoutError("Please enter your business name so it appears on your customer rating view page.");
      return;
    }

    setIsCheckingOut(true);
    setCheckoutError(null);
    setDirectCheckoutUrl(null);
    try {
      const interval = intervalToUse || paywallBillingCycle;

      // Save business name to Firestore and local state, keeping subscriptionStatus inactive until payment completes
      const updated: Business = {
        id: effectiveBusinessId,
        ownerUid: currentUser?.uid || `owner_${effectiveBusinessId}`,
        businessName: trimmedName,
        googleMapsReviewUrl: googleMapsUrl.trim(),
        subscriptionStatus: (business?.subscriptionStatus === "active" || isProAccountEmail(currentUser?.email)) ? "active" : "inactive",
        createdAt: business?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setBusiness(updated);
      await saveBusinessProfile(updated, currentUser?.email || undefined);

      const session = await createEmbeddedCheckoutSession({
        businessId: effectiveBusinessId,
        businessName: trimmedName,
        planInterval: interval,
        user: currentUser,
      });

      if (session?.url || session?.checkoutUrl) {
        setDirectCheckoutUrl(session.url || session.checkoutUrl);
      }

      if (session?.clientSecret || session?.url || session?.checkoutUrl) {
        setEmbeddedSession({
          clientSecret: session.clientSecret || "",
          sessionId: session.sessionId,
          publishableKey: session.publishableKey,
          checkoutUrl: session.url || session.checkoutUrl,
        });
      }
    } catch (err: any) {
      console.error("Stripe checkout trigger error:", err);
      const errorMsg = err?.message || "Failed to connect to checkout";
      setCheckoutError(errorMsg);
      setIsCheckingOut(false);
      setLoading(false);
      window.alert(errorMsg);
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Save Google Maps URL and Business Name to Firestore
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setIsSavingSettings(true);
    setSaveSuccessMessage(null);

    try {
      const updated: Business = {
        ...business,
        businessName: businessName.trim(),
        googleMapsReviewUrl: googleMapsUrl.trim(),
      };
      await saveBusinessProfile(updated, currentUser?.email || undefined);
      setBusiness(updated);
      setSaveSuccessMessage("Google Maps Review URL and business profile saved to Firestore!");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Error saving Firestore business settings:", err);
      alert("Failed to save settings to Firestore: " + err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Status update on feedback item
  const handleStatusUpdate = async (feedbackId: string, newStatus: FeedbackItem["status"]) => {
    try {
      await updateFeedbackItemStatus(effectiveBusinessId, feedbackId, newStatus);
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === feedbackId ? { ...f, status: newStatus } : f))
      );
    } catch (err) {
      console.error("Error updating feedback status:", err);
    }
  };

  const handleOpenReply = (fb: FeedbackItem) => {
    setActiveReplyFeedbackId(fb.id);
    if (!replyDrafts[fb.id]) {
      setReplyDrafts((prev) => ({
        ...prev,
        [fb.id]: "",
      }));
    }
  };

  const handleCloseReply = () => {
    setActiveReplyFeedbackId(null);
  };

  const handleSetTemplate = (feedbackId: string, text: string) => {
    setReplyDrafts((prev) => ({
      ...prev,
      [feedbackId]: text,
    }));
  };

  const handleSendReply = async (feedback: FeedbackItem) => {
    const text = replyDrafts[feedback.id]?.trim();
    if (!text) return;

    setIsSubmittingReply(true);
    try {
      const senderName = business?.businessName || currentUser?.displayName || "Management";
      const isEmail = feedback.customerContact?.includes("@") || false;
      const method = isEmail ? "email" : feedback.customerContact ? "sms" : "system";

      const res = await replyToFeedbackItem(
        effectiveBusinessId,
        feedback.id,
        text,
        senderName,
        method
      );

      // Update in local state
      setFeedbacks((prev) =>
        prev.map((f) => {
          if (f.id === feedback.id) {
            const replies = [...(f.replies || []), res.reply];
            return {
              ...f,
              replies,
              lastRepliedAt: res.reply.sentAt,
              status: f.status === "new" ? "reviewed" : f.status,
            };
          }
          return f;
        })
      );

      setReplyNotice({
        id: feedback.id,
        message: res.emailSent
          ? `Email reply successfully dispatched to ${feedback.customerContact}!`
          : `Reply logged in system and marked reviewed!`,
        isEmail: !!res.emailSent,
      });

      // Clear draft
      setReplyDrafts((prev) => ({ ...prev, [feedback.id]: "" }));
      setTimeout(() => {
        setReplyNotice(null);
        setActiveReplyFeedbackId(null);
      }, 2500);
    } catch (err: any) {
      console.error("Error sending reply:", err);
      alert("Failed to send reply: " + (err?.message || "Please try again"));
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Copy public NFC rating URL
  const liveBusinessId = business?.id || effectiveBusinessId;
  const publicRatingUrl = `${window.location.origin}/rate/${liveBusinessId}`;
  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicRatingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Account Settings Modal & Customer Billing Portal
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelingDirectly, setIsCancelingDirectly] = useState(false);

  const handleDirectCancelSubscription = async () => {
    setIsCancelingDirectly(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: effectiveBusinessId,
          email: currentUser?.email,
          userId: currentUser?.uid,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (business) {
          const updated = { ...business, subscriptionStatus: "canceled" as const };
          setBusiness(updated);
          await saveBusinessProfile(updated);
        }
        setShowCancelConfirm(false);
        setPortalUrl(null);
        setSaveSuccessMessage("Subscription has been canceled.");
        setTimeout(() => setSaveSuccessMessage(null), 6000);
      } else {
        setPortalError(data.error || "Unable to cancel subscription");
      }
    } catch (err: any) {
      setPortalError(err.message || "Failed to cancel subscription");
    } finally {
      setIsCancelingDirectly(false);
    }
  };

  const handleOpenCustomerPortalOrSettings = async () => {
    setIsOpeningPortal(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/create-customer-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: effectiveBusinessId,
          email: currentUser?.email,
          userId: currentUser?.uid,
          businessName: businessName || business?.businessName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.url) {
        setPortalUrl(data.url);
        // Stripe Billing Portal sends X-Frame-Options: SAMEORIGIN & frame-ancestors: none
        // It must always open in a separate tab/window, never in the embedded iframe.
        try {
          const newTab = window.open(data.url, "_blank", "noopener,noreferrer");
          if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
            // Popup blocker prevented immediate window opening; the modal renders a direct link
            console.log("Popup blocked by browser; direct portal link displayed");
          }
        } catch (popupErr) {
          console.warn("Could not open new window automatically:", popupErr);
        }
        setIsAccountSettingsOpen(true);
        return;
      }

      setIsAccountSettingsOpen(true);
      if (data.error) {
        setPortalError(data.error);
      }
    } catch (err: any) {
      console.warn("Could not open billing portal:", err);
      setIsAccountSettingsOpen(true);
      setPortalError(err.message || "Unable to reach Stripe billing server");
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const isSuspended =
    business?.subscriptionStatus === "past_due" ||
    business?.subscriptionStatus === "inactive" ||
    business?.subscriptionStatus === "canceled";

  const isSubscribed = Boolean(
    !isSuspended && (business?.subscriptionStatus === "active" || (isDemoAccount && !isSuspended))
  );

  // The customer view data shouldn't count till they get the subscription
  const effectiveFeedbacks = isSubscribed ? feedbacks : [];

  const positiveFeedbacks = effectiveFeedbacks.filter(
    (f) => f.sentiment === "positive" || f.rating === "like"
  );
  const negativeFeedbacks = effectiveFeedbacks.filter(
    (f) => f.sentiment === "negative" || f.rating === "dislike"
  );

  const totalPositiveTaps = isSubscribed ? positiveFeedbacks.length : 0;
  const totalNegativeTaps = isSubscribed ? negativeFeedbacks.length : 0;
  const totalTaps = isSubscribed ? totalPositiveTaps + totalNegativeTaps : 0;
  const satisfactionRate = isSubscribed && totalTaps > 0 ? Math.round((totalPositiveTaps / totalTaps) * 100) : 100;

  const filteredNegativeFeedbacks = negativeFeedbacks.filter((f) => {
    if (statusFilter === "all") return true;
    return f.status === statusFilter;
  });

  const newFeedbacksCount = isSubscribed ? effectiveFeedbacks.filter((f) => f.status === "new").length : 0;
  const newNegativeCount = isSubscribed ? negativeFeedbacks.filter((f) => f.status === "new").length : 0;

  return (
    <div id="gated-dashboard" className="min-h-screen bg-[#0A0A0A] text-white pb-16 font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-[#0F0F0F] border-b border-white/10 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-black shadow-lg shadow-emerald-500/20">
              <Shield className="w-5 h-5 text-black" fill="currentColor" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-white uppercase text-base">
                  TapShield
                </span>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block tracking-tight font-medium">
                Customer Feedback & Google Review Routing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Back to main website (only for guest / non-signed in users) */}
            {!currentUser && onBackToLanding && (
              <button
                id="btn-back-to-landing"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider text-stone-300 hover:text-white border border-white/10 hover:border-white/25 transition cursor-pointer"
              >
                <span>← Overview</span>
              </button>
            )}

            {/* Direct Live NFC Card View (Opens standalone unlinked page in new tab) */}
            <a
              id="btn-open-live-nfc-page"
              href={publicRatingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-500 text-black hover:bg-emerald-400 border border-emerald-400 transition cursor-pointer shadow-sm"
              title="Open standalone unlinked customer rating page in a new tab (URL for NFC cards and QR codes)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Live NFC Page</span>
              <ExternalLink className="w-3 h-3 text-black/80" />
            </a>

            {/* User Account / Sign In / Out */}
            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center text-xs font-black">
                  {currentUser.displayName?.[0] || currentUser.email?.[0] || "O"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-300">
                    {currentUser.displayName || currentUser.email}
                  </span>
                  {isSubscribed && (
                    <span
                      id="badge-dashboard-pro"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono font-black uppercase tracking-wider shadow-sm"
                      title="TapShield Pro Active Subscriber"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      PRO
                    </span>
                  )}
                </div>
                <button
                  id="btn-open-account-settings-header"
                  onClick={() => setIsAccountSettingsOpen(true)}
                  title="Account Settings & Billing"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#202020] hover:bg-[#282828] text-stone-200 border border-white/10 transition cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-stone-400" />
                  <span className="hidden sm:inline">Account Settings</span>
                  {!isSubscribed && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-500/20 text-rose-300 font-mono font-bold">
                      {business?.subscriptionStatus === "past_due" ? "Past Due" : "Locked"}
                    </span>
                  )}
                </button>
                <button
                  id="btn-sign-out"
                  onClick={async () => {
                    if (onSignOut) {
                      onSignOut();
                    } else {
                      await signOutUser();
                      onUserAuthChange(null);
                    }
                  }}
                  title="Sign Out"
                  className="p-1.5 text-stone-400 hover:text-white transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="btn-sign-in"
                onClick={() => {
                  onOpenAuthModal?.();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-white text-black hover:bg-stone-200 transition cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Owner Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-8">
        {/* Banner Alert if any */}
        {saveSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2.5 font-bold shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{saveSuccessMessage}</span>
          </motion.div>
        )}

        {/* ==================================================================== */}
        {/* FLOW 1: SUBSCRIPTION GATE (IF NOT SUBSCRIBED) */}
        {/* ==================================================================== */}
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-stone-400 text-sm font-medium">Loading your dashboard...</p>
          </div>
        ) : !isSubscribed ? (
          <div id="subscription-gate-container" className="py-8 max-w-3xl mx-auto">
            <div className="bg-[#161616] rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-12 text-center space-y-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto ring-8 ring-emerald-500/20 font-black text-2xl">
                R
              </div>

              <div className="space-y-3 max-w-lg mx-auto">
                {business?.subscriptionStatus === "past_due" ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-left space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-200">
                      <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                      <span>Payment Failed — Public Scans Suspended</span>
                    </div>
                    <p className="text-xs text-rose-300/90 leading-relaxed">
                      Your latest subscription renewal payment failed. Public NFC and QR code scans are currently disabled. Update your payment method in the Stripe Customer Portal or re-subscribe below to immediately restore public review routing.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {portalUrl ? (
                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-black font-black uppercase text-[11px] transition cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Launch Stripe Customer Portal ↗</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOpenCustomerPortalOrSettings}
                          disabled={isOpeningPortal}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-black font-black uppercase text-[11px] transition cursor-pointer disabled:opacity-50"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{isOpeningPortal ? "Connecting to Stripe..." : "Update Card in Stripe Portal"}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsAccountSettingsOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-stone-200 font-bold uppercase text-[11px] transition cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Account Details</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs">
                    Subscription Required
                  </p>
                )}
                <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter leading-none uppercase">
                  Owner Dashboard<br />Access
                </h2>
                <p className="text-stone-400 text-sm leading-relaxed font-medium">
                  Increase your good Google reviews to attract more potential customers, manage your private
                  customer feedback inbox, and track weekly rating trends.
                </p>
              </div>

              {/* Pricing Selector & Card */}
              <div className="max-w-md mx-auto space-y-4">
                {/* Billing Cycle Selector */}
                <div className="bg-[#0A0A0A] p-1 rounded-xl border border-white/10 flex items-center justify-center gap-1 font-mono text-xs">
                  <button
                    onClick={() => setPaywallBillingCycle("month")}
                    className={`flex-1 py-2 rounded-lg font-bold uppercase tracking-wider transition cursor-pointer ${
                      paywallBillingCycle === "month"
                        ? "bg-white text-black font-black"
                        : "text-stone-400 hover:text-white"
                    }`}
                  >
                    Monthly ($24.99)
                  </button>
                  <button
                    onClick={() => setPaywallBillingCycle("year")}
                    className={`flex-1 py-2 rounded-lg font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      paywallBillingCycle === "year"
                        ? "bg-emerald-500 text-black font-black"
                        : "text-stone-400 hover:text-white"
                    }`}
                  >
                    <span>Yearly ($199.99)</span>
                    <span className="text-[10px] bg-black text-emerald-400 px-1 py-0.2 rounded font-black">
                      -33%
                    </span>
                  </button>
                </div>

                <div className="bg-[#1C1C1C] rounded-xl border-l-4 border-emerald-500 border border-white/10 p-6 text-left space-y-4 shadow-xl">
                  <div className="border-b border-white/10 pb-4 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <h3 className="font-black uppercase tracking-tight text-white text-lg">
                          {paywallBillingCycle === "year" ? "Annual Plan" : "Monthly Plan"}
                        </h3>
                        <p className="text-xs text-stone-400 font-mono">For stores, cafes & restaurants</p>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl sm:text-4xl font-black text-white">
                          {paywallBillingCycle === "year" ? "$199.99" : "$24.99"}
                        </span>
                        <span className="text-xs uppercase font-bold text-stone-400 tracking-wider">
                          /{paywallBillingCycle === "year" ? "YR" : "MO"}
                        </span>
                      </div>
                    </div>

                    {paywallBillingCycle === "year" && (
                      <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono space-y-0.5">
                        <div className="flex justify-between text-stone-400">
                          <span>Standard 12-month rate:</span>
                          <span className="line-through">$299.88</span>
                        </div>
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Discounted Annual Price:</span>
                          <span>$199.99 (Save $99.89 / 33%)</span>
                        </div>
                        <div className="text-[10px] text-stone-400 text-right">
                          Just ~$16.66/month (2 months free)
                        </div>
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2.5 text-xs text-stone-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span><strong>Customer NFC & QR Rating Page</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span><strong>Direct Google Maps Review Routing</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span><strong>Private Feedback Collection</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span><strong>Weekly Review Analytics Bar Chart</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span><strong>Management Inbox</strong> for incoming feedback</span>
                    </li>
                  </ul>

                  {/* Business Name Prompt for Subscription Signup */}
                  <div className="space-y-1.5 pt-3 border-t border-white/10">
                    <label
                      htmlFor="paywall-business-name-input"
                      className="block text-xs font-black uppercase tracking-wider text-stone-200"
                    >
                      Your Business Name <span className="text-emerald-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                        <Store className="w-4 h-4" />
                      </div>
                      <input
                        id="paywall-business-name-input"
                        type="text"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="e.g. Downtown Artisan Cafe"
                        className="w-full pl-9 pr-3 py-2.5 bg-[#141414] border border-white/20 focus:border-emerald-500 rounded-lg text-xs font-semibold text-white placeholder:text-stone-500 outline-none transition"
                      />
                    </div>
                    <p className="text-[11px] text-stone-400 leading-tight">
                      This business name will appear at the top of your customer NFC tap & QR rating page.
                    </p>
                  </div>

                  {checkoutError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 text-rose-300 text-xs border border-rose-500/30">
                      {checkoutError}
                    </div>
                  )}

                  {directCheckoutUrl && (
                    <div className="p-3.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/30 space-y-2.5 text-center">
                      <p className="font-semibold text-white">Stripe Checkout Session Created</p>
                      <p className="text-[11px] text-stone-300">If your browser or iframe blocked the automated redirect, click below to proceed:</p>
                      <a
                        href={directCheckoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs rounded transition shadow-md w-full"
                      >
                        <span>Open Secure Stripe Checkout</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  <button
                    id="btn-stripe-checkout"
                    onClick={() => handleStartStripeCheckout(paywallBillingCycle)}
                    disabled={isCheckingOut}
                    className="w-full py-4 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 transition active:scale-98 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Opening Stripe Checkout...</span>
                      </>
                    ) : (
                      <>
                        <span>
                          {paywallBillingCycle === "year"
                            ? "Subscribe Yearly ($199.99/yr - Save 33%)"
                            : "Subscribe Monthly ($24.99/mo)"}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ==================================================================== */
          /* FLOW 1 & 2: ACTIVE GATED DASHBOARD */
          /* ==================================================================== */
          <div className="space-y-8">
            {/* Top Store Overview & Metrics */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10 pb-8 border-b border-white/10">
              <div>
                <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs mb-2">
                  Dashboard
                </p>
                <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter leading-none uppercase text-white">
                  Customer<br />Overview
                </h1>
                <p className="text-xs text-stone-400 mt-2 font-mono uppercase tracking-wider">
                  Store: {business?.businessName || "My Store"}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                <div className="text-left sm:text-right">
                  <div className="text-xs opacity-50 uppercase font-bold tracking-wider mb-1 text-stone-400">
                    Subscription Status
                  </div>
                  <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>ACTIVE SUBSCRIPTION</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    id="btn-view-nfc-screen"
                    href={publicRatingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-black uppercase tracking-wider bg-emerald-500 text-black hover:bg-emerald-400 transition cursor-pointer"
                    title="Open live unlinked NFC page in a new tab"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Open Live NFC Page</span>
                    <ExternalLink className="w-3.5 h-3.5 text-black/80" />
                  </a>
                </div>
              </div>
            </div>

            {/* Stats Row: Total Positive Taps, Total Negative Taps, Total Taps, Negative Messages */}
            <div id="stats-overview-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {/* Positive Taps Card */}
              <div id="card-positive-taps" className="bg-[#161616] p-6 border-l-4 border-emerald-500 border border-white/5 rounded-xl shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold opacity-75 tracking-wider text-stone-300">
                    Positive Taps
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                    <ThumbsUp className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
                <div className="text-5xl font-black mb-1 text-white tracking-tight">{totalPositiveTaps}</div>
                <p className="text-[11px] text-emerald-400 font-mono uppercase tracking-wider">
                  Loved It • Sent to Google
                </p>
              </div>

              {/* Negative Taps Card */}
              <div id="card-negative-taps" className="bg-[#161616] p-6 border-l-4 border-rose-500 border border-white/5 rounded-xl shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold opacity-75 tracking-wider text-stone-300">
                    Needs Attention
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                    <ThumbsDown className="w-4 h-4 text-rose-400" />
                  </div>
                </div>
                <div className="text-5xl font-black mb-1 text-white tracking-tight">{totalNegativeTaps}</div>
                <p className="text-[11px] text-rose-400 font-mono uppercase tracking-wider">
                  Could Be Better • Shielded Privately
                </p>
              </div>

              {/* Total Taps Card */}
              <div id="card-total-taps" className="bg-[#161616] p-6 border-l-4 border-white/40 border border-white/5 rounded-xl shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold opacity-75 tracking-wider text-stone-300">
                    Total Rating Taps
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-stone-300" />
                  </div>
                </div>
                <div className="text-5xl font-black mb-1 text-white tracking-tight">{totalTaps}</div>
                <p className="text-[11px] text-stone-400 font-mono uppercase tracking-wider">
                  {satisfactionRate}% Positive Tap Rate
                </p>
              </div>

              {/* Negative Text Messages Card */}
              <div id="card-negative-messages" className="bg-[#161616] p-6 border-l-4 border-amber-500 border border-white/5 rounded-xl shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold opacity-75 tracking-wider text-stone-300">
                    Negative Feed Messages
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                  </div>
                </div>
                <div className="text-5xl font-black mb-1 text-white tracking-tight">
                  {negativeFeedbacks.filter((f) => Boolean(f.message || f.customerNote)).length}
                </div>
                <p className="text-[11px] text-amber-400 font-mono uppercase tracking-wider">
                  {newNegativeCount} Pending Follow-up
                </p>
              </div>
            </div>

            {/* Weekly Review Analytics Bar Chart */}
            <WeeklyAnalyticsChart feedbacks={effectiveFeedbacks} isExample={Boolean(isDemoAccount && effectiveFeedbacks.length === 0)} />

            {/* Configuration Row: Google Maps URL + NFC Tag Deploy */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* GOOGLE MAPS REVIEW URL SETUP */}
              <div className="lg:col-span-7 bg-[#161616] rounded-xl border border-white/10 overflow-hidden shadow-lg space-y-0">
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#1C1C1C]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-emerald-500 text-black flex items-center justify-center font-black">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-black uppercase tracking-tight text-white text-lg">
                        Google Maps Review URL
                      </h2>
                      <p className="text-xs text-stone-400">
                        Target destination when a customer taps "Like"
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="input-business-name"
                      className="block text-[11px] font-black uppercase tracking-wider text-stone-300"
                    >
                      Store or Location Name
                    </label>
                    <input
                      id="input-business-name"
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Downtown Artisan Cafe"
                      className="w-full text-xs font-mono px-3.5 py-3 rounded border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="input-google-maps-url"
                      className="block text-[11px] font-black uppercase tracking-wider text-stone-300"
                    >
                      Direct Google Maps "Write a Review" URL
                    </label>
                    <input
                      id="input-google-maps-url"
                      type="url"
                      required
                      value={googleMapsUrl}
                      onChange={(e) => setGoogleMapsUrl(e.target.value)}
                      placeholder="https://search.google.com/local/writereview?placeid=..."
                      className="w-full text-xs font-mono px-3.5 py-3 rounded border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-[11px] text-stone-400">
                      💡 <strong>Tip:</strong> From your Google Business Profile, click "Ask for
                      reviews" to copy your short link (e.g. <code>https://g.page/r/...</code> or{" "}
                      <code>https://search.google.com/local/writereview?placeid=...</code>).
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      id="btn-save-maps-url"
                      type="submit"
                      disabled={isSavingSettings}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      {isSavingSettings ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          <span>Saving to Firestore...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save Settings to Firestore</span>
                        </>
                      )}
                    </button>

                    {googleMapsUrl && (
                      <a
                        id="btn-test-google-url"
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-3 rounded bg-[#0A0A0A] hover:bg-white/10 text-stone-200 border border-white/10 font-bold uppercase text-xs transition"
                      >
                        <span>Test Link</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </form>
              </div>

              {/* NFC TAG PROGRAMMING & QR CODES */}
              <div className="lg:col-span-5 bg-[#161616] rounded-xl border border-white/10 overflow-hidden shadow-lg flex flex-col justify-between">
                <div>
                  <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#1C1C1C]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-emerald-500 text-black flex items-center justify-center font-black">
                        <Radio className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="font-black uppercase tracking-tight text-white text-lg">In-Store NFC Link</h2>
                        <p className="text-xs text-stone-400">Program your NFC stands or counter cards</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="bg-[#0A0A0A] p-3.5 rounded border border-white/10 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-emerald-400 truncate select-all">
                        {publicRatingUrl}
                      </span>
                      <button
                        id="btn-copy-nfc-url"
                        onClick={handleCopyLink}
                        className="p-2 rounded bg-white text-black hover:bg-stone-200 transition flex-shrink-0 cursor-pointer"
                        title="Copy NFC URL"
                      >
                        {copiedLink ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-stone-400 leading-relaxed">
                      Write this URL to any standard NTAG213 / NTAG215 NFC stand, card, or sticker using
                      free apps like <em>NFC Tools</em>.
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-4 border-t border-white/10 flex items-center justify-between bg-[#161616]">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-300">
                    <QrCode className="w-4 h-4 text-emerald-400" />
                    <span>Backup QR Ready</span>
                  </div>
                  <a
                    href={publicRatingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 font-black uppercase tracking-wider hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Live Rating View ↗</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* ==================================================================== */}
            {/* NEGATIVE FEEDBACK MESSAGES FEED */}
            {/* ==================================================================== */}
            <div
              id="negative-feedback-feed"
              className="bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-lg space-y-0"
            >
              <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1C1C1C]">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-black uppercase tracking-tight text-white">
                      Negative Feedback Messages Feed
                    </h2>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      {negativeFeedbacks.length} Negative Messages
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 font-medium mt-1">
                    Customer feedback and private notes submitted when guests select "Could Be Better". Kept strictly private to your dashboard.
                  </p>
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-1 bg-[#0A0A0A] p-1 border border-white/10 rounded text-xs">
                  {(["all", "new", "reviewed", "resolved"] as const).map((filter) => {
                    const count =
                      filter === "all"
                        ? negativeFeedbacks.length
                        : negativeFeedbacks.filter((f) => f.status === filter).length;
                    return (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        className={`px-3 py-1.5 rounded uppercase font-black tracking-wider transition cursor-pointer text-[11px] flex items-center gap-1 ${
                          statusFilter === filter
                            ? "bg-emerald-500 text-black shadow-xs font-black"
                            : "text-stone-400 hover:text-white"
                        }`}
                      >
                        <span>{filter}</span>
                        <span className="opacity-75 font-mono text-[10px]">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table Header (Desktop) */}
              <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-white/10 bg-white/[0.02] items-center text-[10px] font-black opacity-60 uppercase tracking-widest text-stone-300">
                <div className="col-span-2">Date / Time</div>
                <div className="col-span-7">Negative Message & Customer Contact</div>
                <div className="col-span-3 text-right">Status & Action</div>
              </div>

              {/* Feedback List */}
              {loading ? (
                <div className="py-16 text-center text-xs text-stone-400">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                  Loading feedback collection...
                </div>
              ) : filteredNegativeFeedbacks.length === 0 ? (
                <div className="py-16 text-center text-stone-400 space-y-3">
                  <MessageSquare className="w-8 h-8 text-stone-600 mx-auto" />
                  <p className="text-sm font-bold uppercase tracking-wider text-stone-200">
                    {negativeFeedbacks.length === 0
                      ? "No negative feedback messages yet"
                      : `No ${statusFilter} negative messages`}
                  </p>
                  <p className="text-xs text-stone-400 max-w-sm mx-auto">
                    {negativeFeedbacks.length === 0
                      ? "When customers tap Thumbs Down and leave details, their text messages will appear here for private resolution."
                      : `No messages currently found with "${statusFilter}" status.`}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredNegativeFeedbacks.map((fb) => (
                    <div
                      key={fb.id}
                      className={`p-5 transition flex flex-col gap-3 hover:bg-white/[0.02] ${
                        fb.status === "new"
                          ? "border-l-4 border-rose-500 bg-rose-500/[0.03]"
                          : fb.status === "resolved"
                          ? "opacity-60"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col md:grid md:grid-cols-12 md:items-start gap-4">
                        {/* Timestamp */}
                        <div className="md:col-span-2 text-xs font-mono text-stone-400">
                          {new Date(fb.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>

                        {/* Customer Note & Contact */}
                        <div className="md:col-span-7 space-y-2">
                          <p className="text-sm text-stone-100 font-bold leading-relaxed">
                            "{fb.message || fb.customerNote || "Could Be Better rating (no comment provided)."}"
                          </p>

                          <div className="text-xs text-stone-400 flex flex-wrap items-center gap-2 font-mono pt-1">
                            {fb.customerName && (
                              <span className="text-emerald-400 font-bold">
                                Customer: {fb.customerName}
                              </span>
                            )}
                            {fb.customerContact ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="bg-[#0A0A0A] border border-white/15 px-2.5 py-1 rounded text-stone-200 font-bold flex items-center gap-1.5 shadow-sm">
                                  {fb.customerContact.includes("@") ? (
                                    <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  ) : (
                                    <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  )}
                                  <span>{fb.customerContact}</span>
                                </span>
                                {fb.replies && fb.replies.length > 0 ? (
                                  <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                    <CheckCheck className="w-3 h-3" />
                                    Replied ({fb.replies.length})
                                  </span>
                                ) : (
                                  <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                    Reply Needed
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-stone-300 text-[11px] italic">
                                No contact provided (anonymous)
                              </span>
                            )}
                          </div>

                          {/* Past System Replies Thread */}
                          {fb.replies && fb.replies.length > 0 && (
                            <div className="mt-2.5 space-y-2 pl-3 border-l-2 border-emerald-500/50 bg-[#0A0A0A]/70 p-3 rounded-r-lg">
                              <div className="text-[10px] uppercase font-black tracking-wider text-emerald-400 flex items-center gap-1.5">
                                <CornerDownRight className="w-3.5 h-3.5" />
                                <span>System Replies ({fb.replies.length})</span>
                              </div>
                              {fb.replies.map((reply) => (
                                <div key={reply.id} className="text-xs space-y-1">
                                  <div className="text-[11px] text-stone-400 flex items-center justify-between">
                                    <span className="text-stone-300 font-bold">
                                      {reply.sentBy || "Management"}
                                      {reply.method === "email" && " (sent via Email)"}
                                      {reply.method === "sms" && " (sent via SMS)"}
                                    </span>
                                    <span className="font-mono text-[10px] text-stone-300">
                                      {new Date(reply.sentAt).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-stone-200 text-xs bg-black/40 p-2.5 rounded border border-white/5 whitespace-pre-wrap leading-relaxed">
                                    "{reply.message}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Status & Actions */}
                        <div className="md:col-span-3 flex flex-wrap items-center justify-between md:justify-end gap-2 pt-2 md:pt-0">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded ${
                              fb.status === "new"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : fb.status === "reviewed"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-white text-black"
                            }`}
                          >
                            {fb.status}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {/* Reply Button */}
                            <button
                              onClick={() =>
                                activeReplyFeedbackId === fb.id
                                  ? handleCloseReply()
                                  : handleOpenReply(fb)
                              }
                              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded border transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
                                activeReplyFeedbackId === fb.id
                                  ? "bg-white text-black border-white"
                                  : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                              }`}
                              title="Reply to customer directly through the system"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>{activeReplyFeedbackId === fb.id ? "Close" : fb.replies?.length ? "Reply Again" : "Reply"}</span>
                            </button>

                            {fb.status !== "reviewed" && (
                              <button
                                onClick={() => handleStatusUpdate(fb.id, "reviewed")}
                                className="text-[10px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded border border-white/10 transition cursor-pointer"
                              >
                                Review
                              </button>
                            )}
                            {fb.status !== "resolved" && (
                              <button
                                onClick={() => handleStatusUpdate(fb.id, "resolved")}
                                className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1 rounded transition cursor-pointer font-bold"
                              >
                                Resolve
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Reply Form */}
                      {activeReplyFeedbackId === fb.id && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-3 bg-[#0d0d0d] p-4 rounded-xl border border-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-wider text-white">
                                Reply in System
                              </span>
                              {fb.customerContact && (
                                <span className="text-xs font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded font-bold">
                                  {fb.customerContact.includes("@") ? "To: " : "Phone: "}
                                  {fb.customerContact}
                                </span>
                              )}
                            </div>

                            {/* Quick fill templates */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] uppercase font-black tracking-wider text-stone-300 mr-1">
                                Quick Fill:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetTemplate(
                                    fb.id,
                                    `Dear Customer,\n\nWe sincerely apologize that your visit didn't meet our standards today. We take your feedback to heart and would love the opportunity to make this right on your next visit. Please reply directly to this message so we can coordinate!`
                                  )
                                }
                                className="text-[10px] bg-white/5 hover:bg-white/10 text-stone-300 px-2 py-1 rounded border border-white/10 transition cursor-pointer"
                              >
                                Apology & Invite Back
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetTemplate(
                                    fb.id,
                                    `Thank you for bringing this to our attention. We have addressed this directly with our team so it doesn't happen again. We truly appreciate your honest feedback.`
                                  )
                                }
                                className="text-[10px] bg-white/5 hover:bg-white/10 text-stone-300 px-2 py-1 rounded border border-white/10 transition cursor-pointer"
                              >
                                Staff Corrected
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetTemplate(
                                    fb.id,
                                    `Hi there,\n\nThank you for letting us know about this issue. Could you share a few more details (approximate time of visit, order details) so our manager can investigate and make this right for you?`
                                  )
                                }
                                className="text-[10px] bg-white/5 hover:bg-white/10 text-stone-300 px-2 py-1 rounded border border-white/10 transition cursor-pointer"
                              >
                                Ask for Details
                              </button>
                            </div>
                          </div>

                          <textarea
                            rows={3}
                            value={replyDrafts[fb.id] || ""}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [fb.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              fb.customerContact
                                ? fb.customerContact.includes("@")
                                  ? "Type your response to the customer (will be sent as an official email)..."
                                  : "Type your response to record in the system for this customer..."
                                : "Record your response or internal corrective action for this feedback..."
                            }
                            className="w-full text-xs font-sans p-3 rounded-lg border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition resize-none placeholder:text-stone-500"
                          />

                          {replyNotice?.id === fb.id && (
                            <div className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-lg flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>{replyNotice.message}</span>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="text-[11px] text-stone-400">
                              {fb.customerContact?.includes("@")
                                ? "✉️ Sends official email directly to customer & records in system"
                                : fb.customerContact
                                ? "📱 Records reply in system and marks status reviewed"
                                : "ℹ️ Anonymous feedback: reply logged in system audit"}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleCloseReply}
                                className="text-[11px] font-black uppercase tracking-wider bg-transparent hover:bg-white/5 text-stone-400 hover:text-white px-3 py-1.5 rounded border border-white/10 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isSubmittingReply || !(replyDrafts[fb.id]?.trim())}
                                onClick={() => handleSendReply(fb)}
                                className="text-[11px] font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 font-bold shadow-md"
                              >
                                {isSubmittingReply ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3.5 h-3.5" />
                                    <span>{fb.customerContact?.includes("@") ? "Send Email Reply" : "Submit Reply"}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Stripe Embedded Checkout Modal */}
      {embeddedSession && (
        <StripeEmbeddedCheckoutModal
          clientSecret={embeddedSession.clientSecret}
          sessionId={embeddedSession.sessionId}
          publishableKey={embeddedSession.publishableKey}
          checkoutUrl={embeddedSession.checkoutUrl}
          businessName={businessName || business?.businessName}
          onClose={() => setEmbeddedSession(null)}
          onComplete={async () => {
            setEmbeddedSession(null);
            if (business) {
              const updated = { ...business, subscriptionStatus: "active" as const };
              setBusiness(updated);
              await saveBusinessProfile(updated);
            }
            setSaveSuccessMessage("🎉 Subscription activated successfully! Welcome to TapShield Pro.");
            setTimeout(() => setSaveSuccessMessage(null), 6000);
          }}
        />
      )}

      {/* Account Settings & Billing Modal */}
      <AnimatePresence>
        {isAccountSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#181818] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-6"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <Settings className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-white">
                      Account Settings & Billing
                    </h3>
                    <p className="text-xs text-stone-400">Manage your subscription, card details, and business profile</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAccountSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Subscription Status Card */}
                <div className="p-4 rounded-xl bg-[#202020] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-stone-200">
                        Subscription Status
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider font-mono ${
                        business?.subscriptionStatus === "active"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : business?.subscriptionStatus === "past_due"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-stone-700/30 text-stone-400 border border-stone-600/30"
                      }`}
                    >
                      {business?.subscriptionStatus || "Inactive"}
                    </span>
                  </div>

                  {business?.subscriptionStatus === "past_due" ? (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>Payment Past Due</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-rose-300/90">
                        The recent card charge failed. Public NFC reviews and QR scans are temporarily paused until you update your billing card.
                      </p>
                    </div>
                  ) : business?.subscriptionStatus === "active" ? (
                    <p className="text-xs text-stone-400 leading-relaxed">
                      Your subscription is active. Unlimited NFC reviews, real-time Google Maps redirection, and private feedback collection are fully enabled.
                    </p>
                  ) : (
                    <p className="text-xs text-stone-400 leading-relaxed">
                      No active subscription detected. Public NFC ratings are currently locked.
                    </p>
                  )}

                  {portalError && (
                    <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>Billing Portal Notice</span>
                      </div>
                      <p className="leading-relaxed">{portalError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountSettingsOpen(false);
                          handleStartStripeCheckout("month");
                        }}
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[11px] transition cursor-pointer"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Start Stripe Subscription Checkout</span>
                      </button>
                    </div>
                  )}

                  {portalUrl && (
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2 text-center">
                      <div className="flex items-center justify-center gap-1.5 font-bold text-white">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>{isSubscribed ? "Cancel Subscription Link Ready" : "Stripe Billing Portal Ready"}</span>
                      </div>
                      <p className="text-[11px] text-stone-300 leading-tight">
                        {isSubscribed
                          ? "Stripe billing portals open in a separate browser tab to keep card details secure. Click below if not opened automatically:"
                          : "Stripe billing portals open in a separate browser tab to keep card details secure. Click below if not opened automatically:"}
                      </p>
                      <a
                        href={portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center justify-center gap-2 w-full py-3 px-4 text-white font-black uppercase text-xs rounded-lg transition shadow-lg cursor-pointer ${
                          isSubscribed ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-500 hover:bg-emerald-400 text-black"
                        }`}
                      >
                        <span>{isSubscribed ? "Cancel Subscription ↗" : "Launch Stripe Customer Portal ↗"}</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  <div className="pt-2 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        id="btn-open-stripe-customer-portal"
                        onClick={handleOpenCustomerPortalOrSettings}
                        disabled={isOpeningPortal}
                        className={`flex-1 py-3 px-4 rounded-lg font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-md active:scale-98 ${
                          isSubscribed
                            ? "bg-rose-600 hover:bg-rose-500 text-white"
                            : "bg-emerald-500 hover:bg-emerald-400 text-black"
                        }`}
                      >
                        {isOpeningPortal ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting to Stripe...</span>
                          </>
                        ) : isSubscribed ? (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Cancel Subscription</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>{portalUrl ? "Re-generate Portal Link" : "Open Stripe Customer Portal"}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                      {!isSubscribed && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsAccountSettingsOpen(false);
                            handleStartStripeCheckout("month");
                          }}
                          className="py-3 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition cursor-pointer"
                        >
                          Re-Subscribe
                        </button>
                      )}
                    </div>

                    {/* Instant In-App Cancellation Alternative */}
                    {isSubscribed && (
                      <div className="pt-1">
                        {!showCancelConfirm ? (
                          <div className="text-center">
                            <button
                              type="button"
                              onClick={() => setShowCancelConfirm(true)}
                              className="text-[11px] font-mono text-stone-400 hover:text-rose-400 underline underline-offset-2 transition cursor-pointer"
                            >
                              Or cancel immediately without opening Stripe
                            </button>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs space-y-2.5 text-center">
                            <p className="text-rose-200 font-bold">
                              Confirm immediate subscription cancellation?
                            </p>
                            <p className="text-[11px] text-stone-300 leading-tight">
                              Your live NFC review routing and real-time Google Maps redirection will be stopped immediately.
                            </p>
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleDirectCancelSubscription}
                                disabled={isCancelingDirectly}
                                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
                              >
                                {isCancelingDirectly ? "Canceling..." : "Yes, Cancel Now"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowCancelConfirm(false)}
                                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-stone-300 font-bold text-xs uppercase tracking-wider transition cursor-pointer"
                              >
                                Keep My Plan
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-500 font-mono text-center">
                    {isSubscribed
                      ? "Cancel your subscription anytime. Opens secure Stripe cancellation portal or cancels immediately."
                      : "Secure Stripe billing portal lets you update credit card, view payment history, and manage renewals. Opens in a secure new tab."}
                  </p>
                </div>

                {/* Business Profile Details */}
                <form onSubmit={handleSaveSettings} className="p-4 rounded-xl bg-[#202020] border border-white/10 space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-white/5">
                    <Store className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-stone-200">
                      Business Details
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-300">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Your Business Name"
                      className="w-full px-3 py-2 bg-[#141414] border border-white/10 focus:border-emerald-500 rounded-lg text-xs font-semibold text-white outline-none transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-300">
                      Google Maps Review URL
                    </label>
                    <input
                      type="url"
                      value={googleMapsUrl}
                      onChange={(e) => setGoogleMapsUrl(e.target.value)}
                      placeholder="https://g.page/r/.../review"
                      className="w-full px-3 py-2 bg-[#141414] border border-white/10 focus:border-emerald-500 rounded-lg text-xs font-semibold text-white outline-none transition"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingSettings}
                      className="px-4 py-2 rounded-lg bg-white text-black hover:bg-stone-200 font-black uppercase text-xs tracking-wider transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingSettings ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <div className="p-4 bg-[#141414] border-t border-white/10 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsAccountSettingsOpen(false)}
                  className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
