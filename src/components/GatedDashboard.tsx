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
} from "lucide-react";
import { motion } from "motion/react";
import {
  fetchBusiness,
  saveBusinessProfile,
  subscribeToFeedbacks,
  updateFeedbackItemStatus,
  signOutUser,
  signInWithGoogle,
  isFirebaseConfigured,
} from "../lib/firebase";
import {
  createEmbeddedCheckoutSession,
  triggerStripeSubscriptionCheckout,
} from "../lib/auth-service";
import type { Business, FeedbackItem, AuthUserProfile } from "../types";
import { WeeklyAnalyticsChart } from "./WeeklyAnalyticsChart";
import { StripeEmbeddedCheckoutModal } from "./StripeEmbeddedCheckout";
import { EmailVerificationScreen } from "./EmailVerificationScreen";

interface GatedDashboardProps {
  currentUser: AuthUserProfile | null;
  onOpenCustomerRateView: (businessId: string) => void;
  onUserAuthChange: (user: AuthUserProfile | null) => void;
  onBackToLanding?: () => void;
  onOpenAuthModal?: () => void;
}

export function GatedDashboard({
  currentUser,
  onOpenCustomerRateView,
  onUserAuthChange,
  onBackToLanding,
  onOpenAuthModal,
}: GatedDashboardProps) {
  // Guard access: unverified users must verify email before accessing dashboard
  if (currentUser && !currentUser.emailVerified) {
    return (
      <EmailVerificationScreen
        currentUser={currentUser}
        onVerified={(verifiedUser) => onUserAuthChange(verifiedUser)}
        onSignOut={() => onUserAuthChange(null)}
      />
    );
  }

  const [businessId, setBusinessId] = useState<string>("demo-cafe");
  const [business, setBusiness] = useState<Business | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
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
  } | null>(null);

  // Feedback filter
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [internalNoteInput, setInternalNoteInput] = useState("");

  // Determine current effective business ID: real authenticated user uses their user ID, demo uses demo-cafe
  const effectiveBusinessId =
    currentUser && !currentUser.isDemo ? currentUser.uid : "demo-cafe";

  // Load business profile and subscribe to Firestore feedbacks
  useEffect(() => {
    let unsubscribeFeedbacks: (() => void) | null = null;
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        let biz = await fetchBusiness(effectiveBusinessId, currentUser?.email || undefined);

        // If not active yet, check live Stripe subscription for this user
        if (biz.subscriptionStatus !== "active" && currentUser) {
          try {
            const checkRes = await fetch(
              `/api/subscription-status?email=${encodeURIComponent(currentUser.email || "")}&userId=${encodeURIComponent(currentUser.uid)}&businessId=${encodeURIComponent(effectiveBusinessId)}`
            );
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.isPro || checkData.status === "active") {
                biz = { ...biz, subscriptionStatus: "active" };
              }
            }
          } catch {}
        }

        if (isMounted) {
          setBusiness(biz);
          setGoogleMapsUrl(biz.googleMapsReviewUrl || "");
          setBusinessName(biz.businessName || "My Store");
        }

        // Only subscribe to feedbacks if active subscriber or demo owner
        if (biz.subscriptionStatus === "active" || effectiveBusinessId === "demo-cafe") {
          unsubscribeFeedbacks = subscribeToFeedbacks(effectiveBusinessId, (data) => {
            if (isMounted) {
              setFeedbacks(data);
            }
          });
        }
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
        subscriptionStatus: business?.subscriptionStatus === "active" ? "active" : "inactive",
        createdAt: business?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setBusiness(updated);
      await saveBusinessProfile(updated);

      const session = await createEmbeddedCheckoutSession({
        businessId: effectiveBusinessId,
        businessName: trimmedName,
        planInterval: interval,
        user: currentUser,
      });

      if (session?.clientSecret) {
        setEmbeddedSession({
          clientSecret: session.clientSecret,
          sessionId: session.sessionId,
          publishableKey: session.publishableKey,
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

  // Instant sandbox bypass toggle for reviewers
  const handleToggleSandboxSubscription = async () => {
    if (!business) return;
    const newStatus = business.subscriptionStatus === "active" ? "inactive" : "active";
    const updated: Business = {
      ...business,
      subscriptionStatus: newStatus,
    };
    setBusiness(updated);
    await saveBusinessProfile(updated);
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
      await saveBusinessProfile(updated);
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

  // Copy public NFC rating URL
  const publicRatingUrl = `${window.location.origin}?rate=${effectiveBusinessId}`;
  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicRatingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const isSubscribed = business?.subscriptionStatus === "active";
  const filteredFeedbacks = feedbacks.filter((f) => {
    if (statusFilter === "all") return true;
    return f.status === statusFilter;
  });

  const newFeedbacksCount = feedbacks.filter((f) => f.status === "new").length;

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
            {/* Back to main website */}
            {onBackToLanding && (
              <button
                id="btn-back-to-landing"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider text-stone-300 hover:text-white border border-white/10 hover:border-white/25 transition cursor-pointer"
              >
                <span>← Overview</span>
              </button>
            )}

            {/* Direct NFC Preview Button */}
            <button
              id="btn-open-rate-preview"
              onClick={() => onOpenCustomerRateView(effectiveBusinessId)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-500 text-black hover:bg-emerald-400 border border-emerald-400 transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Test Customer View</span>
            </button>

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
                  id="btn-sign-out"
                  onClick={async () => {
                    await signOutUser();
                    onUserAuthChange(null);
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
                  if (onOpenAuthModal) {
                    onOpenAuthModal();
                  } else {
                    signInWithGoogle()
                      .then((profile) => onUserAuthChange(profile))
                      .catch((err) => console.warn("Login failed:", err));
                  }
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
        {!isSubscribed ? (
          <div id="subscription-gate-container" className="py-8 max-w-3xl mx-auto">
            <div className="bg-[#161616] rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-12 text-center space-y-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto ring-8 ring-emerald-500/20 font-black text-2xl">
                R
              </div>

              <div className="space-y-3 max-w-lg mx-auto">
                <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs">
                  Subscription Required
                </p>
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
                  <button
                    onClick={handleToggleSandboxSubscription}
                    className="text-xs text-stone-400 hover:text-white px-3 py-2 rounded border border-white/10 bg-[#161616] hover:bg-[#202020] uppercase font-bold tracking-wider cursor-pointer"
                    title="Toggle subscription to test gating"
                  >
                    Simulate Lock
                  </button>
                  <button
                    id="btn-view-nfc-screen"
                    onClick={() => onOpenCustomerRateView(effectiveBusinessId)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-black uppercase tracking-wider bg-emerald-500 text-black hover:bg-emerald-400 transition cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Test Customer View</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <div className="bg-[#161616] p-6 border-l-4 border-emerald-500 border border-white/5">
                <div className="text-5xl font-black mb-1 text-white tracking-tight">{feedbacks.length}</div>
                <div className="text-xs uppercase font-bold opacity-50 tracking-wider text-stone-300">
                  Private Feedback Received
                </div>
                <p className="text-[10px] text-emerald-400 mt-2 font-mono uppercase tracking-wider">
                  Logged in private inbox
                </p>
              </div>

              <div className="bg-[#161616] p-6 border-l-4 border-white border border-white/5">
                <div className="text-5xl font-black mb-1 text-white tracking-tight">{newFeedbacksCount}</div>
                <div className="text-xs uppercase font-bold opacity-50 tracking-wider text-stone-300">
                  Pending Action Items
                </div>
                <p className="text-[10px] text-stone-400 mt-2 font-mono uppercase tracking-wider">
                  Awaiting manager follow-up
                </p>
              </div>

              <div className="bg-[#161616] p-6 border-l-4 border-emerald-500 border border-white/5">
                <div className="text-5xl font-black mb-1 text-white tracking-tight">Direct</div>
                <div className="text-xs uppercase font-bold opacity-50 tracking-wider text-stone-300">
                  Direct Google Reviews
                </div>
                <p className="text-[10px] text-emerald-400 mt-2 font-mono uppercase tracking-wider">
                  Routed to Google Maps
                </p>
              </div>

              <div className="bg-[#161616] p-6 border-l-4 border-white border border-white/5">
                <div className="text-3xl font-black mb-1 text-white tracking-tight uppercase">
                  Cloud Sync
                </div>
                <div className="text-xs uppercase font-bold opacity-50 tracking-wider text-stone-300">
                  Database Storage
                </div>
                <p className="text-[10px] text-stone-400 mt-2 font-mono uppercase tracking-wider">
                  Real-Time Encrypted Storage
                </p>
              </div>
            </div>

            {/* Weekly Review Analytics Bar Chart */}
            <WeeklyAnalyticsChart feedbacks={feedbacks} />

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
                  <button
                    onClick={() => onOpenCustomerRateView(effectiveBusinessId)}
                    className="text-xs text-emerald-400 font-black uppercase tracking-wider hover:underline cursor-pointer"
                  >
                    Open Live Rating View →
                  </button>
                </div>
              </div>
            </div>

            {/* ==================================================================== */}
            {/* PRIVATE FEEDBACK INBOX */}
            {/* ==================================================================== */}
            <div
              id="private-feedback-inbox"
              className="bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-lg space-y-0"
            >
              <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1C1C1C]">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-black uppercase tracking-tight text-white">
                      Customer Feedback Inbox
                    </h2>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      {feedbacks.length} Messages
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 font-medium mt-1">
                    Customer feedback submitted from the in-store rating page. Review notes and follow up directly.
                  </p>
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-1 bg-[#0A0A0A] p-1 border border-white/10 rounded text-xs">
                  {(["all", "new", "reviewed", "resolved"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-3 py-1.5 rounded uppercase font-black tracking-wider transition cursor-pointer text-[11px] ${
                        statusFilter === filter
                          ? "bg-emerald-500 text-black shadow-xs font-black"
                          : "text-stone-400 hover:text-white"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Header (Desktop) */}
              <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-white/10 bg-white/[0.02] items-center text-[10px] font-black opacity-60 uppercase tracking-widest text-stone-300">
                <div className="col-span-2">Date / Time</div>
                <div className="col-span-7">Customer Note & Contact</div>
                <div className="col-span-3 text-right">Status & Action</div>
              </div>

              {/* Feedback List */}
              {loading ? (
                <div className="py-16 text-center text-xs text-stone-400">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                  Loading feedback collection...
                </div>
              ) : filteredFeedbacks.length === 0 ? (
                <div className="py-16 text-center text-stone-400 space-y-3">
                  <MessageSquare className="w-8 h-8 text-stone-600 mx-auto" />
                  <p className="text-sm font-bold uppercase tracking-wider text-stone-200">
                    No customer feedback yet
                  </p>
                  <p className="text-xs text-stone-400 max-w-sm mx-auto">
                    When customers submit feedback through your in-store NFC or QR link, their messages will
                    appear here for review.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredFeedbacks.map((fb) => (
                    <div
                      key={fb.id}
                      className={`p-5 transition flex flex-col md:grid md:grid-cols-12 md:items-center gap-4 hover:bg-white/[0.02] ${
                        fb.status === "new"
                          ? "border-l-4 border-rose-500 bg-rose-500/[0.03]"
                          : fb.status === "resolved"
                          ? "opacity-60"
                          : ""
                      }`}
                    >
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
                      <div className="md:col-span-7 space-y-1.5">
                        <p className="text-sm text-stone-100 font-bold leading-relaxed">
                          "{fb.customerNote}"
                        </p>

                        {(fb.customerName || fb.customerContact) && (
                          <div className="text-xs text-stone-400 flex flex-wrap items-center gap-2 font-mono pt-1">
                            {fb.customerName && (
                              <span className="text-emerald-400 font-bold">
                                Customer: {fb.customerName}
                              </span>
                            )}
                            {fb.customerContact && (
                              <span className="bg-[#0A0A0A] border border-white/10 px-2 py-0.5 rounded text-stone-300">
                                📞 {fb.customerContact}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status & Actions */}
                      <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-2 pt-2 md:pt-0">
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
                              className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1 rounded transition cursor-pointer"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
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
    </div>
  );
}
