import { useState, useEffect, type FormEvent } from "react";
import { ThumbsUp, ThumbsDown, ExternalLink, Send, CheckCircle2, AlertCircle, Store } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { fetchBusiness, submitCustomerFeedback } from "../lib/firebase";
import type { Business } from "../types";

interface NfcRatingPageProps {
  businessId: string;
  isOwnerPreview?: boolean;
  onBackToDashboard?: () => void;
}

type RatingState = "initial" | "redirecting" | "negative_form" | "submitted" | "unavailable";

export function NfcRatingPage({ businessId, isOwnerPreview, onBackToDashboard }: NfcRatingPageProps) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RatingState>("initial");
  const [message, setMessage] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadBusiness() {
      try {
        setLoading(true);
        const biz = await fetchBusiness(businessId);
        if (!isMounted) return;

        // If the business doesn't exist or their subscription is inactive, show fallback message unless in preview
        if (!biz || biz.subscriptionStatus !== "active") {
          setBusiness(
            biz || {
              id: businessId,
              ownerUid: businessId,
              businessName: "My Store",
              googleMapsReviewUrl: "https://search.google.com/local/writereview",
              googleReviewUrl: "https://search.google.com/local/writereview",
              subscriptionStatus: "inactive",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          );
          if (isOwnerPreview) {
            setState("initial");
          } else {
            setState("unavailable");
          }
        } else {
          setBusiness(biz);
          setState("initial");
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
  }, [businessId, isOwnerPreview]);

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

  // Fallback View: Business doesn't exist or subscription is inactive (for public live scans)
  if (!loading && !isOwnerPreview && (state === "unavailable" || !business || business.subscriptionStatus !== "active")) {
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
        </div>
      </main>
    );
  }

  return (
    <main
      id="standalone-rating-page"
      className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans antialiased selection:bg-emerald-500 selection:text-black"
    >
      <div className="w-full max-w-md bg-[#141414] rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-8">
        {isOwnerPreview && (
          <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span className="font-mono text-[11px] font-bold">
                {canCountData
                  ? "Customer View Preview (Active Subscription)"
                  : "Public NFC Scans Disabled (Service currently unavailable) — Subscription inactive or payment failed"}
              </span>
            </div>
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 cursor-pointer underline"
              >
                Back to Dashboard
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

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setState("initial")}
                      className="py-3 px-4 rounded-lg bg-transparent hover:bg-white/5 text-stone-400 hover:text-white font-black text-xs uppercase tracking-wider transition cursor-pointer border border-white/10"
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

                <div className="pt-2 text-center">
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
