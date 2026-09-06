import React, { useState, useEffect, useRef } from "react";
import { Mail, CheckCircle, AlertCircle, RefreshCw, ArrowRight, ShieldCheck, LogOut } from "lucide-react";
import { verifyCodeInput, sendEmailVerificationCode } from "../lib/auth-service";
import type { AuthUserProfile } from "../types";

interface EmailVerificationScreenProps {
  currentUser: AuthUserProfile;
  initialPreviewCode?: string;
  onVerified: (updatedUser: AuthUserProfile) => void;
  onSignOut: () => void;
}

export function EmailVerificationScreen({
  currentUser,
  initialPreviewCode,
  onVerified,
  onSignOut,
}: EmailVerificationScreenProps) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | undefined>(initialPreviewCode);

  // 15-minute countdown (900 seconds)
  const [timeLeft, setTimeLeft] = useState<number>(15 * 60);

  // Input refs for auto-focusing next box
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();

    // Countdown interval
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleDigitChange = (index: number, value: string) => {
    setError(null);
    // Allow single numeric digit or paste
    if (value.length > 1) {
      // Pasted multi-digit code
      const pastedDigits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newDigits = [...digits];
      pastedDigits.forEach((d, i) => {
        if (index + i < 6) newDigits[index + i] = d;
      });
      setDigits(newDigits);
      const nextFocus = Math.min(index + pastedDigits.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const fullCode = digits.join("");

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (fullCode.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const email = currentUser.email || "";
      const result = await verifyCodeInput(email, fullCode, currentUser.uid);

      if (result.success) {
        setSuccessMsg("Email verified! Redirecting to your dashboard...");
        setTimeout(() => {
          onVerified({
            ...currentUser,
            emailVerified: true,
          });
        }, 1000);
      }
    } catch (err: any) {
      setError(err?.message || "Invalid verification code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const email = currentUser.email || "";
      const res = await sendEmailVerificationCode(email, currentUser.uid);
      setSuccessMsg("A new 6-digit code has been sent to your email.");
      setTimeLeft(15 * 60); // Reset timer
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      if (res.previewCode) {
        setPreviewCode(res.previewCode);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to resend code.");
    } finally {
      setIsResending(false);
    }
  };

  // Quick fill helper for sandbox / testing
  const handleQuickFill = () => {
    if (previewCode && previewCode.length === 6) {
      const codeDigits = previewCode.split("");
      setDigits(codeDigits);
      inputRefs.current[5]?.focus();
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header Badge & Icon */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <Mail className="w-7 h-7" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Verification Required</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Check Your Email
          </h2>
          <p className="text-stone-400 text-xs sm:text-sm max-w-xs mx-auto leading-relaxed">
            We sent a 6-digit verification code to:
            <br />
            <span className="font-mono font-bold text-white text-xs sm:text-sm bg-white/5 px-2 py-0.5 rounded mt-1 inline-block">
              {currentUser.email}
            </span>
          </p>
        </div>

        {/* Development / Sandbox OTP Preview helper */}
        {previewCode && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-emerald-400 font-bold">
              <span>Sandbox / Demo Code:</span>
              <button
                type="button"
                onClick={handleQuickFill}
                className="text-[10px] bg-emerald-500 text-black px-2 py-0.5 rounded font-black uppercase hover:bg-emerald-400 cursor-pointer"
              >
                Auto-Fill
              </button>
            </div>
            <div className="text-stone-300 text-[11px]">
              For rapid evaluation, your code is:{" "}
              <strong className="text-emerald-300 tracking-widest text-sm">{previewCode}</strong>
            </div>
          </div>
        )}

        {/* 6-Digit Code Form */}
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex justify-between items-center gap-2 sm:gap-2.5">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                id={`otp-input-${idx}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-mono font-black rounded-xl bg-[#0A0A0A] border border-white/20 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              />
            ))}
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Expiration Timer & Resend */}
          <div className="flex items-center justify-between text-xs font-mono text-stone-400 px-1">
            <span>
              Expires in:{" "}
              <strong className={timeLeft < 120 ? "text-rose-400" : "text-emerald-400"}>
                {formatTime(timeLeft)}
              </strong>
            </span>
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="text-stone-300 hover:text-white underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isResending ? "animate-spin" : ""}`} />
              <span>Resend Code</span>
            </button>
          </div>

          {/* Submit Button */}
          <button
            id="btn-verify-otp-submit"
            type="submit"
            disabled={isVerifying || fullCode.length !== 6}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            {isVerifying ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Verifying Code...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify & Enter Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer / Switch Account */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-stone-400">
          <span>Signed in as unverified</span>
          <button
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 text-stone-300 hover:text-rose-400 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out / Switch</span>
          </button>
        </div>
      </div>
    </div>
  );
}
