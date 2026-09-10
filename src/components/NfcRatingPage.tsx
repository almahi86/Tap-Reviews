import { useState, useEffect, type FormEvent } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Send,
  CheckCircle2,
  AlertCircle,
  Store,
  Globe,
  LayoutDashboard,
  Lock,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { fetchBusiness, submitCustomerFeedback } from "../lib/firebase";
import type { Business } from "../types";

interface NfcRatingPageProps {
  businessId: string;
  isOwnerPreview?: boolean;
  isSignedOutExample?: boolean;
  isLiveMode?: boolean;
  onBackToDashboard?: () => void;
  onBackToLanding?: () => void;
  onOpenAuthModal?: () => void;
}

type RatingState = "initial" | "redirecting" | "negative_form" | "submitted" | "unavailable";

export function NfcRatingPage({
  businessId,
  isOwnerPreview,
  isSignedOutExample,
  isLiveMode,
  onBackToDashboard,
  onBackToLanding,
  onOpenAuthModal,
}: NfcRatingPageProps) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RatingState>("initial");
  const [message, setMessage] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTabClosedNotice, setIsTabClosedNotice] = useState(false);

  const handleDoneAndCloseTab = () => {
    // 1. Attempt standard script close
    try {
      window.close();
    } catch {
      // ignore
    }

    // 2. Attempt self-open close pattern
    try {
      window.open("", "_self");
      window.close();
    } catch {
      // ignore
    }

    // 3. Set notice in case browser blocks programmatic tab closing
    setIsTabClosedNotice(true);
  };

  useEffect(() => {
    let isMounted = true;
    async function loadBusiness() {
      // ONLY load demo cafe if businessId is explicitly "demo-cafe"
      if (businessId === "demo-cafe") {
        setBusiness({
          id: "demo-cafe",
          ownerUid: "demo-cafe",
          businessName: "Artisan Brews & Roastery",
          googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
          googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
          subscriptionStatus: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setState("initial");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const biz = await fetchBusiness(businessId);
        if (!isMounted) return;

        const isSubscribedActive =
          biz &&
          (biz.subscriptionStatus === "active" ||
            (biz as any).isPro === true ||
            (biz as any).subscriptionStatus === "trialing");

        if (biz && isSubscribedActive) {
          setBusiness(biz);
          setState("initial");
        } else if (biz) {
          setBusiness(biz);
          if (isOwnerPreview) {
            setState("initial");
          } else {
            setState("unavailable");
          }
        } else {
          // If not found in Firestore or API, check if owner preview
          if (isOwnerPreview) {
            setBusiness({
              id: businessId,
              ownerUid: businessId,
              businessName: "My Store",
              googleMapsReviewUrl: "https://search.google.com/local/writereview",
              googleReviewUrl: "https://search.google.com/local/writereview",
              subscriptionStatus: "inactive",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            setState("initial");
          } else {
            setState("unavailable");
          }
        }
      } catch (err) {
        console.error("Error loading business for rating:", err);
        if (isMounted) {
          if (isOwnerPreview) {
            setBusiness({
              id: businessId,
              ownerUid: businessId,
              businessName: "My Store",
              googleMapsReviewUrl: "https://search.google.com/local/writereview",
              googleReviewUrl: "https://search.google.com/local/writereview",
              subscriptionStatus: "inactive",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            setState("initial");
          } else {
            setState("unavailable");
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadBusiness();
    return () => {
      isMounted = false;
    };
  }, [businessId, isOwnerPreview, isSignedOutExample]);

  // Direct Google Review destination
  const reviewUrl =
    business?.googleReviewUrl ||
    business?.googleMapsReviewUrl ||
    "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

  // Check whether this business is allowed to count and persist customer feedback data
  const canCountData = business?.subscriptionStatus === "active" || businessId === "demo-cafe";

  // Routing Logic: Thumbs Up
  // Only record positive feedback to database if business has an active subscription
  // Then trigger redirect to the business's googleReviewUrl
  const handleThumbsUp = async () => {
    setState("redirecting");

    if (canCountData) {
      try {
        await submitCustomerFeedback({
          businessId,
          sentiment: "positive",
          rating: "like",
          status: "reviewed",
          message: "Customer rated: Loved It!",
          customerNote: "Customer rated: Loved It!",
        });
      } catch (err) {
        console.warn("Could not record positive tap:", err);
      }
    } else {
      console.log("[TapShield] Preview mode / unsubscribed: positive tap not counted.");
    }

    // Trigger redirect to the business's googleReviewUrl
    setTimeout(() => {
      try {
        window.location.href = reviewUrl;
      } catch {
        window.open(reviewUrl, "_blank", "noopener,noreferrer");
      }
    }, 600);
  };

  // Routing Logic: Thumbs Down
  // Do not redirect to Google. Instead, reveal a text area asking for details.
  const handleThumbsDown = () => {
    setState("negative_form");
    setErrorMessage(null);
  };

  // On submit: Only save to database if business has an active subscription.
  // Otherwise, simulate submission for preview testing without counting data.
  const handleSubmitNegative = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMessage("Please enter a few words about what went wrong.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    if (canCountData) {
      try {
        await submitCustomerFeedback({
          businessId,
          sentiment: "negative",
          message: message.trim(),
          customerNote: message.trim(),
          customerContact: customerContact.trim() || undefined,
          rating: "dislike",
          status: "new",
        });
        setState("submitted");
      } catch (err) {
        console.error("Failed to save negative feedback:", err);
        setErrorMessage("Failed to send feedback. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // In unsubscribed preview mode: show success screen without counting data
      console.log("[TapShield] Preview mode / unsubscribed: negative feedback not counted.");
      setIsSubmitting(false);
      setState("submitted");
    }
  };

  const handleReturnToLanding = () => {
    if (onBackToLanding) {
      onBackToLanding();
    } else {
      window.location.href = "/";
    }
  };

  const handleReturnToDashboard = () => {
    if (onBackToDashboard) {
      onBackToDashboard();
    } else {
      window.location.href = "/";
    }
  };

  // Fallback View: Business doesn't exist or subscription is inactive (for public live scans)
  if (!loading && !isOwnerPreview && !isSignedOutExample && (state === "unavailable" || !business || business.subscriptionStatus !== "active")) {
    return (
      <main
        id="rating-unavailable"
        className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 select-none font-sans"
      >
        <div className="w-full max-w-sm bg-[#161616] border border-white/10 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-full bg-stone-800/80 border border-white/10 flex items-center justify-center mx-auto text-stone-400">
            <AlertCircle className="w-7 h-7 text-stone-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-black uppercase tracking-tight text-white">
              Service currently unavailable.
            </h1>
            <p className="text-xs text-stone-400 leading-relaxed">
              This NFC review and rating service is currently unavailable. Please contact the business directly.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={handleReturnToLanding}
              className="w-full py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Return to Overview</span>
            </button>
            <button
              onClick={handleReturnToDashboard}
              className="w-full py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="standalone-rating-page"
      className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans antialiased selection:bg-emerald-500 selection:text-black"
    >
      {/* Floating Discreet Dashboard Link for Authenticated Store Owners */}
      {isOwnerPreview && onBackToDashboard && (
        <button
          type="button"
          onClick={onBackToDashboard}
          className="fixed top-3 right-3 z-50 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#161616]/90 hover:bg-[#222222] border border-white/15 text-stone-300 hover:text-white font-mono text-[11px] shadow-lg backdrop-blur-sm transition cursor-pointer"
        >
          <ArrowLeft className="w-3 h-3 text-emerald-400" />
          <span>Dashboard</span>
        </button>
      )}

      {/* Persistent Navigation Bar - ONLY shown in signed-out marketing demo cafe */}
      {!isLiveMode && isSignedOutExample && businessId === "demo-cafe" && (
        <div className="w-full max-w-md mb-4 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            id="btn-nav-return-overview"
            onClick={handleReturnToLanding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161616] hover:bg-[#222222] border border-white/15 hover:border-white/30 text-stone-200 hover:text-white font-mono text-xs uppercase tracking-wider transition cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
            <span>Back to Overview</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-nav-return-dashboard"
              onClick={handleReturnToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161616] hover:bg-[#222222] border border-white/15 hover:border-white/30 text-stone-200 hover:text-white font-mono text-xs uppercase tracking-wider transition cursor-pointer shadow-sm"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dashboard Demo</span>
            </button>

            {onOpenAuthModal && (
              <button
                type="button"
                id="btn-nav-return-auth"
                onClick={onOpenAuthModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black font-mono text-xs uppercase tracking-wider transition cursor-pointer shadow-sm"
              >
                <Lock className="w-3 h-3" />
                <span>Log In</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-[#141414] rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-8">
        {/* Signed-out Example Mode Banner - ONLY for demo cafe */}
        {!isLiveMode && isSignedOutExample && businessId === "demo-cafe" && (
          <div className="mb-6 p-3.5 rounded-xl bg-[#1A1A1A] border border-white/15 text-xs shadow-lg space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  Example Preview
                </span>
                <span className="font-mono text-xs font-bold text-white">
                  Customer NFC Tap View
                </span>
              </div>
              <span className="text-[10px] font-mono text-stone-400">
                Signed Out (Demo)
              </span>
            </div>

            <p className="text-[11px] text-stone-400 leading-tight">
              Demonstration of customer NFC tap screen. Click below to return to any other option:
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
              {onBackToLanding && (
                <button
                  id="btn-preview-back-overview"
                  onClick={onBackToLanding}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                >
                  <Globe className="w-3 h-3 text-emerald-400" />
                  <span>Overview</span>
                </button>
              )}
              {onBackToDashboard && (
                <button
                  id="btn-preview-back-dashboard"
                  onClick={onBackToDashboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                >
                  <LayoutDashboard className="w-3 h-3 text-emerald-400" />
                  <span>Dashboard Demo</span>
                </button>
              )}
              {onOpenAuthModal && (
                <button
                  id="btn-preview-login-register"
                  onClick={onOpenAuthModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition cursor-pointer ml-auto"
                >
                  <Lock className="w-3 h-3" />
                  <span>Log In / Register</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Store Owner Signed-In Preview Banner - only shown when not in live mode */}
        {!isLiveMode && isOwnerPreview && (
          <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span className="font-mono text-[11px] font-bold">
                Customer View Preview (Store Owner)
              </span>
            </div>
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 cursor-pointer underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back to Dashboard</span>
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono uppercase tracking-wider text-stone-400">
              Loading feedback form...
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* SCREEN 1: TWO BUTTONS (THUMBS UP & THUMBS DOWN) */}
            {state === "initial" && (
              <motion.div
                key="initial"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-center space-y-6"
              >
                {/* Business Name Display */}
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 text-black shadow-lg mx-auto">
                    <Store className="w-6 h-6" />
                  </div>
                  <h1
                    id="business-name-header"
                    className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white"
                  >
                    {business?.businessName || "Our Store"}
                  </h1>
                  <p className="text-xs text-stone-400 font-medium">
                    How was your experience today?
                  </p>
                </div>

                {/* Two Action Buttons: Loved It and Could Be Better */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* POSITIVE / LOVED IT */}
                  <button
                    id="btn-thumbs-up"
                    type="button"
                    onClick={handleThumbsUp}
                    className="group flex flex-col items-center justify-center gap-2.5 p-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black transition shadow-lg cursor-pointer min-h-[148px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ThumbsUp className="w-7 h-7 text-black fill-current" />
                    </div>
                    <div className="text-center space-y-0.5">
                      <span className="text-xl font-black uppercase tracking-tight block">
                        Loved It!
                      </span>
                      <span className="text-[11px] font-bold text-black/75 block tracking-normal">
                        Great experience
                      </span>
                    </div>
                  </button>

                  {/* NEGATIVE / COULD BE BETTER */}
                  <button
                    id="btn-thumbs-down"
                    type="button"
                    onClick={handleThumbsDown}
                    className="group flex flex-col items-center justify-center gap-2.5 p-6 rounded-xl bg-[#1F1F1F] hover:bg-[#282828] active:scale-95 text-white font-black border border-white/10 hover:border-white/20 transition cursor-pointer min-h-[148px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ThumbsDown className="w-7 h-7 text-rose-400 fill-current" />
                    </div>
                    <div className="text-center space-y-0.5">
                      <span className="text-xl font-black uppercase tracking-tight text-stone-100 block">
                        Could Be Better
                      </span>
                      <span className="text-[11px] font-bold text-stone-400 block tracking-normal">
                        Tell us how we could do better
                      </span>
                    </div>
                  </button>
                </div>

                {/* Footer: Authentic Minimal Watermark in Live Mode vs Return Nav in Demo Cafe */}
                {!isLiveMode && isSignedOutExample && businessId === "demo-cafe" ? (
                  <div className="pt-4 flex flex-wrap items-center justify-center gap-2 border-t border-white/10">
                    <button
                      type="button"
                      id="btn-initial-bottom-overview"
                      onClick={handleReturnToLanding}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white font-mono text-xs uppercase tracking-wider transition cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Back to Overview</span>
                    </button>
                    <button
                      type="button"
                      id="btn-initial-bottom-dashboard"
                      onClick={handleReturnToDashboard}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white font-mono text-xs uppercase tracking-wider transition cursor-pointer"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Back to Dashboard Demo</span>
                    </button>
                  </div>
                ) : (
                  <div className="pt-4 text-center">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-stone-500 uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Protected by TapShield NFC</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* SCREEN 2: REDIRECTING TO GOOGLE REVIEW */}
            {state === "redirecting" && (
              <motion.div
                key="redirecting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-6 space-y-5"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto ring-8 ring-emerald-500/20">
                  <ThumbsUp className="w-8 h-8 fill-current" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                    Thank you!
                  </h2>
                  <p className="text-xs text-stone-300 leading-relaxed max-w-xs mx-auto">
                    Redirecting you to share your positive review for{" "}
                    <strong>{business?.businessName || "us"}</strong> on Google...
                  </p>
                </div>

                <div className="pt-2">
                  <a
                    id="link-google-review-fallback"
                    href={
                      business?.googleReviewUrl ||
                      business?.googleMapsReviewUrl ||
                      "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider text-xs transition shadow-md"
                  >
                    <span>Click here if not redirected</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {/* Return to Other Options */}
                {!isLiveMode && isSignedOutExample && businessId === "demo-cafe" ? (
                  <div className="pt-3 flex flex-wrap items-center justify-center gap-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={handleReturnToLanding}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Globe className="w-3 h-3 text-emerald-400" />
                      <span>Back to Overview</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleReturnToDashboard}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <LayoutDashboard className="w-3 h-3 text-emerald-400" />
                      <span>Back to Dashboard Demo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setState("initial")}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-stone-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Try Again</span>
                    </button>
                  </div>
                ) : (
                  <div className="pt-3 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setState("initial")}
                      className="text-[11px] font-mono text-stone-400 hover:text-white transition cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Cancel / Go back</span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* SCREEN 3: PRIVATE FEEDBACK - TEXT AREA ASKING FOR DETAILS */}
            {state === "negative_form" && (
              <motion.div
                key="negative_form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-5 text-left"
              >
                <div className="space-y-1.5 border-b border-white/10 pb-3">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                    How can we improve?
                  </h2>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Please share your experience with {business?.businessName || "our team"} so we can make things right.
                  </p>
                </div>

                <form onSubmit={handleSubmitNegative} className="space-y-4">
                  {errorMessage && (
                    <div className="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-lg">
                      {errorMessage}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="negative-feedback-textarea"
                      className="block text-[11px] font-black uppercase tracking-wider text-stone-300"
                    >
                      Your Feedback <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      id="negative-feedback-textarea"
                      rows={4}
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Please share what happened..."
                      className="w-full text-xs font-sans p-3.5 rounded-lg border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition resize-none placeholder:text-stone-500"
                    />
                  </div>

                  {/* Optional Email or Phone Number */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="negative-feedback-contact"
                        className="block text-[11px] font-black uppercase tracking-wider text-stone-300"
                      >
                        Email or Phone Number <span className="text-stone-500 font-normal lowercase">(optional)</span>
                      </label>
                    </div>
                    <input
                      id="negative-feedback-contact"
                      type="text"
                      value={customerContact}
                      onChange={(e) => setCustomerContact(e.target.value)}
                      placeholder="e.g. name@email.com or (555) 234-5678"
                      className="w-full text-xs font-sans px-3.5 py-2.5 rounded-lg border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition placeholder:text-stone-500"
                    />
                    <p className="text-[10px] text-stone-400 leading-tight">
                      Leave your email or phone if you'd like our team to reply and make things right.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setState("initial")}
                      className="py-3 px-3.5 rounded-lg bg-transparent hover:bg-white/5 text-stone-400 hover:text-white font-black text-xs uppercase tracking-wider transition cursor-pointer border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-submit-feedback"
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-3.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-md"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Submit Feedback</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Discreet low-contrast link to public Google Review */}
                  <div className="pt-2 text-center">
                    <a
                      href={reviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-stone-600 hover:text-stone-400 transition inline-flex items-center gap-1 font-mono tracking-tight"
                      title="Direct public review"
                    >
                      <span>Prefer to review on Google directly?</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                    </a>
                  </div>
                </form>
              </motion.div>
            )}

            {/* SCREEN 4: THANK YOU SCREEN */}
            {state === "submitted" && (
              <motion.div
                key="submitted"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                    Thank you
                  </h2>
                  <p className="text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
                    {customerContact.trim() ? (
                      <>
                        Thank you for sharing your feedback with {business?.businessName || "us"}. Your comments have been sent directly to management, and we will follow up with you at <span className="text-emerald-400 font-bold break-all">{customerContact.trim()}</span>.
                      </>
                    ) : (
                      <>
                        Thank you for sharing your feedback with {business?.businessName || "us"}. Your comments have been sent directly to management.
                      </>
                    )}
                  </p>
                </div>

                {/* Return to Other Options */}
                {!isLiveMode && isSignedOutExample && businessId === "demo-cafe" ? (
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-2 border-t border-white/10">
                    <button
                      type="button"
                      id="btn-submitted-back-overview"
                      onClick={handleReturnToLanding}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Back to Overview</span>
                    </button>
                    <button
                      type="button"
                      id="btn-submitted-back-dashboard"
                      onClick={handleReturnToDashboard}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Back to Dashboard Demo</span>
                    </button>
                    <button
                      type="button"
                      id="btn-submitted-test-again"
                      onClick={() => {
                        setState("initial");
                        setMessage("");
                        setCustomerContact("");
                      }}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Test Again</span>
                    </button>
                  </div>
                ) : (
                  <div className="pt-4 flex flex-col items-center justify-center gap-3 border-t border-white/10">
                    <button
                      type="button"
                      id="btn-submitted-done"
                      onClick={handleDoneAndCloseTab}
                      className="px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-wider transition cursor-pointer active:scale-95"
                    >
                      Done
                    </button>
                    {isTabClosedNotice && (
                      <p className="text-[11px] text-stone-400 font-mono text-center">
                        You can now safely close this tab.
                      </p>
                    )}
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-stone-500 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Protected by TapShield NFC</span>
                    </div>
                  </div>
                )}

                <div className="pt-1 text-center">
                  <a
                    href={reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-stone-600 hover:text-stone-400 transition inline-flex items-center gap-1 font-mono tracking-tight"
                  >
                    <span>Public Google review page</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </main>
  );
}
