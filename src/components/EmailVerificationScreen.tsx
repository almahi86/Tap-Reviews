import { useState, useEffect, type FormEvent } from "react";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ShieldAlert,
  KeyRound,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import {
  sendNativeEmailVerification,
  reloadAndCheckEmailVerified,
  verifyCodeInput,
  formatAuthError,
} from "../lib/auth-service";
import type { AuthUserProfile } from "../types";

interface EmailVerificationScreenProps {
  currentUser: AuthUserProfile;
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
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Check URL query parameters for ?verified=true (only if user explicitly clicked link from email)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("verified") === "true") {
        setResendSuccess("Email verified successfully! Opening your dashboard...");
        const timer = setTimeout(() => {
          onVerified({
            ...currentUser,
            emailVerified: true,
          });
        }, 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore in environments where window.location is restricted
    }
  }, [currentUser, onVerified]);

  // Cooldown countdown timer for resend button
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  // Trigger send verification email from noreply@tapshield.space
  const handleResend = async () => {
    if (cooldownSeconds > 0 || isResending) return;
    setIsResending(true);
    setErrorMessage(null);
    setResendSuccess(null);

    try {
      await sendNativeEmailVerification(currentUser.email);
      setResendSuccess("A fresh verification code from noreply@tapshield.space has been sent!");
      setCooldownSeconds(30); // 30s cooldown
    } catch (err: any) {
      console.error("Resend verification error:", err);
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsResending(false);
    }
  };

  // Explicit user check button: "I've Clicked the Link in My Email"
  const handleCheckStatus = async () => {
    setIsChecking(true);
    setErrorMessage(null);

    try {
      const isVerified = await reloadAndCheckEmailVerified();
      if (isVerified) {
        setResendSuccess("Email verified! Opening your dashboard...");
        setTimeout(() => {
          onVerified({
            ...currentUser,
            emailVerified: true,
          });
        }, 600);
      } else {
        setErrorMessage(
          "We haven't detected your verification yet. Please enter the 6-digit code from the email below, or click the 'Verify My Account' button in the email from noreply@tapshield.space."
        );
      }
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsChecking(false);
    }
  };

  // Submit 6-digit OTP code directly
  const handleVerifyOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = otpCode.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMessage("Please enter the 6-digit verification code from your email.");
      return;
    }

    setIsVerifyingCode(true);
    setErrorMessage(null);

    try {
      const result = await verifyCodeInput(currentUser.email, cleanCode, currentUser.uid);
      if (result.success) {
        setResendSuccess("Code confirmed! Email verified successfully.");
        setTimeout(() => {
          onVerified({
            ...currentUser,
            emailVerified: true,
          });
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid or expired verification code. Please check your email or request a new code.");
    } finally {
      setIsVerifyingCode(false);
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
            <span>Enter Code to Continue</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-snug">
            Enter Verification Code
          </h2>

          <p className="text-stone-300 text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
            We sent a 6-digit verification code to:
          </p>

          <div className="inline-flex flex-col items-center gap-1.5 bg-[#0A0A0A] border border-white/15 px-4 py-2.5 rounded-xl">
            <span className="font-mono font-bold text-emerald-400 text-sm break-all">
              {currentUser.email}
            </span>
            <span className="text-[11px] font-mono text-stone-400">
              Sender: <strong className="text-white font-mono">noreply@tapshield.space</strong>
            </span>
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

        {/* PRIMARY ACTION: 6-Digit OTP Code Form */}
        <form onSubmit={handleVerifyOtp} className="space-y-3.5">
          <div className="p-4 rounded-xl bg-[#0F0F0F] border border-white/15 space-y-3">
            <label htmlFor="verification-otp-input" className="block text-xs font-bold uppercase tracking-wider text-stone-200 text-center">
              Enter 6-Digit Code from Email
            </label>
            <input
              id="verification-otp-input"
              type="text"
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                setOtpCode(val);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="••••••"
              className="w-full bg-[#050505] border border-white/20 focus:border-emerald-500 text-white font-mono text-center tracking-[10px] text-2xl font-black rounded-xl py-3 outline-none transition shadow-inner"
            />
            <p className="text-[11px] text-center text-stone-400">
              Code expires in 15 minutes
            </p>
          </div>

          {/* Primary Submit Button */}
          <button
            id="btn-submit-verification-otp"
            type="submit"
            disabled={isVerifyingCode || otpCode.trim().length !== 6}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            {isVerifyingCode ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying Code...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Code &amp; Access Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Spam Notice / Tips Box */}
        <div className="p-3.5 rounded-xl bg-[#0A0A0A] border border-white/10 text-xs text-stone-400 space-y-1.5 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-stone-300 font-semibold">
                Didn&apos;t receive the code?
              </p>
              <p className="text-[11px]">
                Check your <strong className="text-white">Spam or Junk</strong> folder for an email from{" "}
                <strong className="text-emerald-300 font-mono">noreply@tapshield.space</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Secondary Actions: Resend Code & Link Verification */}
        <div className="space-y-2 pt-1">
          {/* Resend Verification Email Button */}
          <button
            id="btn-resend-verification-email"
            type="button"
            onClick={handleResend}
            disabled={isResending || cooldownSeconds > 0}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0A0A0A] hover:bg-white/5 border border-white/15 text-stone-300 hover:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
            <span>
              {isResending
                ? "Sending Email..."
                : cooldownSeconds > 0
                ? `Resend Code in ${cooldownSeconds}s`
                : "Resend Verification Code"}
            </span>
          </button>

          {/* Optional: Clicked link in email */}
          <button
            id="btn-check-verified-status"
            type="button"
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="w-full py-2 px-3 text-stone-400 hover:text-stone-200 text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <KeyRound className="w-3 h-3 text-emerald-400" />
            <span>{isChecking ? "Checking link status..." : "Clicked the link in your email? Check status here"}</span>
          </button>
        </div>

        {/* Footer / Account Management */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Code required from noreply@tapshield.space</span>
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
