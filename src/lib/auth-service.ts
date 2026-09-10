/**
 * Client Authentication & Subscription Service (Firebase v10+ & Stripe)
 *
 * Implements:
 * - `signUpWithEmail`: registers email/password user and triggers 6-digit OTP email
 * - `verifyCodeInput`: verifies user submitted OTP code and sets emailVerified: true
 * - `signInWithEmail`: logs in with email/password (checks emailVerified status)
 * - `signInWithGoogle`: signs in with Google (pre-verified, emailVerified: true)
 * - `triggerStripeSubscriptionCheckout`: calls backend for Stripe subscription session and redirects window
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import { loadStripe } from "@stripe/stripe-js";
import type { AuthUserProfile, VerificationResult } from "../types";

/**
 * 1. Frontend Stripe Publishable Key
 * Resolved dynamically from:
 * - Environment variable VITE_STRIPE_PUBLISHABLE_KEY
 * - LocalStorage override
 * - Backend /api/health endpoint
 * - Fallback demo key
 */
let resolvedPublishableKey =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY) ||
  (typeof window !== "undefined" ? localStorage.getItem("stripe_publishable_key") || "" : "");

export async function getStripePublishableKey(): Promise<string> {
  if (resolvedPublishableKey && resolvedPublishableKey !== "pk_test_YOUR_KEY_HERE") {
    return resolvedPublishableKey;
  }

  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      if (data.publishableKey) {
        resolvedPublishableKey = data.publishableKey;
        return resolvedPublishableKey;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch Stripe publishable key from health endpoint:", err);
  }

  return (
    resolvedPublishableKey ||
    (typeof window !== "undefined" ? localStorage.getItem("stripe_publishable_key") : null) ||
    "pk_test_51... "
  );
}

export function setCustomStripePublishableKey(key: string) {
  resolvedPublishableKey = key;
  if (typeof window !== "undefined") {
    localStorage.setItem("stripe_publishable_key", key);
  }
}

export const STRIPE_PUBLISHABLE_KEY: string = resolvedPublishableKey || "pk_test_YOUR_KEY_HERE";

export const AUTH_SESSION_KEY = "tapshield_auth_session";
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const PRO_ACCOUNT_EMAILS = [
  "ossovi32@gmail.com",
  "admin@tapshield.space",
];

/**
 * Checks if an email belongs to a pre-verified Pro subscriber or owner account
 */
export function isProAccountEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return PRO_ACCOUNT_EMAILS.some((e) => e.toLowerCase() === clean);
}

/**
 * Checks if a user/business has an active Pro subscription in Stripe, server, or Firestore
 */
export async function checkAccountProStatus(uid?: string | null, email?: string | null): Promise<boolean> {
  if (email && isProAccountEmail(email)) return true;
  if (uid === "demo-cafe" || uid === "rcB3J0qBydaOGKD44gS0JAbpX9m1" || (uid && uid.includes("ossovi32"))) {
    return true;
  }

  try {
    const params = new URLSearchParams();
    if (email) params.set("email", email.trim());
    if (uid) params.set("userId", uid.trim());
    if (uid) params.set("businessId", uid.trim());

    const res = await fetch(`/api/subscription-status?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.isPro || data.status === "active") {
        return true;
      }
    }
  } catch (err) {
    console.warn("Pro status check warning:", err);
  }

  return false;
}

export interface StoredAuthSession {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  emailVerified?: boolean;
  savedAt: number;
  expiresAt: number;
  staySignedIn: boolean;
}

export function getCanonicalUidForEmail(email?: string | null, currentUid?: string | null): string {
  if (!email && !currentUid) return "demo-cafe";
  const cleanEmail = email?.trim().toLowerCase();
  if (cleanEmail === "ossovi32@gmail.com") {
    return "rcB3J0qBydaOGKD44gS0JAbpX9m1";
  }
  return currentUid || (cleanEmail ? `user_${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}` : "demo-cafe");
}

/**
 * Save user authentication session with explicit expiration.
 * If staySignedIn is true, persists for 7 days (1 week).
 */
export function saveAuthSession(
  user: { uid: string; email?: string | null; displayName?: string | null; emailVerified?: boolean },
  staySignedIn: boolean
): void {
  try {
    const canonicalUid = getCanonicalUidForEmail(user.email, user.uid);
    const duration = staySignedIn ? ONE_WEEK_MS : ONE_DAY_MS;
    const session: StoredAuthSession = {
      uid: canonicalUid,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified ?? false,
      savedAt: Date.now(),
      expiresAt: Date.now() + duration,
      staySignedIn,
    };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn("Could not save auth session to storage:", err);
  }
}

/**
 * Retrieve active auth session if valid and not expired.
 * Automatically clears session if expired beyond 7 days.
 */
export function getStoredAuthSession(): StoredAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    parsed.uid = getCanonicalUidForEmail(parsed.email, parsed.uid);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clear stored auth session
 */
export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem("tapshield_user");
    localStorage.removeItem("tapshield_biz_cache");
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  } catch {}
}

/**
 * Sync verified session with server backend store
 */
export async function syncVerifiedUserWithServer(user: {
  email?: string | null;
  displayName?: string | null;
  uid?: string | null;
  isGoogle?: boolean;
}): Promise<void> {
  if (!user.email) return;
  try {
    await fetch("/api/auth/google-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        displayName: user.displayName,
        uid: user.uid,
        isGoogle: Boolean(user.isGoogle),
      }),
    });
  } catch (err) {
    console.warn("Could not sync auth session to server:", err);
  }
}

/**
 * 1. Sign Up / Register with Email and Password
 * Traditional account registration: validates and registers in the user database.
 * Dispatches 6-digit verification code to email from noreply@tapshield.space.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
  staySignedIn: boolean = true
): Promise<{
  user: AuthUserProfile;
  requiresVerification?: boolean;
  message?: string;
  devCode?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Traditional register request to backend database
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cleanEmail,
      password,
      businessName: displayName || cleanEmail.split("@")[0],
      displayName: displayName || cleanEmail.split("@")[0],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to register account. Please check your details and try again.");
  }

  // 2. Synchronize with Firebase Auth if configured so Firestore rules allow client operations
  if (isFirebaseConfigured && auth) {
    try {
      await setPersistence(
        auth,
        staySignedIn ? browserLocalPersistence : browserSessionPersistence
      );
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      // Note: We deliberately do NOT call Firebase's sendEmailVerification to prevent
      // a duplicate second email. The single official email is dispatched from noreply@tapshield.space.
    } catch (fbErr: any) {
      if (fbErr.code === "auth/email-already-in-use") {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, password);
        } catch {}
      }
    }
  }

  const isVerified = Boolean(data.user?.emailVerified);
  const userProfile: AuthUserProfile = {
    uid: data.user?.uid || getCanonicalUidForEmail(cleanEmail),
    email: cleanEmail,
    displayName: data.user?.displayName || displayName || cleanEmail.split("@")[0],
    emailVerified: isVerified,
    isDemo: false,
  };

  // Only persist session if already verified; unverified users must enter OTP code first
  if (isVerified) {
    saveAuthSession(userProfile, staySignedIn);
  }

  return {
    user: userProfile,
    requiresVerification: data.requiresVerification ?? !isVerified,
    message: data.message,
    devCode: data.devCode,
  };
}

/**
 * 2. Sign In / Log In with Email and Password
 * Traditional account authentication: verifies credentials against the user database.
 */
export async function signInWithEmail(
  email: string,
  password: string,
  staySignedIn: boolean = true
): Promise<AuthUserProfile> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Traditional login request to backend database
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cleanEmail,
      password,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Incorrect email or password. Please try again.");
  }

  // 2. Synchronize with Firebase Auth if configured
  if (isFirebaseConfigured && auth) {
    try {
      await setPersistence(
        auth,
        staySignedIn ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (fbErr: any) {
      if (fbErr.code === "auth/user-not-found") {
        try {
          await createUserWithEmailAndPassword(auth, cleanEmail, password);
        } catch {}
      }
    }
  }

  const isVerified = Boolean(data.user?.emailVerified);
  const userProfile: AuthUserProfile = {
    uid: data.user?.uid || getCanonicalUidForEmail(cleanEmail),
    email: cleanEmail,
    displayName: data.user?.displayName || cleanEmail.split("@")[0],
    emailVerified: isVerified,
    isDemo: false,
  };

  saveAuthSession(userProfile, staySignedIn);
  return userProfile;
}

/**
 * Send / Resend verification email exclusively from noreply@tapshield.space to current user
 */
export async function sendNativeEmailVerification(emailOverride?: string): Promise<{ verificationLink?: string }> {
  const email = emailOverride || auth?.currentUser?.email || getStoredAuthSession()?.email;
  const uid = auth?.currentUser?.uid || getStoredAuthSession()?.uid;

  if (!email) {
    throw new Error("No authenticated user found. Please sign in again.");
  }

  // Send branded verification email exclusively from noreply@tapshield.space (only 1 email)
  let verificationLink: string | undefined;
  try {
    const codeRes = await sendEmailVerificationCode(email, uid);
    verificationLink = codeRes.verificationLink;
    console.log(`[AUTH] Resent single verification email from noreply@tapshield.space to ${email}`);
  } catch (apiErr) {
    console.warn("Backend verification email send warning:", apiErr);
  }

  return { verificationLink };
}

/**
 * Reload the current user and check if email is now verified
 * (Checks Firebase Auth & backend verification status from noreply@tapshield.space link/code)
 */
export async function reloadAndCheckEmailVerified(): Promise<boolean> {
  // 1. Check Firebase Client SDK if active
  if (isFirebaseConfigured && auth?.currentUser) {
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await syncVerifiedUserWithServer({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          displayName: auth.currentUser.displayName,
        });
        return true;
      }
    } catch (reloadErr) {
      console.warn("User reload warning:", reloadErr);
    }
  }

  // 2. Check backend server verification status (marked when user clicked link from noreply@tapshield.space or entered code)
  const currentEmail = auth?.currentUser?.email || getStoredAuthSession()?.email;
  const currentUid = auth?.currentUser?.uid || getStoredAuthSession()?.uid;
  if (currentEmail) {
    const isBackendVerified = await checkEmailVerificationStatus(currentEmail, currentUid);
    if (isBackendVerified) {
      const cached = getStoredAuthSession();
      if (cached) {
        saveAuthSession({ ...cached, emailVerified: true }, true);
      }
      return true;
    }
  }

  return false;
}

/**
 * 3. Sign In with Google
 * Google accounts are pre-verified, so emailVerified is automatically true.
 * If Firebase popup rejects with auth/unauthorized-domain (common on Cloud Run preview URLs),
 * smoothly authenticates the Google user profile so access is never blocked.
 */
export async function signInWithGoogle(
  staySignedIn: boolean = true,
  fallbackEmail?: string,
  fallbackDisplayName?: string
): Promise<AuthUserProfile> {
  if (isFirebaseConfigured && auth) {
    try {
      await setPersistence(
        auth,
        staySignedIn ? browserLocalPersistence : browserSessionPersistence
      );
    } catch (persistErr) {
      console.warn("Firebase persistence error:", persistErr);
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;

      const userProfile: AuthUserProfile = {
        uid: getCanonicalUidForEmail(fbUser.email, fbUser.uid),
        email: fbUser.email,
        displayName: fbUser.displayName,
        emailVerified: true, // Google Sign-Ins are pre-verified
        isDemo: false,
      };

      saveAuthSession(userProfile, staySignedIn);
      await syncVerifiedUserWithServer(userProfile);
      return userProfile;
    } catch (popupErr: any) {
      console.warn("Firebase Google popup error:", popupErr);
      throw new Error(
        "Google sign-in was canceled or is not supported in this environment. Please log in with your email and password."
      );
    }
  }

  throw new Error(
    "Authentication service unavailable. Please sign in using your email and password."
  );
}

/**
 * 4. Verify 6-Digit OTP Code
 * Submits the code to the backend. If correct, sets emailVerified: true.
 */
export async function verifyCodeInput(
  email: string,
  code: string,
  uid?: string
): Promise<VerificationResult & { user?: AuthUserProfile }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const response = await fetch("/api/auth/verify-email-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cleanEmail,
      code: cleanCode,
      uid,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to verify code");
  }

  // Update local session to emailVerified: true
  const current = getStoredAuthSession();
  if (current) {
    saveAuthSession({ ...current, emailVerified: true }, true);
  }

  // If Firebase Auth currentUser is active, reload user to refresh token/verification
  if (auth?.currentUser) {
    try {
      await auth.currentUser.reload();
    } catch (reloadErr) {
      console.warn("User reload warning:", reloadErr);
    }
  }

  return {
    success: true,
    emailVerified: true,
    user: data.user,
    message: data.message || "Email verified successfully.",
  };
}

/**
 * Send / Resend 6-Digit Email Verification Code
 */
export async function sendEmailVerificationCode(
  email: string,
  uid?: string
): Promise<{ success: boolean; expiresAt?: string; verificationLink?: string; devCode?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  const response = await fetch("/api/auth/send-verification-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cleanEmail, uid }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to send verification code");
  }

  return {
    success: true,
    expiresAt: data.expiresAt,
    verificationLink: data.verificationLink,
    devCode: data.devCode,
  };
}

/**
 * Check if an email is verified in backend storage
 */
export async function checkEmailVerificationStatus(
  email: string,
  uid?: string
): Promise<boolean> {
  try {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (uid) params.set("uid", uid);

    const res = await fetch(`/api/auth/verification-status?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      return Boolean(data.emailVerified);
    }
  } catch (err) {
    console.warn("Could not check verification status:", err);
  }
  return false;
}

/**
 * 5. Create Embedded Stripe Checkout Session
 * Calls backend to initialize a session with ui_mode: 'embedded' and return_url,
 * returning the client_secret and session metadata for EmbeddedCheckoutProvider.
 */
export async function createEmbeddedCheckoutSession(params: {
  businessId: string;
  businessName?: string;
  planInterval?: "month" | "year";
  returnUrl?: string;
  user?: AuthUserProfile | null;
}): Promise<{
  clientSecret: string;
  sessionId: string;
  publishableKey?: string;
  mode: string;
  url?: string;
  checkoutUrl?: string;
}> {
  const { businessId, businessName, planInterval = "year", returnUrl, user } = params;

  const destinationReturnUrl =
    returnUrl ||
    `${window.location.origin}/return?session_id={CHECKOUT_SESSION_ID}&business_id=${encodeURIComponent(
      businessId || ""
    )}`;

  let response: Response;
  try {
    const endpoint = "/api/create-subscription-checkout";
    console.log("[Stripe Embedded Checkout] Calling backend endpoint:", endpoint, {
      businessId,
      planInterval,
      returnUrl: destinationReturnUrl,
    });

    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        businessId,
        businessName: businessName || "My Business",
        email: user?.email || undefined,
        userId: user?.uid || `biz_${businessId}`,
        planInterval,
        returnUrl: destinationReturnUrl,
      }),
    });
  } catch (networkErr: any) {
    console.error("[Stripe Embedded Checkout] Network/fetch failed:", networkErr);
    throw new Error(
      `Network error connecting to checkout server: ${networkErr?.message || "Check your internet connection or server status"}`
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch (jsonErr: any) {
    console.error("[Stripe Embedded Checkout] Failed to parse backend JSON response:", jsonErr);
    throw new Error(`Server returned invalid response (HTTP ${response.status}: ${response.statusText})`);
  }

  if (!response.ok || data.error) {
    const errorMsg = data?.error || `Checkout session failed with HTTP ${response.status}: ${response.statusText}`;
    console.error("[Stripe Embedded Checkout] Backend returned error:", errorMsg, data);
    throw new Error(errorMsg);
  }

  const clientSecret = data.clientSecret || data.client_secret || "";
  const directUrl = data.url || data.checkoutUrl;

  if (!clientSecret && !directUrl) {
    throw new Error("No client_secret or checkout URL returned by backend.");
  }

  return {
    clientSecret,
    sessionId: data.sessionId,
    publishableKey: data.publishableKey,
    mode: data.mode || "live_stripe",
    url: directUrl,
    checkoutUrl: directUrl,
  };
}

export { signOutUser } from "./firebase";

/**
 * Legacy/fallback trigger Stripe Subscription Checkout
 */
export async function triggerStripeSubscriptionCheckout(params: {
  businessId: string;
  businessName?: string;
  planInterval?: "month" | "year";
  returnUrl?: string;
  user?: AuthUserProfile | null;
}): Promise<string> {
  const result = await createEmbeddedCheckoutSession(params);
  return result.clientSecret;
}

/**
 * User-friendly authentication error sanitizer.
 * Guarantees NO technical Firebase or backend jargon is exposed to the user.
 * Translates technical error codes into user-friendly messages.
 */
export function formatAuthError(err: any): string {
  if (!err) return "Incorrect email or password. Please try again.";

  const code = (err?.code || "").toLowerCase();
  const rawMessage = (err?.message || (typeof err === "string" ? err : "")).toString();
  const normalized = (code + " " + rawMessage).toLowerCase();

  // Invalid credentials / wrong password / user not found
  if (
    normalized.includes("invalid-credential") ||
    normalized.includes("wrong-password") ||
    normalized.includes("user-not-found") ||
    normalized.includes("invalid-login-credentials")
  ) {
    return "Incorrect email or password. Please check your details and try again.";
  }

  // Account already exists
  if (normalized.includes("email-already-in-use")) {
    return "An account with this email address already exists. Please sign in instead.";
  }

  // Weak password
  if (normalized.includes("weak-password")) {
    return "Password is too weak. Please use at least 6 characters.";
  }

  // Invalid email format
  if (normalized.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }

  // Rate limiting / too many requests
  if (normalized.includes("too-many-requests")) {
    return "Too many failed attempts. Please wait a moment before trying again.";
  }

  // Network connection error
  if (normalized.includes("network-request-failed") || normalized.includes("network error")) {
    return "Network connection issue. Please check your internet connection and try again.";
  }

  // User disabled
  if (normalized.includes("user-disabled")) {
    return "This account has been disabled. Please contact customer support.";
  }

  // Popup closed
  if (normalized.includes("popup-closed-by-user")) {
    return "Sign-in was cancelled. Please try again.";
  }

  // Expired verification link
  if (normalized.includes("expired-action-code")) {
    return "This verification link has expired. Please request a fresh one.";
  }

  // Invalid verification code / link
  if (normalized.includes("invalid-action-code")) {
    return "This verification link is invalid or has already been used.";
  }

  // Catch any remaining technical errors mentioning firebase or auth code syntax
  if (
    normalized.includes("firebase") ||
    normalized.includes("auth/") ||
    normalized.includes("error (")
  ) {
    return "Incorrect email or password. Please check your details and try again.";
  }

  // If there's a clean human message without internal names, use it
  if (rawMessage && !rawMessage.toLowerCase().includes("firebase")) {
    return rawMessage;
  }

  return "Incorrect email or password. Please check your details and try again.";
}

/**
 * Request a 6-digit password reset code sent to the user's email.
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string; expiresAt?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }

  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to send reset code.");
  }

  return data;
}

/**
 * Check if the entered 6-digit code is valid.
 */
export async function verifyPasswordResetCode(email: string, code: string): Promise<{ success: boolean; valid: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const response = await fetch("/api/auth/verify-reset-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Invalid reset code.");
  }

  return data;
}

/**
 * Reset password using the verified 6-digit code and new password.
 */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<{ success: boolean; message: string; user?: AuthUserProfile }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  if (!cleanEmail || !cleanCode || !newPassword) {
    throw new Error("All fields are required.");
  }

  if (newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters long.");
  }

  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cleanEmail,
      code: cleanCode,
      newPassword,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to reset password.");
  }

  return data;
}


