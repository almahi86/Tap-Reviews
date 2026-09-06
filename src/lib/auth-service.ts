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
import type { AuthUserProfile, VerificationResult } from "../types";

export const AUTH_SESSION_KEY = "tapshield_auth_session";
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredAuthSession {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  savedAt: number;
  expiresAt: number;
  staySignedIn: boolean;
}

/**
 * Save user authentication session with explicit expiration.
 * If staySignedIn is true, persists for 7 days (1 week).
 */
export function saveAuthSession(
  user: { uid: string; email?: string | null; displayName?: string | null },
  staySignedIn: boolean
): void {
  try {
    const duration = staySignedIn ? ONE_WEEK_MS : ONE_DAY_MS;
    const session: StoredAuthSession = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
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
  } catch {}
}

/**
 * 1. Sign Up with Email and Password
 * Registers user in Firebase Auth and immediately sends a 6-digit verification code.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
  staySignedIn: boolean = true
): Promise<{ user: AuthUserProfile; previewCode?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (isFirebaseConfigured && auth) {
    try {
      await setPersistence(
        auth,
        staySignedIn ? browserLocalPersistence : browserSessionPersistence
      );
    } catch (persistErr) {
      console.warn("Firebase persistence error:", persistErr);
    }

    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const fbUser = userCredential.user;

    if (displayName) {
      await updateProfile(fbUser, { displayName });
    }

    // Trigger 6-digit verification code email
    const sendResult = await sendEmailVerificationCode(cleanEmail, fbUser.uid);

    const userProfile: AuthUserProfile = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: displayName || fbUser.displayName,
      emailVerified: false, // Email/password requires code verification
      isDemo: false,
    };

    saveAuthSession(userProfile, staySignedIn);

    return {
      user: userProfile,
      previewCode: sendResult.previewCode,
    };
  }

  throw new Error("Authentication service is currently unavailable. Please check your connection.");
}

/**
 * 2. Sign In with Email and Password
 * Validates credentials and returns AuthUserProfile with emailVerified state.
 */
export async function signInWithEmail(
  email: string,
  password: string,
  staySignedIn: boolean = true
): Promise<AuthUserProfile> {
  const cleanEmail = email.trim().toLowerCase();

  if (isFirebaseConfigured && auth) {
    try {
      await setPersistence(
        auth,
        staySignedIn ? browserLocalPersistence : browserSessionPersistence
      );
    } catch (persistErr) {
      console.warn("Firebase persistence error:", persistErr);
    }

    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const fbUser = credential.user;

    // Check if user was verified in server store or firebase auth
    let isVerified = fbUser.emailVerified;
    if (!isVerified) {
      isVerified = await checkEmailVerificationStatus(cleanEmail, fbUser.uid);
    }

    const userProfile: AuthUserProfile = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName,
      emailVerified: isVerified,
      isDemo: false,
    };

    saveAuthSession(userProfile, staySignedIn);
    return userProfile;
  }

  throw new Error("Authentication service is currently unavailable. Please check your connection.");
}

/**
 * 3. Sign In with Google
 * Google accounts are pre-verified, so emailVerified is automatically true.
 */
export async function signInWithGoogle(staySignedIn: boolean = true): Promise<AuthUserProfile> {
  if (isFirebaseConfigured && auth) {
    try {
      await setPersistence(
        auth,
        staySignedIn ? browserLocalPersistence : browserSessionPersistence
      );
    } catch (persistErr) {
      console.warn("Firebase persistence error:", persistErr);
    }

    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    const result = await signInWithPopup(auth, provider);
    const fbUser = result.user;

    const userProfile: AuthUserProfile = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName,
      emailVerified: true, // Google Sign-Ins bypass email OTP verification
      isDemo: false,
    };

    saveAuthSession(userProfile, staySignedIn);
    return userProfile;
  }

  throw new Error("Authentication service is currently unavailable. Please check your connection.");
}

/**
 * 4. Verify 6-Digit OTP Code
 * Submits the code to the backend. If correct, sets emailVerified: true.
 */
export async function verifyCodeInput(
  email: string,
  code: string,
  uid?: string
): Promise<VerificationResult> {
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
    message: data.message || "Email verified successfully.",
  };
}

/**
 * Send / Resend 6-Digit Email Verification Code
 */
export async function sendEmailVerificationCode(
  email: string,
  uid?: string
): Promise<{ success: boolean; expiresAt?: string; previewCode?: string }> {
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
    previewCode: data.previewCode,
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
 * 5. Trigger Stripe Subscription Checkout
 * Calls backend to fetch or create Stripe Customer ID, generate subscription session,
 * and redirects window to Stripe Checkout.
 */
export async function triggerStripeSubscriptionCheckout(params: {
  businessId: string;
  businessName?: string;
  planInterval?: "month" | "year";
  returnUrl?: string;
  user: AuthUserProfile;
}): Promise<void> {
  const { businessId, businessName, planInterval = "year", returnUrl, user } = params;

  // Guard: user must be authenticated & verified
  if (!user.emailVerified && !user.isDemo) {
    throw new Error("You must verify your email address before subscribing.");
  }

  const destinationReturnUrl =
    returnUrl ||
    `${window.location.origin}${window.location.pathname}?subscribed=true&view=dashboard`;

  const response = await fetch("/api/create-subscription-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessId,
      businessName: businessName || "My Business",
      email: user.email,
      userId: user.uid,
      planInterval,
      returnUrl: destinationReturnUrl,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to initialize Stripe checkout");
  }

  if (data.checkoutUrl) {
    // Redirect browser directly to Stripe's secure payment interface
    window.location.href = data.checkoutUrl;
  } else {
    throw new Error("No checkout URL returned by backend.");
  }
}
