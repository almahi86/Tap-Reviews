import React, { useState } from "react";
import { X, Building2, Check, ArrowRight, ShieldCheck, Sparkles, Store, AlertCircle } from "lucide-react";
import type { AuthUserProfile } from "../types";
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from "../lib/auth-service";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUserProfile | null;
  initialPlan?: "month" | "year";
  initialBusinessName?: string;
  onConfirmSubscription: (params: {
    businessName: string;
    interval: "month" | "year";
  }) => Promise<void>;
  onAuthSuccess: (user: AuthUserProfile, previewCode?: string, businessName?: string) => void;
}

export function SubscriptionModal({
  isOpen,
  onClose,
  currentUser,
  initialPlan = "year",
  initialBusinessName = "",
  onConfirmSubscription,
  onAuthSuccess,
}: SubscriptionModalProps) {
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [interval, setInterval] = useState<"month" | "year">(initialPlan);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In case user is not signed in and chooses to sign up inline
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);

  if (!isOpen) return null;

  const handleProceed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const trimmedName = businessName.trim();
    if (!trimmedName) {
      setError("Please enter your business name so it can be shown to customers.");
      return;
    }

    setIsSubmitting(true);

    try {
      // If user is not yet signed in, create account or sign in first
      if (!currentUser) {
        if (!email || !password) {
          throw new Error("Please enter your email and password to create an account for your subscription.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        if (authMode === "signup") {
          const { user, previewCode } = await signUpWithEmail(
            email,
            password,
            ownerName || trimmedName,
            staySignedIn
          );
          onAuthSuccess(user, previewCode, trimmedName);
        } else {
          const user = await signInWithEmail(email, password, staySignedIn);
          onAuthSuccess(user, undefined, trimmedName);
        }
      }

      await onConfirmSubscription({
        businessName: trimmedName,
        interval,
      });
      onClose();
    } catch (err: any) {
      console.error("Subscription setup error:", err);
      setIsSubmitting(false);
      const errorMsg = err?.message || "Failed to connect to checkout";
      setError(errorMsg);
      window.alert(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    const trimmedName = businessName.trim();
    if (!trimmedName) {
      setError("Please enter your business name first.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const user = await signInWithGoogle(staySignedIn, currentUser?.email || "ossovi32@gmail.com");
      onAuthSuccess(user, undefined, trimmedName);
      await onConfirmSubscription({
        businessName: trimmedName,
        interval,
      });
      onClose();
    } catch (err: any) {
      console.error("Google auth during subscription error:", err);
      setIsSubmitting(false);
      const errorMsg = err?.message || "Failed to connect to checkout";
      setError(errorMsg);
      window.alert(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#121212] border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-5 text-white my-auto max-h-[92vh] flex flex-col overflow-hidden">
        {/* Close Button */}
        <button
          id="btn-close-subscription-modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto pr-0.5 space-y-5">

        {/* Modal Header */}
        <div className="space-y-1.5 pr-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-xs uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5" />
            <span>Business Subscription Setup</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            Set Up Your TapShield
          </h2>
          <p className="text-xs text-stone-400 leading-relaxed font-normal">
            Enter your business name below. It will be showcased on your customer NFC tap & QR code rating page.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Business Name Input Section */}
        <div className="space-y-2">
          <label
            htmlFor="input-subscription-business-name"
            className="block text-xs font-black uppercase tracking-wider text-stone-200"
          >
            Business Name <span className="text-emerald-400">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
              <Store className="w-4 h-4" />
            </div>
            <input
              id="input-subscription-business-name"
              type="text"
              required
              autoFocus
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g., Summit Coffee Roasters, Joe's Bistro..."
              className="w-full pl-10 pr-4 py-3 bg-[#181818] border border-white/20 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl text-sm font-semibold text-white placeholder:text-stone-500 outline-none transition"
            />
          </div>
          <p className="text-[11px] text-stone-400 leading-normal font-mono">
            This name will be immediately displayed at the top of your customer rating view when guests tap your NFC tags.
          </p>

          {/* Live Customer Page Preview Badge */}
          <div className="p-3 bg-[#161616] border border-emerald-500/20 rounded-xl space-y-1 mt-2">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-stone-400">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <Sparkles className="w-3 h-3" />
                Customer View Preview:
              </span>
              <span>In-Store Mobile Screen</span>
            </div>
            <div className="text-sm font-black uppercase tracking-tight text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{businessName.trim() ? businessName.trim() : "Your Business Name Here"}</span>
            </div>
            <p className="text-[10px] text-stone-400">
              "How was your experience today at {businessName.trim() ? businessName.trim() : "our store"}?"
            </p>
          </div>
        </div>

        {/* Plan Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-wider text-stone-200">
            Select Subscription Plan
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Yearly Plan */}
            <div
              onClick={() => setInterval("year")}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition relative flex flex-col justify-between ${
                interval === "year"
                  ? "bg-[#181818] border-emerald-500 shadow-md shadow-emerald-500/10"
                  : "bg-[#141414] border-white/10 hover:border-white/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Annual Plan
                </span>
                <span className="text-[10px] bg-emerald-500 text-black px-1.5 py-0.5 rounded font-black uppercase">
                  Save $99.89
                </span>
              </div>
              <div className="mt-2">
                <div className="text-xl font-black text-white">$199.99 <span className="text-xs font-mono text-stone-400 font-normal">/ year</span></div>
                <div className="text-[11px] text-emerald-400 font-mono">~$16.66/month (Best Value)</div>
              </div>
            </div>

            {/* Monthly Plan */}
            <div
              onClick={() => setInterval("month")}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                interval === "month"
                  ? "bg-[#181818] border-emerald-500 shadow-md shadow-emerald-500/10"
                  : "bg-[#141414] border-white/10 hover:border-white/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Monthly Plan
                </span>
                <span className="text-[10px] text-stone-400 font-mono uppercase">
                  Flexible
                </span>
              </div>
              <div className="mt-2">
                <div className="text-xl font-black text-white">$24.99 <span className="text-xs font-mono text-stone-400 font-normal">/ month</span></div>
                <div className="text-[11px] text-stone-400 font-mono">Billed monthly, cancel anytime</div>
              </div>
            </div>
          </div>
        </div>

        {/* Account Status / Inline Registration if not logged in */}
        {currentUser ? (
          <div className="p-3 rounded-xl bg-[#161616] border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-7 h-7 rounded-full bg-emerald-500 text-black font-black flex items-center justify-center text-xs">
                {(currentUser.displayName || currentUser.email || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-white">{currentUser.displayName || "Store Owner"}</div>
                <div className="text-stone-400 font-mono text-[11px]">{currentUser.email}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 uppercase bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              Account Ready
            </span>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#161616] border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-stone-200">
                Owner Account Setup
              </span>
              <div className="flex gap-2 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`underline cursor-pointer ${authMode === "signup" ? "text-emerald-400 font-bold" : "text-stone-400"}`}
                >
                  Create Account
                </button>
                <span className="text-stone-600">•</span>
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className={`underline cursor-pointer ${authMode === "signin" ? "text-emerald-400 font-bold" : "text-stone-400"}`}
                >
                  Sign In
                </button>
              </div>
            </div>

            {/* Quick Google Sign In */}
            <button
              id="btn-subscription-google-auth"
              type="button"
              onClick={handleGoogleAuth}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl border border-white/20 bg-[#1e1e1e] hover:bg-[#252525] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.1 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 14.8s.7 5.1 1.9 7.5l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.1-6.4-5.2L1.9 16.5c1.8 3.7 5.6 7 10.1 7z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3 text-stone-500 text-[10px] font-mono uppercase">
              <div className="h-px bg-white/10 flex-1" />
              <span>Or email & password</span>
              <div className="h-px bg-white/10 flex-1" />
            </div>

            <div className="space-y-2.5">
              {authMode === "signup" && (
                <div>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Owner Full Name"
                    className="w-full px-3 py-2 bg-[#121212] border border-white/20 rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500"
                  />
                </div>
              )}
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email Address"
                  className="w-full px-3 py-2 bg-[#121212] border border-white/20 rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 6 characters)"
                  className="w-full px-3 py-2 bg-[#121212] border border-white/20 rounded-lg text-xs font-mono text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="space-y-3 pt-2">
          <button
            id="btn-confirm-subscription"
            type="button"
            disabled={isSubmitting || !businessName.trim()}
            onClick={() => handleProceed()}
            className="w-full py-4 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-98 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Preparing Checkout...</span>
              </>
            ) : (
              <>
                <span>
                  Confirm & Proceed to Checkout (
                  {interval === "year" ? "$199.99/year" : "$24.99/month"}
                  )
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-[10px] text-stone-500 font-mono uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secure 256-bit encrypted checkout via Stripe</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
