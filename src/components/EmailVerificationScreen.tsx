import { useState, useEffect } from "react";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import {
  sendNativeEmailVerification,
  reloadAndCheckEmailVerified,
  formatAuthError,
} from "../lib/auth-service";
import type { AuthUserProfile } from "../types";

interface EmailVerificationScreenProps {
  currentUser: AuthUserProfile;
  initialPreviewCode?: string;
  onVerified: (updatedUser: AuthUserProfile) => void;
  onSignOut: () => void;
}

export function EmailVerificationScreen({
  currentUser,
  onVerified,
  onSignOut,
}: EmailVerificationScreenProps) {
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Auto-poll Firebase Auth every 4 seconds to detect when user verifies via email link in another tab
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const isVerified = await reloadAndCheckEmailVerified();
        if (isVerified && isMounted) {
          clearInterval(interval);
          onVerified({
            ...currentUser,
            emailVerified: true,
          });
        }
      } catch (err) {
        // Silent poll error (e.g. temporary network blip)
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser, onVerified]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  // Trigger sendEmailVerification(user) again to resend verification link
  const handleResend = async () => {
    if (cooldownSeconds > 0 || isResending) return;
    setIsResending(true);
    setErrorMessage(null);
    setResendSuccess(null);

    try {
      await sendNativeEmailVerification();
      setResendSuccess("A fresh verification link has been sent to your email address.");
      setCooldownSeconds(45); // 45s cooldown to prevent Firebase rate-limits
    } catch (err: any) {
      console.error("Resend verification error:", err);
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsResending(false);
    }
  };

  // Explicit user check button: "I've Verified My Email"
  const handleCheckStatus = async () => {
    setIsChecking(true);
    setErrorMessage(null);

    try {
      const isVerified = await reloadAndCheckEmailVerified();
      if (isVerified) {
        setResendSuccess("Email verified! Redirecting to your dashboard...");
        setTimeout(() => {
          onVerified({
            ...currentUser,
            emailVerified: true,
          });
        }, 800);
      } else {
        setErrorMessage(
          "We haven't detected your verification yet. Please make sure you clicked the link in your email, then click this button again."
        );
      }
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div id="email-verification-screen" className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-[#141414] border border-white/15 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Visual Icon & Status Badge */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <Mail className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold uppercase tracking-wider">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Verification Required</span>
          </div>

          {/* Explicit heading matching user's requested text */}
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-snug">
            Please check your email to verify your account
          </h2>

          <p className="text-stone-300 text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
            We sent a secure verification link to your email address:
          </p>

          <div className="inline-block bg-[#0A0A0A] border border-white/15 px-3.5 py-1.5 rounded-xl">
            <span className="font-mono font-bold text-emerald-400 text-xs sm:text-sm break-all">
              {currentUser.email}
            </span>
          </div>
        </div>

        {/* Spam Notice / Tips Box */}
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-white/10 text-xs text-stone-400 space-y-2 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-stone-300 font-semibold mb-1">
                Haven&apos;t received the email yet?
              </p>
              <p>
                Check your <strong className="text-white">Spam</strong> or{" "}
                <strong className="text-white">Junk</strong> folder. Sometimes automated verification
                emails can be filtered automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {resendSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{resendSuccess}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          {/* 1. Primary Action: I've Verified My Email */}
          <button
            id="btn-check-verified-status"
            type="button"
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/15"
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking Verification Status...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>I&apos;ve Verified My Email — Continue</span>
              </>
            )}
          </button>

          {/* 2. Mandatory Resend Button: triggers sendEmailVerification(user) */}
          <button
            id="btn-resend-verification-email"
            type="button"
            onClick={handleResend}
            disabled={isResending || cooldownSeconds > 0}
            className="w-full py-3 px-4 rounded-xl bg-[#0A0A0A] hover:bg-white/5 border border-white/15 text-stone-200 hover:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
            <span>
              {isResending
                ? "Sending Link..."
                : cooldownSeconds > 0
                ? `Resend Email in ${cooldownSeconds}s`
                : "Resend Verification Email"}
            </span>
          </button>
        </div>

        {/* Footer / Account Management */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Awaiting email confirmation</span>
          </span>

          <button
            id="btn-signout-unverified"
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 text-stone-300 hover:text-rose-400 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out / Switch Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
