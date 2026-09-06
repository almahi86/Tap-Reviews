import { useState, useEffect, type FormEvent } from "react";
import { ThumbsUp, ThumbsDown, ExternalLink, Send, CheckCircle2, ArrowLeft, Store, ShieldCheck, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { fetchBusiness, submitCustomerFeedback } from "../lib/firebase";
import type { Business, RatingFlowState } from "../types";

interface NfcRatingPageProps {
  businessId: string;
  onNavigateToDashboard?: () => void;
  isEmbeddedPreview?: boolean;
}

export function NfcRatingPage({
  businessId,
  onNavigateToDashboard,
  isEmbeddedPreview = false,
}: NfcRatingPageProps) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [flowState, setFlowState] = useState<RatingFlowState>("initial");
  const [customerNote, setCustomerNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(2);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        const data = await fetchBusiness(businessId);
        if (isMounted) {
          setBusiness(data);
        }
      } catch (err) {
        console.error("Failed to load business profile for NFC tap:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [businessId]);

  // Handle Like Action -> Redirect to Google Maps review URL
  const handleLikeClick = () => {
    setFlowState("redirecting_like");
    const targetUrl =
      business?.googleMapsReviewUrl ||
      "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

    // Start a short, clear countdown for seamless UX and iframe safety
    let count = 2;
    const interval = setInterval(() => {
      count -= 1;
      setRedirectCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        // Attempt redirect
        try {
          // If in an iframe, try window.open or window.top
          if (window.top && window.top !== window.self) {
            window.open(targetUrl, "_blank", "noopener,noreferrer");
          } else {
            window.location.href = targetUrl;
          }
        } catch {
          window.open(targetUrl, "_blank", "noopener,noreferrer");
        }
      }
    }, 900);
  };

  // Handle Dislike Action -> Show apology and private feedback form
  const handleDislikeClick = () => {
    setFlowState("dislike_form");
    setErrorMessage(null);
  };

  // Handle Submit Dislike Form -> Save privately to Firestore
  const handleDislikeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerNote.trim()) {
      setErrorMessage("Please share a few words so we can address this with our staff.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await submitCustomerFeedback({
        businessId,
        rating: "dislike",
        customerNote: customerNote.trim(),
        customerContact: customerContact.trim() || undefined,
        customerName: customerName.trim() || undefined,
        status: "new",
      });
      setFlowState("dislike_submitted");
    } catch (err: any) {
      console.error("Error saving private feedback to Firestore:", err);
      setErrorMessage("Could not deliver your note. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="nfc-rating-container"
      className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-between items-center px-4 py-8 select-none antialiased font-sans selection:bg-emerald-500 selection:text-black"
    >
      {/* Top Bar / Brand Badge */}
      <header className="w-full max-w-md flex items-center justify-between text-xs text-stone-400 mb-6 px-1">
        <div className="flex items-center gap-2 font-mono uppercase tracking-widest text-[11px] text-emerald-400 font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{business?.businessName ? `${business.businessName} • NFC Tap` : "Verified In-Store NFC Tap"}</span>
        </div>
        {onNavigateToDashboard && (
          <button
            id="btn-return-dashboard"
            onClick={onNavigateToDashboard}
            className="text-stone-400 hover:text-white font-black uppercase tracking-wider text-[11px] transition cursor-pointer"
          >
            Owner Dashboard →
          </button>
        )}
      </header>

      {/* Main Mobile Screen Box */}
      <main className="w-full max-w-md bg-[#161616] rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 flex flex-col justify-center">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-10 h-10 border-2 border-white/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono uppercase tracking-wider text-stone-400">
              Connecting to store NFC tag...
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* VIEW 1: INITIAL TWO BUTTON PROMPT */}
            {flowState === "initial" && (
              <motion.div
                key="initial"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center space-y-6"
              >
                {/* Store Header */}
                <div className="space-y-1.5">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded bg-emerald-500 text-black font-black text-xl mb-2">
                    <Store className="w-6 h-6" />
                  </div>
                  <h1 className="text-2xl font-black uppercase tracking-tight text-white">
                    {business?.businessName || "Welcome to our store"}
                  </h1>
                  <p className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold">
                    Direct Feedback Touchpoint
                  </p>
                </div>

                {/* Primary Question */}
                <div className="pt-2 pb-1 border-t border-b border-white/5 py-4">
                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-tight">
                    How was your<br />experience today?
                  </h2>
                  <p className="text-xs text-stone-400 mt-2 font-medium">
                    Your tap takes only 2 seconds and helps our team improve.
                  </p>
                </div>

                {/* The Two Large Mobile Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* LIKE BUTTON */}
                  <button
                    id="btn-rating-like"
                    onClick={handleLikeClick}
                    className="group relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black transition shadow-lg cursor-pointer min-h-[130px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ThumbsUp className="w-6 h-6 text-black" />
                    </div>
                    <span className="text-2xl font-black uppercase tracking-tight">Like</span>
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                      It was great!
                    </span>
                  </button>

                  {/* DISLIKE BUTTON */}
                  <button
                    id="btn-rating-dislike"
                    onClick={handleDislikeClick}
                    className="group relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl bg-[#1C1C1C] hover:bg-[#242424] active:scale-95 text-white font-black border border-white/10 hover:border-white/20 transition cursor-pointer min-h-[130px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ThumbsDown className="w-6 h-6 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black uppercase tracking-tight">Dislike</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                      Could be better
                    </span>
                  </button>
                </div>

                <div className="text-[10px] uppercase font-mono tracking-widest text-stone-500 pt-2 flex items-center justify-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Direct private connection to store management</span>
                </div>
              </motion.div>
            )}

            {/* VIEW 2: LIKE REDIRECT SCREEN */}
            {flowState === "redirecting_like" && (
              <motion.div
                key="redirecting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-6 space-y-6"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto ring-8 ring-emerald-500/20 font-black text-2xl">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
                    Google Review Boost
                  </p>
                  <h3 className="text-3xl font-black uppercase tracking-tight text-white leading-tight">
                    We’re thrilled you enjoyed<br />{business?.businessName || "your visit"}!
                  </h3>
                  <p className="text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
                    Redirecting you to share your positive rating for {business?.businessName || "us"} on Google Maps in{" "}
                    <span className="font-black text-emerald-400 font-mono text-sm">{redirectCountdown}s</span>...
                  </p>
                </div>

                <div className="pt-2">
                  <a
                    id="link-manual-google-review"
                    href={
                      business?.googleMapsReviewUrl ||
                      "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-4 px-6 rounded bg-emerald-500 text-black font-black uppercase tracking-wider text-xs hover:bg-emerald-400 active:scale-98 transition shadow-lg"
                  >
                    <span>Open Google Review Now</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <button
                  onClick={() => setFlowState("initial")}
                  className="text-xs text-stone-400 hover:text-white uppercase font-bold tracking-wider underline pt-2 cursor-pointer"
                >
                  ← Back to rating options
                </button>
              </motion.div>
            )}

            {/* VIEW 3: DISLIKE APOLOGY & PRIVATE FORM */}
            {flowState === "dislike_form" && (
              <motion.div
                key="dislike_form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5 text-left"
              >
                <div className="space-y-1.5 border-b border-white/10 pb-4">
                  <button
                    onClick={() => setFlowState("initial")}
                    className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-stone-400 hover:text-white mb-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <p className="text-xs font-mono uppercase tracking-widest text-rose-400 font-bold">
                    Private Recovery Shield
                  </p>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight">
                    We’re so sorry.<br />What went wrong?
                  </h3>
                  <p className="text-xs text-stone-400">
                    Your feedback is saved privately to {business?.businessName ? `${business.businessName}'s` : "our"} management inbox so we can fix it immediately.
                  </p>
                </div>

                <form onSubmit={handleDislikeSubmit} className="space-y-4">
                  {errorMessage && (
                    <div className="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded">
                      {errorMessage}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="customer-note-textarea"
                      className="block text-[10px] font-black uppercase tracking-wider text-stone-300"
                    >
                      Your Experience <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      id="customer-note-textarea"
                      rows={4}
                      required
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="Please let us know what happened (e.g. food quality, wait time, noise, service)..."
                      className="w-full text-xs font-mono p-3.5 rounded border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label
                        htmlFor="customer-name-input"
                        className="block text-[10px] font-black uppercase tracking-wider text-stone-300"
                      >
                        Your Name (Optional)
                      </label>
                      <input
                        id="customer-name-input"
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g. Table 5 / Alex"
                        className="w-full text-xs font-mono p-3 rounded border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="customer-contact-input"
                        className="block text-[10px] font-black uppercase tracking-wider text-stone-300"
                      >
                        Email or Phone (Optional)
                      </label>
                      <input
                        id="customer-contact-input"
                        type="text"
                        value={customerContact}
                        onChange={(e) => setCustomerContact(e.target.value)}
                        placeholder="For manager remedy"
                        className="w-full text-xs font-mono p-3 rounded border border-white/20 bg-[#0A0A0A] text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <button
                    id="btn-submit-private-feedback"
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 px-4 rounded bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-md mt-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Sending to management...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Feedback Privately</span>
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* VIEW 4: DISLIKE SUBMITTED THANK YOU */}
            {flowState === "dislike_submitted" && (
              <motion.div
                key="submitted"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-5"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black uppercase tracking-tight text-white">
                    Thank you for<br />helping us improve
                  </h3>
                  <p className="text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
                    Your note was saved privately in {business?.businessName ? `${business.businessName}'s` : "the store owner's"} dashboard. It will never appear on public review sites.
                  </p>
                </div>
                <div className="pt-4">
                  <button
                    id="btn-reset-rating"
                    onClick={() => {
                      setFlowState("initial");
                      setCustomerNote("");
                      setCustomerContact("");
                      setCustomerName("");
                    }}
                    className="text-xs font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300 underline py-2 cursor-pointer"
                  >
                    Rate another experience
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Footer Branding */}
      <footer className="w-full max-w-sm text-center text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-6 space-y-1">
        <p>© {new Date().getFullYear()} TapShield • Customer Feedback Routing</p>
      </footer>
    </div>
  );
}
