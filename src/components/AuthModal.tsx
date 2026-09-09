import React, { useState } from "react";
import { X, Mail, Lock, AlertCircle, ArrowRight, Clock, Store } from "lucide-react";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  formatAuthError,
} from "../lib/auth-service";
import type { AuthUserProfile } from "../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUserProfile, businessName?: string) => void;
  defaultMode?: "signin" | "signup";
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultMode = "signin",
}: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "signup") {
        if (!email || !password) {
          throw new Error("Email and password are required.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        if (!confirmPassword) {
          throw new Error("Please confirm your password.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match. Please ensure both passwords are identical.");
        }

        const { user } = await signUpWithEmail(
          email,
          password,
          displayName || businessName,
          staySignedIn
        );
        onAuthSuccess(user, businessName.trim() || undefined);
        onClose();
      } else {
        if (!email || !password) {
          throw new Error("Email and password are required.");
        }

        const user = await signInWithEmail(email, password, staySignedIn);
        onAuthSuccess(user);
        onClose();
      }
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const user = await signInWithGoogle(
        staySignedIn,
        email.trim() || undefined,
        displayName.trim() || undefined
      );
      onAuthSuccess(user, businessName.trim() || undefined);
      onClose();
    } catch (err: any) {
      console.error("Google Auth error:", err);
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#141414] border border-white/15 rounded-2xl shadow-2xl my-auto max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        {/* Fixed Header with Guaranteed-Visible Cross Button */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 flex-shrink-0 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-tight leading-tight">
                {mode === "signin" ? "Sign In to TapShield" : "Create Your Account"}
              </h2>
              <p className="text-[10px] text-stone-400 font-mono">
                {mode === "signin"
                  ? "Access your store dashboard"
                  : "Store owner registration"}
              </p>
            </div>
          </div>

          {/* Prominent High-Contrast Close Button */}
          <button
            id="btn-close-auth-modal"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-stone-200 hover:text-white flex items-center justify-center transition cursor-pointer flex-shrink-0 shadow"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Container with Compact Spacing so it fits cleanly */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 [scrollbar-width:thin]">
          {/* Mode Selector Tabs */}
          <div className="flex bg-[#0A0A0A] p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setConfirmPassword("");
              }}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition cursor-pointer ${
                mode === "signin" ? "bg-white text-black font-black" : "text-stone-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setConfirmPassword("");
              }}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition cursor-pointer ${
                mode === "signup" ? "bg-emerald-500 text-black font-black" : "text-stone-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Stay Signed In Option */}
          <div className="bg-[#0A0A0A] px-3 py-1.5 rounded-xl border border-white/10 flex items-center justify-between gap-2">
            <label htmlFor="checkbox-stay-signed-in" className="flex items-center gap-2 select-none cursor-pointer flex-1">
              <input
                id="checkbox-stay-signed-in"
                type="checkbox"
                checked={staySignedIn}
                onChange={(e) => setStaySignedIn(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-[#161616] text-emerald-500 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Stay signed in for 1 week</span>
              </div>
            </label>
            <span className="text-[10px] text-stone-400 font-mono">7 days</span>
          </div>

          {/* Google Sign In Button */}
          <button
            id="btn-google-auth"
            type="button"
            onClick={handleGoogleAuth}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-stone-100 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition active:scale-98 shadow-md cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-mono uppercase text-stone-400">or with email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Business Name (Shows on Customer Page)</span>
                </label>
                <input
                  id="input-auth-business-name"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Downtown Artisan Cafe"
                  className="w-full px-3 py-2 rounded-xl bg-[#0A0A0A] border border-white/15 text-white text-xs placeholder:text-stone-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-stone-400" />
                <span>Email Address</span>
              </label>
              <input
                id="input-auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="w-full px-3 py-2 rounded-xl bg-[#0A0A0A] border border-white/15 text-white text-xs placeholder:text-stone-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-stone-400" />
                <span>Password</span>
              </label>
              <input
                id="input-auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl bg-[#0A0A0A] border border-white/15 text-white text-xs placeholder:text-stone-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Confirm Password</span>
                </label>
                <input
                  id="input-auth-confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-[#0A0A0A] border border-white/15 text-white text-xs placeholder:text-stone-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                />
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="line-clamp-2">{error}</span>
              </div>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50 mt-1"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === "signin" ? "Sign In to Dashboard" : "Create Account"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center text-[10px] text-stone-400 pt-0.5">
            {mode === "signin" ? (
              <span>
                Don't have an account yet?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setConfirmPassword("");
                  }}
                  className="text-emerald-400 hover:underline font-bold cursor-pointer"
                >
                  Sign Up
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setConfirmPassword("");
                  }}
                  className="text-emerald-400 hover:underline font-bold cursor-pointer"
                >
                  Sign In
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
