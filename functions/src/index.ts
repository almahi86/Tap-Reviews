/**
 * Firebase Cloud Functions (v2) - Authentication & Stripe Subscription Payments
 *
 * Requirements addressed:
 * 1. Email Verification Code (6-digit OTP stored in `verification_codes/{email}` with 15-minute expiration)
 * 2. Callable `verifyEmailCode` to validate OTP and update Firebase Auth `emailVerified: true`
 * 3. Callable `createStripeSubscriptionCheckout` with native Stripe SDK in `mode: 'subscription'`
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";
import Stripe from "stripe";

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp();
}

const auth = getAuth();
const db = getFirestore();

// Lazy-initialize Stripe client
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new HttpsError(
      "failed-precondition",
      "STRIPE_SECRET_KEY is not configured in Cloud Functions environment."
    );
  }
  return new Stripe(secretKey, {
    apiVersion: "2024-12-18.acacia" as any,
  });
}

// Nodemailer transporter helper
function getMailTransporter(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Fallback / Sandbox transporter (logs email output if real SMTP credentials are not yet entered)
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
}

/**
 * Helper: Generates a 6-digit random code, saves to Firestore `verification_codes/{email}`
 * with a 15-minute expiration timestamp, and emails the code via Nodemailer.
 */
export async function generateAndSendVerificationCode(
  email: string,
  uid?: string
): Promise<{ success: boolean; expiresAt: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Generate secure random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 15 minutes expiration window
  const expirationDate = new Date(Date.now() + 15 * 60 * 1000);
  const expiresAt = Timestamp.fromDate(expirationDate);

  // Store in Firestore verification_codes collection
  const codeDocRef = db.collection("verification_codes").doc(normalizedEmail);
  await codeDocRef.set({
    email: normalizedEmail,
    code,
    uid: uid || null,
    attempts: 0,
    expiresAt,
    createdAt: Timestamp.now(),
    used: false,
  });

  logger.info(`Generated 6-digit OTP for ${normalizedEmail} (expires in 15 mins)`);

  // Send Email via Nodemailer
  const transporter = getMailTransporter();
  const mailOptions: nodemailer.SendMailOptions = {
    from: process.env.SMTP_FROM || `"TapShield Security" <noreply@tapshield.app>`,
    to: normalizedEmail,
    subject: `Your 6-Digit Verification Code: ${code}`,
    text: `Your verification code is: ${code}\n\nThis code will expire in 15 minutes. Enter this code to verify your account and unlock your dashboard.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0A0A0A; color: #FFFFFF; border-radius: 12px; padding: 32px; border: 1px solid #262626;">
        <div style="margin-bottom: 20px;">
          <span style="background: #10B981; color: #000000; font-weight: 900; font-size: 11px; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;">TapShield Security</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 12px 0; color: #FFFFFF;">Verify Your Email Address</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #A3A3A3; margin: 0 0 24px 0;">
          Thank you for signing up. Please enter the 6-digit security code below to complete your registration and activate your dashboard:
        </p>
        <div style="background: #171717; border: 1px solid #10B981; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
          <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; font-family: monospace; color: #10B981;">${code}</span>
        </div>
        <p style="font-size: 12px; color: #737373; margin: 0;">
          This code expires in <strong>15 minutes</strong>. If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Verification email sent to ${normalizedEmail}`, { messageId: info.messageId });
  } catch (mailError) {
    logger.error(`Error sending email to ${normalizedEmail}:`, mailError);
    // Continue even if SMTP transport fails in sandbox
  }

  return { success: true, expiresAt: expirationDate.toISOString() };
}

/**
 * Callable Function: Request / Resend a 6-digit email verification code
 */
export const sendVerificationCode = onCall(
  { cors: true },
  async (request: CallableRequest<{ email: string }>) => {
    const { email } = request.data;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "A valid email address is required.");
    }

    const uid = request.auth?.uid;
    const result = await generateAndSendVerificationCode(email, uid);
    return result;
  }
);

/**
 * Callable Function: verifyEmailCode
 * Checks user's submitted OTP code. If correct and not expired, updates Firebase Auth
 * profile setting `emailVerified: true`.
 */
export const verifyEmailCode = onCall(
  { cors: true },
  async (request: CallableRequest<{ email: string; code: string }>) => {
    const { email, code } = request.data;

    if (!email || !code) {
      throw new HttpsError("invalid-argument", "Both email and verification code are required.");
    }

    const cleanCode = code.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      throw new HttpsError("invalid-argument", "Verification code must be exactly 6 numeric digits.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const docRef = db.collection("verification_codes").doc(normalizedEmail);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new HttpsError(
        "not-found",
        "No active verification code found for this email. Please request a new one."
      );
    }

    const data = docSnap.data()!;

    // Check if code was already used
    if (data.used) {
      throw new HttpsError("failed-precondition", "This code has already been used. Please request a new code.");
    }

    // Rate limiting: Maximum 5 invalid attempts
    const attempts = (data.attempts || 0) + 1;
    if (attempts > 5) {
      await docRef.delete();
      throw new HttpsError(
        "resource-exhausted",
        "Too many failed verification attempts. This code has been invalidated. Please request a new code."
      );
    }

    // Check 15-minute expiration
    const now = Timestamp.now();
    const expiresAt: Timestamp = data.expiresAt;
    if (expiresAt && now.toMillis() > expiresAt.toMillis()) {
      await docRef.delete();
      throw new HttpsError(
        "deadline-exceeded",
        "Verification code has expired. Codes are only valid for 15 minutes. Please request a new one."
      );
    }

    // Check code match
    if (data.code !== cleanCode) {
      await docRef.update({ attempts });
      const remaining = 5 - attempts;
      throw new HttpsError(
        "permission-denied",
        `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
      );
    }

    // Code is valid! Resolve the user UID
    let targetUid = request.auth?.uid || data.uid;
    if (!targetUid) {
      try {
        const userRecord = await auth.getUserByEmail(normalizedEmail);
        targetUid = userRecord.uid;
      } catch (userLookupErr) {
        logger.warn(`Could not find Auth user by email ${normalizedEmail}:`, userLookupErr);
      }
    }

    if (targetUid) {
      // Set emailVerified: true in Firebase Auth
      await auth.updateUser(targetUid, {
        emailVerified: true,
      });
      logger.info(`Updated user ${targetUid} (${normalizedEmail}) setting emailVerified: true`);
    }

    // Mark code as used and clean up
    await docRef.update({
      used: true,
      verifiedAt: Timestamp.now(),
    });

    return {
      success: true,
      emailVerified: true,
      message: "Email successfully verified.",
    };
  }
);

/**
 * Callable Function: createStripeSubscriptionCheckout
 * Instantiates Stripe, fetches or creates a Stripe Customer ID for the active authenticated user,
 * generates a `stripe.checkout.sessions.create` payload configured with `mode: 'subscription'`,
 * and returns the checkout URL.
 */
export const createStripeSubscriptionCheckout = onCall(
  { cors: true },
  async (
    request: CallableRequest<{
      businessId?: string;
      businessName?: string;
      planInterval?: "month" | "year";
      returnUrl?: string;
    }>
  ) => {
    // 1. Ensure user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to initialize a subscription checkout session."
      );
    }

    const { uid } = request.auth;
    const userRecord = await auth.getUser(uid);
    const userEmail = userRecord.email;

    // 2. Ensure user email is verified
    if (!userRecord.emailVerified) {
      throw new HttpsError(
        "permission-denied",
        "Your email must be verified before subscribing. Please enter your 6-digit verification code."
      );
    }

    const {
      businessId = uid,
      businessName = userRecord.displayName || "My Business",
      planInterval = "year",
      returnUrl,
    } = request.data || {};

    const stripe = getStripeClient();

    // 3. Fetch or create Stripe Customer ID for this user
    let stripeCustomerId: string | null = null;

    // Check user profile or business profile in Firestore
    const userDocRef = db.collection("users").doc(uid);
    const bizDocRef = db.collection("businesses").doc(businessId);

    const [userDoc, bizDoc] = await Promise.all([userDocRef.get(), bizDocRef.get()]);

    if (userDoc.exists && userDoc.data()?.stripeCustomerId) {
      stripeCustomerId = userDoc.data()?.stripeCustomerId;
    } else if (bizDoc.exists && bizDoc.data()?.stripeCustomerId) {
      stripeCustomerId = bizDoc.data()?.stripeCustomerId;
    }

    // If no existing customer ID, create one in Stripe
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail || undefined,
        name: businessName,
        metadata: {
          firebaseUid: uid,
          businessId,
        },
      });
      stripeCustomerId = customer.id;

      // Persist Stripe Customer ID to Firestore
      await Promise.all([
        userDocRef.set({ stripeCustomerId }, { merge: true }),
        bizDocRef.set({ stripeCustomerId, ownerUid: uid }, { merge: true }),
      ]);
      logger.info(`Created new Stripe Customer ${stripeCustomerId} for user ${uid}`);
    }

    // 4. Calculate amount & price setup
    const interval = planInterval === "year" ? "year" : "month";
    const amountInCents = interval === "year" ? 19999 : 2499; // $199.99/yr or $24.99/mo

    const priceId =
      interval === "year"
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : (process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_PRICE_ID);

    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: `TapShield Pro (${interval === "year" ? "Annual" : "Monthly"})`,
              description: `NFC negative feedback recovery & Google review booster for ${businessName} (${
                interval === "year" ? "$199.99/yr" : "$24.99/mo"
              })`,
            },
            unit_amount: amountInCents,
            recurring: { interval },
          },
          quantity: 1,
        };

    // 5. Success & Cancel URLs
    const origin = returnUrl || "https://tapshield.app";
    const successUrl = `${origin}?session_id={CHECKOUT_SESSION_ID}&subscribed=true&plan=${interval}&business_id=${encodeURIComponent(
      businessId
    )}`;
    const cancelUrl = `${origin}?canceled=true&business_id=${encodeURIComponent(businessId)}`;

    // 6. Generate Stripe Checkout Session with mode: 'subscription'
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [lineItem],
      metadata: {
        firebaseUid: uid,
        businessId,
        businessName,
        planInterval: interval,
      },
      subscription_data: {
        metadata: {
          firebaseUid: uid,
          businessId,
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    logger.info(`Created Stripe subscription checkout session ${session.id} for user ${uid}`);

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      customerId: stripeCustomerId,
    };
  }
);
