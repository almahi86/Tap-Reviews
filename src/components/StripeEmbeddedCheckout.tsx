import { useState, useEffect, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { getStripePublishableKey } from "../lib/auth-service";
import { X, ShieldCheck, AlertTriangle, Key, ExternalLink } from "lucide-react";

interface StripeEmbeddedCheckoutProps {
  clientSecret: string;
  sessionId?: string;
  publishableKey?: string;
  businessName?: string;
  onClose: () => void;
  onComplete?: () => void;
}

export function StripeEmbeddedCheckoutModal({
  clientSecret,
  sessionId,
  publishableKey: initialPublishableKey,
  businessName,
  onClose,
  onComplete,
}: StripeEmbeddedCheckoutProps) {
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [effectiveKey, setEffectiveKey] = useState<string>(initialPublishableKey || "");
  const [keyInput, setKeyInput] = useState<string>("");
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(!initialPublishableKey);
  const [initError, setInitError] = useState<string | null>(null);

  // Load publishable key
  useEffect(() => {
    let isMounted = true;

    async function initKey() {
      try {
        const key = initialPublishableKey || (await getStripePublishableKey());
        if (isMounted) {
          if (key && key !== "pk_test_YOUR_KEY_HERE") {
            setEffectiveKey(key);
            setStripePromise(loadStripe(key));
          } else {
            setInitError(
              "Stripe Publishable Key not configured. Please enter your Stripe Publishable Key (pk_test_... or pk_live_...) below to render the embedded checkout form."
            );
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setInitError(err?.message || "Failed to load Stripe Publishable Key");
        }
      } finally {
        if (isMounted) setIsLoadingKey(false);
      }
    }

    initKey();

    return () => {
      isMounted = false;
    };
  }, [initialPublishableKey]);

  const handleApplyKey = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith("pk_test_") && !trimmed.startsWith("pk_live_")) {
      window.alert("Please provide a valid Stripe Publishable Key starting with pk_test_ or pk_live_");
      return;
    }

    try {
      localStorage.setItem("stripe_publishable_key", trimmed);
      setEffectiveKey(trimmed);
      setInitError(null);
      setStripePromise(loadStripe(trimmed));
    } catch (err: any) {
      window.alert("Failed to initialize Stripe with provided key: " + err?.message);
    }
  };

  // If clientSecret is a demo placeholder (backend had no secret key configured)
  const isDemoSession = clientSecret.includes("_secret_demo") || clientSecret.startsWith("test_sess_");

  const handleSimulateDemoPayment = () => {
    if (onComplete) {
      onComplete();
    } else {
      window.location.href = `/return?session_id=${sessionId || "test_sess_done"}&subscribed=true`;
    }
  };

  return (
    <div
      id="stripe-embedded-checkout-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#181818] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Stripe Embedded Checkout
              </h2>
              {businessName && (
                <p className="text-xs text-stone-400 font-mono">
                  Upgrading: <span className="text-emerald-400">{businessName}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-stone-400 bg-white/5 px-2 py-1 rounded border border-white/10">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>In-App Payment</span>
            </span>

            <button
              id="btn-close-embedded-checkout"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close Checkout"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Embedded Checkout View */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {isLoadingKey ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-stone-300">Initializing Stripe Checkout...</p>
            </div>
          ) : isDemoSession ? (
            /* Demo / Sandbox fallback if Stripe secret was omitted on server */
            <div className="p-6 text-center space-y-4 bg-[#1a1a1a] rounded-xl border border-amber-500/30">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Sandbox Preview Mode</h3>
                <p className="text-xs text-stone-400 max-w-md mx-auto">
                  Stripe live credentials were not detected in the environment. You can test the full
                  embedded subscription lifecycle using the simulated checkout button below.
                </p>
              </div>

              <div className="p-3 bg-black/40 rounded-lg text-left text-xs font-mono text-stone-400 space-y-1">
                <div>Session ID: {sessionId}</div>
                <div>Status: Simulated Open</div>
                <div>Plan: TapShield Pro</div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  id="btn-simulate-payment-success"
                  onClick={handleSimulateDemoPayment}
                  className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition cursor-pointer"
                >
                  Complete Simulated Subscription
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-mono transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : initError || !stripePromise ? (
            /* Key Missing or Custom Key Entry */
            <div className="p-6 bg-[#1a1a1a] rounded-xl border border-white/10 space-y-5">
              <div className="flex items-start gap-3 text-amber-400">
                <Key className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h3 className="font-bold text-white text-sm">Stripe Publishable Key Needed</h3>
                  <p className="text-stone-300">
                    Stripe Embedded Checkout requires your frontend Publishable Key (
                    <code className="text-emerald-400 font-mono">pk_test_...</code> or{" "}
                    <code className="text-emerald-400 font-mono">pk_live_...</code>) to securely mount the
                    form inside this modal.
                  </p>
                </div>
              </div>

              <form onSubmit={handleApplyKey} className="space-y-3 pt-2">
                <label className="block text-xs font-mono uppercase text-stone-300">
                  Enter Stripe Publishable Key:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="pk_test_51..."
                    className="flex-1 px-3 py-2 bg-black border border-white/20 focus:border-emerald-500 rounded-lg text-xs font-mono text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase rounded-lg transition cursor-pointer flex-shrink-0"
                  >
                    Mount Form
                  </button>
                </div>
                <p className="text-[11px] text-stone-500">
                  Find this key in your{" "}
                  <a
                    href="https://dashboard.stripe.com/test/apikeys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline inline-flex items-center gap-0.5"
                  >
                    Stripe Dashboard <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  . It is saved in your browser storage for this session.
                </p>
              </form>
            </div>
          ) : (
            /* Live Stripe Embedded Checkout Component */
            <div id="stripe-checkout" className="rounded-xl overflow-hidden min-h-[440px] bg-white text-black p-2">
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ clientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#161616] flex items-center justify-between text-[11px] text-stone-400 font-mono flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-bit encrypted checkout via Stripe</span>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition cursor-pointer uppercase font-bold text-[10px]"
          >
            Cancel & Return
          </button>
        </div>
      </div>
    </div>
  );
}
