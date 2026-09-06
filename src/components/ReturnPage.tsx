import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, ArrowRight, Store, ShieldCheck } from "lucide-react";

interface ReturnPageProps {
  onGoToDashboard: () => void;
  onGoToRating?: (businessId: string) => void;
}

export function ReturnPage({ onGoToDashboard, onGoToRating }: ReturnPageProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string>("");

  useEffect(() => {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const sessionId = urlParams.get("session_id");
    const bizId = urlParams.get("business_id") || "demo-cafe";
    setBusinessId(bizId);

    if (!sessionId) {
      setLoading(false);
      setStatus("complete");
      return;
    }

    // Call /api/session-status
    fetch(`/api/session-status?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => res.json())
      .then((data) => {
        setStatus(data.status || "complete");
        setCustomerEmail(data.customer_email || "");

        // Also call verify-checkout-session to activate the business
        fetch("/api/verify-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, businessId: bizId }),
        }).catch((err) => console.warn("Could not verify session with business:", err));
      })
      .catch((err) => {
        console.error("Failed to fetch session status:", err);
        setStatus("complete");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-stone-300">Confirming your subscription payment...</p>
      </div>
    );
  }

  const isSuccess = status === "complete" || status === "paid" || status === "open";

  return (
    <div id="stripe-return-view" className="max-w-xl mx-auto py-16 px-4 sm:px-6">
      <div className="bg-[#161616] border border-white/10 rounded-2xl shadow-2xl p-8 sm:p-10 text-center space-y-6">
        {isSuccess ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto ring-8 ring-emerald-500/20 font-black">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">
                Subscription Activated!
              </h1>
              <p className="text-stone-300 text-sm">
                Thank you for subscribing to TapShield Pro.
                {customerEmail ? (
                  <> A receipt has been emailed to <span className="text-emerald-400 font-mono">{customerEmail}</span>.</>
                ) : (
                  " Your account now has full access to the management dashboard, negative feedback inbox, and NFC rating routing."
                )}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-left text-xs font-mono text-stone-400">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-emerald-400 font-bold uppercase">Active Pro</span>
              </div>
              <div className="flex justify-between">
                <span>Protection:</span>
                <span className="text-white">Active 24/7</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                id="btn-return-dashboard"
                onClick={onGoToDashboard}
                className="flex-1 py-3.5 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <span>Open Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {onGoToRating && businessId && (
                <button
                  id="btn-return-customer-view"
                  onClick={() => onGoToRating(businessId)}
                  className="py-3.5 px-5 rounded-lg border border-white/20 hover:border-white/40 text-stone-300 hover:text-white text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>View Customer Tap Page</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white">Payment Unfinished</h1>
              <p className="text-stone-400 text-xs">
                Your checkout session was not completed. You can restart the checkout process at any time from your dashboard.
              </p>
            </div>
            <button
              onClick={onGoToDashboard}
              className="py-3 px-6 rounded-lg bg-white text-black font-black uppercase text-xs hover:bg-stone-200 transition cursor-pointer"
            >
              Return to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
