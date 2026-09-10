import React, { useState, useEffect } from "react";
import {
  X,
  Mail,
  Lock,
  AlertCircle,
  ArrowRight,
  Clock,
  Store,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  RotateCw,
} from "lucide-react";
import {
  signInWithEmail,
  signUpWithEmail,
  verifyCodeInput,
  sendEmailVerificationCode,
  saveAuthSession,
  syncVerifiedUserWithServer,
  formatAuthError,
  requestPasswordReset,
  resetPasswordWithCode,
} from "../lib/auth-service";
import type { AuthUserProfile } from "../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUserProfile, businessName?: string) => void;
  defaultMode?: "signin" | "signup";
}

type ModalMode = "signin" | "signup" | "verify_signup" | "forgot" | "reset";

export function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultMode = "signin",
}: AuthModalProps) {
  const [mode, setMode] = useState<ModalMode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AuthUserProfile | null>(null);
  const [pendingBusinessName, setPendingBusinessName] = useState<string | undefined>(undefined);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setError(null);
      setSuccessMessage(null);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setDisplayName("");
      setBusinessName("");
      setResetCode("");
      setSignupCode("");
      setDevCode(null);
      setPendingUser(null);
      setPendingBusinessName(undefined);
      setResendCooldown(0);
    }
  }, [isOpen, defaultMode]);

  // Cooldown timer for resending codes
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (mode === "signup") {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
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

        const res = await signUpWithEmail(
          cleanEmail,
          password,
          displayName || businessName,
          staySignedIn
        );

        if (res.requiresVerification || !res.user.emailVerified) {
          setPendingUser(res.user);
          setPendingBusinessName(businessName.trim() || undefined);
          if (res.devCode) {
            setDevCode(res.devCode);
          }
          setMode("verify_signup");
          setSuccessMessage(
            res.message || `We sent a 6-digit verification code to ${cleanEmail}. Please enter it below to activate your account.`
          );
          setResendCooldown(60);
          setSignupCode("");
          return;
        }

        // Pre-verified accounts (e.g. Pro subscription)
        onAuthSuccess(res.user, businessName.trim() || undefined);
        onClose();
      } else if (mode === "verify_signup") {
        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = signupCode.trim();

        if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
          throw new Error("Please enter the 6-digit verification code sent to your email.");
        }

        const verifyRes = await verifyCodeInput(cleanEmail, cleanCode, pendingUser?.uid);
        setSuccessMessage("Email verified successfully! Activating your account...");

        const verifiedUser: AuthUserProfile = verifyRes.user || {
          uid: pendingUser?.uid || `usr_${Date.now()}`,
          email: cleanEmail,
          displayName: pendingUser?.displayName || displayName || businessName || cleanEmail.split("@")[0],
          emailVerified: true,
          isDemo: false,
        };

        saveAuthSession(verifiedUser, staySignedIn);
        try {
          await syncVerifiedUserWithServer({
            email: cleanEmail,
            displayName: verifiedUser.displayName,
            uid: verifiedUser.uid,
          });
        } catch (e) {
          console.warn("Sync warning:", e);
        }

        setTimeout(() => {
          onAuthSuccess(verifiedUser, pendingBusinessName || businessName.trim() || undefined);
          onClose();
        }, 600);
      } else if (mode === "signin") {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
          throw new Error("Email and password are required.");
        }

        const user = await signInWithEmail(cleanEmail, password, staySignedIn);
        if (user.emailVerified === false) {
          // Unverified account: prompt verification code
          try {
            const codeRes = await sendEmailVerificationCode(cleanEmail, user.uid);
            if (codeRes.devCode) {
              setDevCode(codeRes.devCode);
            }
          } catch {}
          setPendingUser(user);
          setMode("verify_signup");
          setSuccessMessage(`Please verify your email to access your dashboard. A 6-digit code was sent to ${cleanEmail}.`);
          setResendCooldown(60);
          return;
        }

        onAuthSuccess(user);
        onClose();
      } else if (mode === "forgot") {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes("@")) {
          throw new Error("Please enter a valid email address.");
        }

        const res = await requestPasswordReset(cleanEmail);
        setSuccessMessage(res.message || `A 6-digit code has been sent to ${cleanEmail}`);
        setMode("reset");
        setResendCooldown(60);
      } else if (mode === "reset") {
        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = resetCode.trim();

        if (!cleanCode || cleanCode.length < 6) {
          throw new Error("Please enter the 6-digit code sent to your email.");
        }
        if (!password) {
          throw new Error("Please enter your new password.");
        }
        if (password.length < 6) {
          throw new Error("New password must be at least 6 characters.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match. Please ensure both passwords match.");
        }

        const res = await resetPasswordWithCode(cleanEmail, cleanCode, password);
        setSuccessMessage("Password reset successfully!");

        if (res.user) {
          // Immediately log user in with newly reset credentials
          setTimeout(() => {
            onAuthSuccess(res.user!);
            onClose();
          }, 800);
        } else {
          // Switch to signin mode
          setTimeout(() => {
            setMode("signin");
            setPassword("");
            setConfirmPassword("");
            setSuccessMessage("Password reset successfully. You can now sign in with your new password.");
          }, 1200);
        }
      }
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await sendEmailVerificationCode(cleanEmail, pendingUser?.uid);
      if (res.devCode) {
        setDevCode(res.devCode);
      }
      setSuccessMessage(`A fresh 6-digit verification code has been sent to ${cleanEmail}`);
      setResendCooldown(60);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await requestPasswordReset(cleanEmail);
      setSuccessMessage(res.message || `A fresh code has been sent to ${cleanEmail}`);
      setResendCooldown(60);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const getHeaderTitle = () => {
    switch (mode) {
      case "signin":
        return "Sign In to TapShield";
      case "signup":
        return "Create Your Account";
      case "verify_signup":
        return "Verify Your Email";
      case "forgot":
        return "Reset Your Password";
      case "reset":
        return "Enter Reset Code";
    }
  };

  const getHeaderSubtitle = () => {
    switch (mode) {
      case "signin":
        return "Enter your credentials to access your store";
      case "signup":
        return "Register a new store owner account";
      case "verify_signup":
        return `Enter the 6-digit code sent to ${email || "your email"}`;
      case "forgot":
        return "We will send a 6-digit verification code to your email";
      case "reset":
        return `Enter the 6-digit code sent to ${email || "your email"}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#141414] border border-white/15 rounded-2xl shadow-2xl my-auto max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        {/* Fixed Header with Guaranteed-Visible Cross Button */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 flex-shrink-0 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 flex-shrink-0">
              {mode === "forgot" || mode === "reset" || mode === "verify_signup" ? (
                <KeyRound className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-tight leading-tight">
                {getHeaderTitle()}
              </h2>
              <p className="text-[10px] text-stone-400 font-mono truncate max-w-[240px] sm:max-w-xs">
                {getHeaderSubtitle()}
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

        {/* Modal Body Container */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 [scrollbar-width:thin]">
          {/* Mode Selector Tabs (only shown for signin/signup) */}
          {mode === "signin" || mode === "signup" ? (
            <div className="flex bg-[#0A0A0A] p-1 rounded-xl border border-white/10">
              <button
                id="tab-auth-signin"
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMessage(null);
                  setConfirmPassword("");
                }}
                className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition cursor-pointer ${
                  mode === "signin"
                    ? "bg-white text-black font-black"
                    : "text-stone-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                id="tab-auth-signup"
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setSuccessMessage(null);
                  setConfirmPassword("");
                }}
                className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition cursor-pointer ${
                  mode === "signup"
                    ? "bg-emerald-500 text-black font-black"
                    : "text-stone-400 hover:text-white"
                }`}
              >
                Sign Up
              </button>
            </div>
          ) : mode === "verify_signup" ? (
            /* Navigation for Verify Signup Mode */
            <div className="flex items-center justify-between">
              <button
                id="btn-back-to-signup"
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-white transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Back to Sign Up / Change Email</span>
              </button>
              <button
                id="btn-switch-to-signin-from-verify"
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="text-[11px] text-stone-400 hover:text-emerald-400 transition cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : (
            /* Back to Sign In Link for Forgot/Reset Modes */
            <div className="flex items-center justify-between">
              <button
                id="btn-back-to-signin"
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-white transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Back to Sign In</span>
              </button>

              {mode === "reset" && (
                <button
                  id="btn-change-reset-email"
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[11px] text-stone-400 hover:text-emerald-400 transition cursor-pointer"
                >
                  Change Email
                </button>
              )}
            </div>
          )}

          {/* Feedback Banners */}
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span className="line-clamp-2">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* SIGNUP: Business Name */}
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

            {/* EMAIL (Shown for signin, signup, forgot) */}
            {mode !== "reset" && mode !== "verify_signup" && (
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
            )}

            {/* FORGOT MODE: Description text */}
            {mode === "forgot" && (
              <div className="p-3 bg-[#0A0A0A] rounded-xl border border-white/10 text-[11px] text-stone-400 leading-relaxed">
                Enter your account email address. We'll send a 6-digit verification code from{" "}
                <span className="text-emerald-400 font-mono font-medium">noreply@tapshield.space</span>{" "}
                to reset your password securely.
              </div>
            )}

            {/* VERIFY SIGNUP MODE: Explanation & Code Input */}
            {mode === "verify_signup" && (
              <div className="space-y-3">
                <div className="p-3 bg-[#0A0A0A] rounded-xl border border-white/10 text-[11px] text-stone-300 leading-relaxed space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <Mail className="w-4 h-4 text-emerald-400" />
                    <span>Verification Code Sent</span>
                  </div>
                  <p>
                    We sent a 6-digit verification code from{" "}
                    <span className="text-emerald-400 font-mono font-semibold">noreply@tapshield.space</span> to{" "}
                    <strong className="text-white font-semibold">{email}</strong>.
                  </p>
                  <p className="text-[10px] text-stone-400">
                    Please check your inbox (and spam/junk folder) and enter the code below to activate your account.
                  </p>
                </div>

                {/* Dev/Preview Code Helper */}
                {devCode && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-mono">
                      <span>Dev/Preview Code:</span>
                      <strong className="text-emerald-400 text-sm tracking-widest">{devCode}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSignupCode(devCode)}
                      className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase transition cursor-pointer"
                    >
                      Auto-fill
                    </button>
                  </div>
                )}

                {/* 6-Digit Verification Code */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                      <span>6-Digit Verification Code</span>
                    </label>
                    <button
                      id="btn-resend-signup-code"
                      type="button"
                      onClick={handleResendSignupCode}
                      disabled={resendCooldown > 0 || isLoading}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:text-stone-600 transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <RotateCw className={`w-3 h-3 ${resendCooldown > 0 ? "animate-spin" : ""}`} />
                      <span>
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                      </span>
                    </button>
                  </div>
                  <input
                    id="input-signup-code"
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={signupCode}
                    onChange={(e) => setSignupCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0A] border border-emerald-500/50 text-emerald-400 text-center text-lg font-mono tracking-[0.4em] placeholder:text-stone-700 placeholder:tracking-normal focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* RESET MODE: 6-Digit Code */}
            {mode === "reset" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                    <span>6-Digit Verification Code</span>
                  </label>
                  <button
                    id="btn-resend-code"
                    type="button"
                    onClick={handleResendResetCode}
                    disabled={resendCooldown > 0 || isLoading}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:text-stone-600 transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <RotateCw className={`w-3 h-3 ${resendCooldown > 0 ? "animate-spin" : ""}`} />
                    <span>
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                    </span>
                  </button>
                </div>
                <input
                  id="input-reset-code"
                  type="text"
                  required
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0A] border border-emerald-500/50 text-emerald-400 text-center text-lg font-mono tracking-[0.4em] placeholder:text-stone-700 placeholder:tracking-normal focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none transition"
                />
              </div>
            )}

            {/* PASSWORD (Shown for signin, signup, reset) */}
            {mode !== "forgot" && mode !== "verify_signup" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-stone-400" />
                    <span>
                      {mode === "reset" ? "New Password" : "Password"}
                    </span>
                  </label>

                  {mode === "signin" && (
                    <button
                      id="btn-auth-forgot-password"
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer font-semibold transition"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
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
            )}

            {/* CONFIRM PASSWORD (Shown for signup and reset) */}
            {(mode === "signup" || mode === "reset") && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {mode === "reset" ? "Confirm New Password" : "Confirm Password"}
                  </span>
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

            {/* Stay Signed In Option (signin and signup) */}
            {(mode === "signin" || mode === "signup") && (
              <div className="bg-[#0A0A0A] px-3 py-2 rounded-xl border border-white/10 flex items-center justify-between gap-2">
                <label
                  htmlFor="checkbox-stay-signed-in"
                  className="flex items-center gap-2 select-none cursor-pointer flex-1"
                >
                  <input
                    id="checkbox-stay-signed-in"
                    type="checkbox"
                    checked={staySignedIn}
                    onChange={(e) => setStaySignedIn(e.target.checked)}
                    className="w-4 h-4 rounded border-white/30 bg-[#161616] text-emerald-500 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Remember this device (7 days)</span>
                  </div>
                </label>
              </div>
            )}

            {/* Submit Button */}
            <button
              id="btn-auth-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50 mt-1"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>
                    {mode === "forgot"
                      ? "Sending Code..."
                      : mode === "reset"
                      ? "Resetting Password..."
                      : mode === "verify_signup"
                      ? "Verifying Code..."
                      : mode === "signup"
                      ? "Sending Verification Code..."
                      : "Verifying Database..."}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {mode === "signin"
                      ? "Sign In to Dashboard"
                      : mode === "signup"
                      ? "Create Account & Send Code"
                      : mode === "verify_signup"
                      ? "Verify Code & Activate Account"
                      : mode === "forgot"
                      ? "Send 6-Digit Code"
                      : "Reset Password & Sign In"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Navigation */}
          <div className="text-center text-[10px] text-stone-400 pt-1">
            {mode === "signin" ? (
              <span>
                Don't have an account yet?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setSuccessMessage(null);
                    setConfirmPassword("");
                  }}
                  className="text-emerald-400 hover:underline font-bold cursor-pointer"
                >
                  Sign Up
                </button>
              </span>
            ) : mode === "signup" ? (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setSuccessMessage(null);
                    setConfirmPassword("");
                  }}
                  className="text-emerald-400 hover:underline font-bold cursor-pointer"
                >
                  Sign In
                </button>
              </span>
            ) : mode === "verify_signup" ? (
              <span>
                Didn't receive the email?{" "}
                <button
                  type="button"
                  onClick={handleResendSignupCode}
                  disabled={resendCooldown > 0 || isLoading}
                  className="text-emerald-400 hover:underline font-bold cursor-pointer disabled:text-stone-600"
                >
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend Code"}
                </button>
              </span>
            ) : (
              <span>
                Remembered your password?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setSuccessMessage(null);
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
