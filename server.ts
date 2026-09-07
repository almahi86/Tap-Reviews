import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { Resend } from "resend";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable CORS for all origins and headers so client/preview can seamlessly communicate
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

app.use(express.json());

// Lazy-initialize Resend client
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Lazy-initialize Stripe client
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia" as any,
    });
  }
  return stripeClient;
}

// Nodemailer transport setup
function getMailTransporter(): any {
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

  // Fallback stream / json transporter for preview & sandbox testing
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
}

// In-memory verification codes store (simulating Firestore `verification_codes/{email}`)
interface StoredVerificationCode {
  email: string;
  code: string;
  uid?: string;
  expiresAt: Date;
  createdAt: Date;
  attempts: number;
  used: boolean;
}

const memoryVerificationCodes: Record<string, StoredVerificationCode> = {};
const memoryVerifiedEmails: Record<string, boolean> = {};
const memoryStripeCustomers: Record<string, string> = {}; // email -> stripeCustomerId

// In-memory fallback / mock store for live preview demo mode (when Firebase credentials are not yet entered)
interface StoredBusiness {
  id: string;
  ownerUid: string;
  businessName: string;
  googleMapsReviewUrl: string;
  subscriptionStatus: "active" | "inactive" | "trialing" | "canceled";
  createdAt: string;
  updatedAt: string;
}

interface StoredFeedback {
  id: string;
  businessId: string;
  sentiment?: "positive" | "negative";
  message?: string;
  rating: "like" | "dislike";
  customerNote: string;
  customerContact?: string;
  customerName?: string;
  status: "new" | "reviewed" | "resolved";
  internalNote?: string;
  createdAt: string;
}

const fallbackBusinesses: Record<string, StoredBusiness> = {
  "demo-cafe": {
    id: "demo-cafe",
    ownerUid: "demo_owner_1",
    businessName: "Artisan Brews & Roastery",
    googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    subscriptionStatus: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "rcB3J0qBydaOGKD44gS0JAbpX9m1": {
    id: "rcB3J0qBydaOGKD44gS0JAbpX9m1",
    ownerUid: "rcB3J0qBydaOGKD44gS0JAbpX9m1",
    businessName: "Artisan",
    googleMapsReviewUrl: "",
    subscriptionStatus: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString() + "_paid_verified",
  },
};

// Check Stripe live for active subscriptions matching user email or UID
async function checkStripeSubscriptionForUser(
  userId?: string,
  email?: string
): Promise<{ hasActiveSub: boolean; customerId?: string; subscriptionId?: string; businessName?: string }> {
  const stripe = getStripe();
  if (!stripe) return { hasActiveSub: false };

  try {
    // 1. Check by email if provided
    if (email) {
      const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 10 });
      for (const cust of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: cust.id, status: "active", limit: 5 });
        if (subs.data.length > 0) {
          return {
            hasActiveSub: true,
            customerId: cust.id,
            subscriptionId: subs.data[0].id,
            businessName: cust.name || (cust.metadata?.businessName as string) || undefined,
          };
        }
      }
    }

    // 2. Check recent active subscriptions or checkout sessions matching userId
    if (userId) {
      const recentSessions = await stripe.checkout.sessions.list({ limit: 25 });
      for (const sess of recentSessions.data) {
        if (
          (sess.payment_status === "paid" || sess.status === "complete") &&
          (sess.client_reference_id === userId ||
            sess.metadata?.firebaseUid === userId ||
            sess.metadata?.businessId === userId)
        ) {
          return {
            hasActiveSub: true,
            customerId: typeof sess.customer === "string" ? sess.customer : undefined,
            businessName: sess.metadata?.businessName || undefined,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[Stripe Subscription Check Error]:", err);
  }

  return { hasActiveSub: false };
}

const FEEDBACKS_FILE = path.join(process.cwd(), "data", "feedbacks.json");

function loadStoredFeedbacks(): StoredFeedback[] {
  try {
    if (fs.existsSync(FEEDBACKS_FILE)) {
      const raw = fs.readFileSync(FEEDBACKS_FILE, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (err) {
    console.warn("Could not read feedbacks.json:", err);
  }
  return [
    {
      id: "fb_sample_1",
      businessId: "demo-cafe",
      rating: "dislike",
      customerNote: "The oat milk latte was lukewarm and took 18 minutes to arrive during the morning rush. The barista seemed overwhelmed.",
      customerContact: "alex.m@example.com",
      customerName: "Alex M.",
      status: "new",
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: "fb_sample_2",
      businessId: "demo-cafe",
      rating: "dislike",
      customerNote: "The music by the window counter was so loud I couldn't hear my colleague on a call.",
      customerContact: "+1 (555) 234-5678",
      customerName: "Sarah K. (Table 4)",
      status: "reviewed",
      createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    },
  ];
}

const fallbackFeedbacks: StoredFeedback[] = loadStoredFeedbacks();

function persistStoredFeedbacks(): void {
  try {
    const dir = path.dirname(FEEDBACKS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FEEDBACKS_FILE, JSON.stringify(fallbackFeedbacks, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write feedbacks.json:", err);
  }
}

// Health API
app.get("/api/health", (_req, res) => {
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
  res.json({
    status: "ok",
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    hasStripePublishableKey: Boolean(pubKey),
    publishableKey: pubKey || undefined,
    hasSmtpConfig: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    timestamp: new Date().toISOString(),
  });
});

// 1. Generate and send 6-digit OTP verification code with 15-minute expiration
app.post("/api/auth/send-verification-code", async (req, res) => {
  try {
    const { email, uid } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    // Generate secure random 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute expiration

    memoryVerificationCodes[normalizedEmail] = {
      email: normalizedEmail,
      code,
      uid: uid || undefined,
      expiresAt,
      createdAt: new Date(),
      attempts: 0,
      used: false,
    };

    console.log(`[AUTH] Generated 6-digit OTP for ${normalizedEmail}: ${code} (expires in 15m)`);

    // Send email via Nodemailer
    const transporter = getMailTransporter();
    const mailOptions = {
      from: process.env.SMTP_FROM || `"TapShield Security" <noreply@tapshield.app>`,
      to: normalizedEmail,
      subject: `Your 6-Digit Verification Code: ${code}`,
      text: `Your TapShield verification code is: ${code}\n\nThis code expires in 15 minutes. Enter this code to verify your account.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; padding: 28px; background: #0A0A0A; color: #FFF; border-radius: 10px; border: 1px solid #262626;">
          <h2 style="color: #10B981; margin: 0 0 12px 0;">Verify Your Email Address</h2>
          <p style="color: #A3A3A3; font-size: 14px; margin: 0 0 20px 0;">Enter this 6-digit code to complete your registration and unlock your dashboard:</p>
          <div style="background: #171717; border: 1px solid #10B981; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; font-family: monospace; color: #10B981;">${code}</span>
          </div>
          <p style="color: #737373; font-size: 12px; margin: 0;">This code expires in <strong>15 minutes</strong>.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (mailErr) {
      console.warn("Mail transport error (safe in sandbox):", mailErr);
    }

    res.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      message: `Verification code sent to ${normalizedEmail}`,
      // In sandbox/dev without production SMTP, expose previewCode so developers can test immediately
      previewCode: (!process.env.SMTP_USER || process.env.NODE_ENV !== "production") ? code : undefined,
    });
  } catch (err: any) {
    console.error("Error sending verification code:", err);
    res.status(500).json({ error: err?.message || "Failed to generate verification code" });
  }
});

// 2. Verify submitted 6-digit OTP code & set emailVerified: true
app.post("/api/auth/verify-email-code", async (req, res) => {
  try {
    const { email, code, uid } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Both email and verification code are required" });
    }

    const cleanCode = String(code).trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: "Verification code must be exactly 6 numeric digits" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = memoryVerificationCodes[normalizedEmail];

    if (!record) {
      return res.status(404).json({
        error: "No active verification code found for this email. Please request a new code.",
      });
    }

    if (record.used) {
      return res.status(400).json({
        error: "This code has already been used. Please request a new code.",
      });
    }

    // Rate limiting: Maximum 5 attempts
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 5) {
      delete memoryVerificationCodes[normalizedEmail];
      return res.status(429).json({
        error: "Too many failed attempts. Code has been invalidated. Please request a new code.",
      });
    }

    // Check expiration (15 minutes)
    const now = new Date();
    if (now.getTime() > new Date(record.expiresAt).getTime()) {
      delete memoryVerificationCodes[normalizedEmail];
      return res.status(400).json({
        error: "Verification code has expired. Codes are only valid for 15 minutes. Please request a new code.",
      });
    }

    // Check code match
    if (record.code !== cleanCode) {
      const remaining = 5 - record.attempts;
      return res.status(400).json({
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      });
    }

    // Code matched! Mark used & verified
    record.used = true;
    memoryVerifiedEmails[normalizedEmail] = true;
    if (uid) {
      memoryVerifiedEmails[uid] = true;
    }

    console.log(`[AUTH] Successfully verified email ${normalizedEmail} (uid: ${uid || "none"})`);

    res.json({
      success: true,
      emailVerified: true,
      message: "Email successfully verified.",
    });
  } catch (err: any) {
    console.error("Error verifying email code:", err);
    res.status(500).json({ error: err?.message || "Failed to verify code" });
  }
});

// Check verification status
app.get("/api/auth/verification-status", (req, res) => {
  const email = (req.query.email as string)?.trim().toLowerCase();
  const uid = req.query.uid as string;

  const isVerified = Boolean(
    (email && memoryVerifiedEmails[email]) ||
    (uid && memoryVerifiedEmails[uid])
  );

  res.json({ emailVerified: isVerified });
});

// Register Google session and guarantee verified status in server store
app.post("/api/auth/google-session", (req, res) => {
  const { email, displayName, uid } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const normalizedEmail = email.trim().toLowerCase();
  memoryVerifiedEmails[normalizedEmail] = true;
  if (uid) {
    memoryVerifiedEmails[uid] = true;
  }
  console.log(`[AUTH] Google session registered for ${normalizedEmail} (uid: ${uid || "none"})`);
  res.json({ success: true, emailVerified: true });
});

// 3. Create Stripe Subscription Checkout (Supports Embedded Checkout with ui_mode: 'embedded')
app.post(["/api/create-subscription-checkout", "/api/create-checkout-session"], async (req, res) => {
  try {
    const { businessId, businessName, email, returnUrl, planInterval, userId } = req.body;
    console.log("[Stripe Checkout API] Request received:", {
      businessId,
      businessName,
      email,
      returnUrl,
      planInterval,
      userId,
      hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    });

    const stripe = getStripe();
    const interval = planInterval === "year" ? "year" : "month";
    const amount = interval === "year" ? 19999 : 2499; // $199.99/yr or $24.99/mo

    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const defaultReturnUrl = `${origin}/return?session_id={CHECKOUT_SESSION_ID}&business_id=${encodeURIComponent(
      businessId || ""
    )}`;
    const effectiveReturnUrl = returnUrl ? returnUrl : defaultReturnUrl;

    // Cache or initialize business record with the provided businessName
    if (businessId && businessName) {
      if (fallbackBusinesses[businessId]) {
        fallbackBusinesses[businessId].businessName = businessName;
      } else {
        fallbackBusinesses[businessId] = {
          id: businessId,
          ownerUid: userId || `owner_${businessId}`,
          businessName: businessName,
          googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
          subscriptionStatus: "inactive",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    }

    if (!stripe) {
      // Mock / Preview Mode when Stripe Secret is not configured in .env
      const mockSessionId = `test_sess_${Date.now()}`;
      const previewUrl = `/return?session_id=${mockSessionId}&subscribed=true&plan=${interval}&business_id=${encodeURIComponent(
        businessId || "demo-cafe"
      )}`;
      console.log("[Stripe Checkout API] No Stripe secret configured, serving sandbox checkout:", previewUrl);
      return res.json({
        mode: "demo",
        message: "Stripe API Key not configured in .env. Falling back to sandbox checkout.",
        sessionId: mockSessionId,
        clientSecret: `${mockSessionId}_secret_demo`,
        client_secret: `${mockSessionId}_secret_demo`,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
        url: previewUrl,
        checkoutUrl: previewUrl,
      });
    }

    // Fetch or create Stripe Customer ID for this user
    let customerId = email ? memoryStripeCustomers[email.toLowerCase()] : undefined;
    if (!customerId && email) {
      try {
        console.log("[Stripe Checkout API] Creating Stripe customer for:", email);
        const customer = await stripe.customers.create({
          email,
          name: businessName || undefined,
          metadata: {
            firebaseUid: userId || businessId || "",
            businessId: businessId || "",
          },
        });
        customerId = customer.id;
        memoryStripeCustomers[email.toLowerCase()] = customerId;
      } catch (custErr: any) {
        console.warn("[Stripe Checkout API] Non-fatal customer creation error:", custErr?.message);
      }
    }

    const priceId =
      interval === "year"
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : (process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_PRICE_ID);

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: `TapShield Pro (${interval === "year" ? "Annual" : "Monthly"})`,
              description: `NFC negative feedback recovery & Google review booster for ${businessName || "Your Business"} (${interval === "year" ? "$199.99/year" : "$24.99/month"})`,
              tax_code: "txcd_10000000",
            },
            unit_amount: amount,
            recurring: { interval: interval as "month" | "year" },
          },
          quantity: 1,
        };

    console.log("[Stripe Checkout API] Creating embedded checkout session with interval:", interval, "amount:", amount);
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : (email || undefined),
      client_reference_id: businessId,
      line_items: [lineItem],
      managed_payments: { enabled: false },
      metadata: {
        firebaseUid: userId || "",
        businessId: businessId || "",
        businessName: businessName || "",
        planInterval: interval,
      },
      subscription_data: {
        metadata: {
          firebaseUid: userId || "",
          businessId: businessId || "",
        },
      },
      return_url: effectiveReturnUrl,
    });

    console.log("[Stripe Checkout API] Embedded checkout session created successfully:", session.id);
    return res.json({
      mode: "live_stripe",
      sessionId: session.id,
      clientSecret: session.client_secret,
      client_secret: session.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
      customerId: customerId || session.customer,
      url: session.url,
      checkoutUrl: session.url,
    });
  } catch (error: any) {
    console.error("[Stripe Checkout API Error]:", error);
    return res.status(500).json({
      error: error?.message || "Failed to create checkout session",
      code: error?.code,
      type: error?.type,
    });
  }
});

// Verify Checkout Session or retrieve session status
app.get("/api/session-status", async (req, res) => {
  try {
    const sessionId = (req.query.session_id as string) || (req.query.sessionId as string);
    if (!sessionId) {
      return res.status(400).json({ error: "session_id query parameter is required" });
    }

    if (sessionId.startsWith("test_sess_")) {
      return res.json({
        status: "complete",
        payment_status: "paid",
        customer_email: "demo@example.com",
        mode: "demo",
      });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.json({
        status: "complete",
        payment_status: "paid",
        customer_email: "preview@example.com",
        mode: "demo_fallback",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return res.json({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
    });
  } catch (err: any) {
    console.error("Error retrieving session status:", err);
    return res.status(500).json({ error: err?.message || "Failed to retrieve session status" });
  }
});

// Verify Checkout Session
app.post("/api/verify-checkout-session", async (req, res) => {
  try {
    const { sessionId, businessId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID required" });
    }

    if (sessionId.startsWith("test_sess_")) {
      if (businessId && fallbackBusinesses[businessId]) {
        fallbackBusinesses[businessId].subscriptionStatus = "active";
        fallbackBusinesses[businessId].updatedAt = new Date().toISOString() + "_paid_verified";
      }
      return res.json({
        verified: true,
        status: "active",
        mode: "demo",
      });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.json({ verified: true, status: "active", mode: "demo_fallback" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const isPaid = session.payment_status === "paid" || session.status === "complete";

    if (isPaid && businessId && fallbackBusinesses[businessId]) {
      fallbackBusinesses[businessId].subscriptionStatus = "active";
      fallbackBusinesses[businessId].updatedAt = new Date().toISOString() + "_paid_verified";
    }

    res.json({
      verified: isPaid,
      status: isPaid ? "active" : "inactive",
      customer: session.customer,
      subscription: session.subscription,
    });
  } catch (error: any) {
    console.error("Error verifying checkout session:", error);
    res.status(500).json({ error: error?.message || "Failed to verify session" });
  }
});

// Business Profile API (Used by Public NFC Rate screen & Dashboard fallback)
app.get("/api/businesses/:businessId", async (req, res) => {
  const { businessId } = req.params;
  const email = (req.query.email as string)?.trim();
  const userId = (req.query.userId as string)?.trim();
  const isDemo = businessId === "demo-cafe";

  let business = fallbackBusinesses[businessId];

  // If not demo and not currently verified active, check Stripe live
  if (!isDemo && (!business || business.subscriptionStatus !== "active")) {
    const stripeCheck = await checkStripeSubscriptionForUser(userId || businessId, email);
    if (stripeCheck.hasActiveSub) {
      business = {
        id: businessId,
        ownerUid: userId || `owner_${businessId}`,
        businessName: stripeCheck.businessName || business?.businessName || "Artisan",
        googleMapsReviewUrl: business?.googleMapsReviewUrl || "",
        subscriptionStatus: "active",
        createdAt: business?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString() + "_paid_verified",
      };
      fallbackBusinesses[businessId] = business;
      return res.json(business);
    }
  }

  if (!business) {
    // Generate a starter business record: demo-cafe is active, real user stores are inactive until paid
    const newBiz: StoredBusiness = {
      id: businessId,
      ownerUid: `owner_${businessId}`,
      businessName: isDemo ? "Artisan Brews & Roastery" : "My Store",
      googleMapsReviewUrl: isDemo ? "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4" : "",
      subscriptionStatus: isDemo ? "active" : "inactive",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fallbackBusinesses[businessId] = newBiz;
    return res.json(newBiz);
  }

  // Ensure unverified user accounts remain inactive unless Stripe has active subscription
  if (!isDemo && business.subscriptionStatus === "active" && !business.updatedAt?.includes("paid_verified")) {
    const stripeCheck = await checkStripeSubscriptionForUser(userId || businessId, email);
    if (!stripeCheck.hasActiveSub) {
      business.subscriptionStatus = "inactive";
    } else {
      business.updatedAt = new Date().toISOString() + "_paid_verified";
    }
  }

  res.json(business);
});

// Real-time subscription check across Stripe & memory
app.get("/api/subscription-status", async (req, res) => {
  const email = (req.query.email as string)?.trim();
  const userId = (req.query.userId as string)?.trim();
  const businessId = (req.query.businessId as string)?.trim();

  // Demo account is always active for previewing
  if (businessId === "demo-cafe") {
    return res.json({ isPro: true, status: "active" });
  }

  // Check live Stripe subscriptions
  const stripeCheck = await checkStripeSubscriptionForUser(userId || businessId, email);
  if (stripeCheck.hasActiveSub) {
    const targetId = businessId || userId;
    if (targetId) {
      if (!fallbackBusinesses[targetId]) {
        fallbackBusinesses[targetId] = {
          id: targetId,
          ownerUid: userId || `owner_${targetId}`,
          businessName: stripeCheck.businessName || "Artisan",
          googleMapsReviewUrl: "",
          subscriptionStatus: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString() + "_paid_verified",
        };
      } else {
        fallbackBusinesses[targetId].subscriptionStatus = "active";
        fallbackBusinesses[targetId].updatedAt = new Date().toISOString() + "_paid_verified";
        if (stripeCheck.businessName) fallbackBusinesses[targetId].businessName = stripeCheck.businessName;
      }
    }
    return res.json({ isPro: true, status: "active", customerId: stripeCheck.customerId });
  }

  if (businessId && fallbackBusinesses[businessId]?.subscriptionStatus === "active") {
    return res.json({ isPro: true, status: "active" });
  }

  return res.json({ isPro: false, status: "inactive" });
});

app.post("/api/businesses/:businessId", (req, res) => {
  const { businessId } = req.params;
  const { businessName, googleMapsReviewUrl, subscriptionStatus, ownerUid } = req.body;

  const current = fallbackBusinesses[businessId] || {
    id: businessId,
    ownerUid: ownerUid || "default_owner",
    businessName: "My Store",
    googleMapsReviewUrl: "",
    subscriptionStatus: "inactive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (businessName !== undefined) current.businessName = businessName;
  if (googleMapsReviewUrl !== undefined) current.googleMapsReviewUrl = googleMapsReviewUrl;
  if (subscriptionStatus !== undefined) current.subscriptionStatus = subscriptionStatus;
  current.updatedAt = new Date().toISOString();

  fallbackBusinesses[businessId] = current;
  res.json(current);
});

// Negative Feedback API (Public Customer Submit & Dashboard Inbox fallback)
app.get("/api/businesses/:businessId/feedbacks", (req, res) => {
  const { businessId } = req.params;
  const list = fallbackFeedbacks.filter((f) => f.businessId === businessId);
  res.json(list);
});

app.post("/api/businesses/:businessId/feedbacks", (req, res) => {
  const { businessId } = req.params;
  const { id, customerNote, customerContact, customerName, rating, sentiment, message, createdAt, status } = req.body;

  const resolvedSentiment: "positive" | "negative" =
    sentiment === "positive" || rating === "like" ? "positive" : "negative";
  const resolvedRating: "like" | "dislike" = resolvedSentiment === "positive" ? "like" : "dislike";
  const resolvedNote: string =
    (message || customerNote || (resolvedSentiment === "positive" ? "Customer tapped Thumbs Up" : "")).trim().slice(0, 2000);

  const targetId = id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newFeedback: StoredFeedback = {
    id: targetId,
    businessId,
    sentiment: resolvedSentiment,
    message: resolvedNote,
    rating: resolvedRating,
    customerNote: resolvedNote,
    customerContact: customerContact?.slice(0, 150) || undefined,
    customerName: customerName?.slice(0, 100) || undefined,
    status: status || (resolvedSentiment === "positive" ? "reviewed" : "new"),
    createdAt: createdAt || new Date().toISOString(),
  };

  const existingIdx = fallbackFeedbacks.findIndex((f) => f.id === targetId);
  if (existingIdx >= 0) {
    fallbackFeedbacks[existingIdx] = newFeedback;
  } else {
    fallbackFeedbacks.unshift(newFeedback);
  }
  persistStoredFeedbacks();
  res.status(201).json(newFeedback);
});

app.patch("/api/businesses/:businessId/feedbacks/:feedbackId", (req, res) => {
  const { feedbackId } = req.params;
  const { status, internalNote } = req.body;
  const item = fallbackFeedbacks.find((f) => f.id === feedbackId);
  if (!item) {
    return res.status(404).json({ error: "Feedback not found" });
  }
  if (status) item.status = status;
  if (internalNote !== undefined) item.internalNote = internalNote;
  persistStoredFeedbacks();
  res.json(item);
});

// In-memory store of recent contact inquiries for audit/preview
interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  autoReplySent: boolean;
  adminNotified: boolean;
}
const memoryContactInquiries: ContactInquiry[] = [];

// Contact Us API: Resend email integration with customer auto-reply & admin notification
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // 1. Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Your name is required." });
    }
    if (!email || typeof email !== "string" || !email.includes("@") || !email.includes(".")) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
    if (!message || typeof message !== "string" || message.trim().length < 5) {
      return res.status(400).json({ error: "Please enter a message with at least 5 characters." });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMessage = message.trim();
    const adminEmail = process.env.ADMIN_EMAIL || "ossovi32@gmail.com";
    const fromAddress = process.env.RESEND_FROM_EMAIL || "TapShield <noreply@tapshield.app>";

    const autoReplyText =
      "Thank you for reaching out. Our team has received your message and will contact you within 24 hours.";

    const inquiryRecord: ContactInquiry = {
      id: `inq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      email: cleanEmail,
      message: cleanMessage,
      createdAt: new Date().toISOString(),
      autoReplySent: false,
      adminNotified: false,
    };

    console.log(`[CONTACT] New inquiry received from ${cleanName} (${cleanEmail})`);

    const resend = getResend();
    let emailServiceUsed = "resend";

    // Official TapShield Logo PNG for email avatar / profile picture
    const logoFilePath = path.join(process.cwd(), "public", "tapshield-logo.png");
    let logoBuffer: Buffer | null = null;
    try {
      if (fs.existsSync(logoFilePath)) {
        logoBuffer = fs.readFileSync(logoFilePath);
      }
    } catch (e) {
      console.warn("[CONTACT] Could not read tapshield-logo.png for email:", e);
    }

    const resendAttachments = logoBuffer
      ? [
          {
            filename: "tapshield-logo.png",
            content: logoBuffer,
            contentType: "image/png",
            contentId: "tapshield-logo",
          },
        ]
      : undefined;

    const nodemailerAttachments =
      logoFilePath && fs.existsSync(logoFilePath)
        ? [
            {
              filename: "tapshield-logo.png",
              path: logoFilePath,
              cid: "tapshield-logo",
            },
          ]
        : undefined;

    // 100% email-client compatible HTML with bulletproof <table> headers and embedded profile logo
    const autoReplyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A0A; color: #FFFFFF; border-radius: 12px; border: 1px solid #262626; padding: 32px; box-sizing: border-box;">
        <!-- Email Header Table: Profile Logo + Brand Details -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-bottom: 1px solid #262626; padding-bottom: 20px; margin-bottom: 24px; border-collapse: collapse;">
          <tr>
            <td valign="middle" style="width: 48px; vertical-align: middle; padding-right: 14px; text-align: left;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0; padding: 0; border-collapse: collapse;">
                <tr>
                  <td align="center" valign="middle" style="width: 44px; height: 44px; padding: 0; border-radius: 11px; overflow: hidden; background-color: #10B981; text-align: center; vertical-align: middle;">
                    <img src="cid:tapshield-logo" width="44" height="44" alt="TapShield" style="display: block; width: 44px; height: 44px; border-radius: 11px; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle" align="left" style="vertical-align: middle; text-align: left;">
              <h1 style="color: #FFFFFF; font-size: 19px; line-height: 24px; margin: 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                Tap<span style="color: #10B981;">Shield</span> Support
              </h1>
              <p style="color: #737373; font-size: 12px; line-height: 16px; margin: 2px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                NFC Customer Feedback &amp; Google Review Routing
              </p>
            </td>
          </tr>
        </table>

        <p style="color: #E5E5E5; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
          Hi <strong>${cleanName}</strong>,
        </p>

        <div style="background: #141414; border-left: 4px solid #10B981; padding: 18px 20px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
          <p style="color: #10B981; font-weight: 700; font-size: 15px; margin: 0; line-height: 1.5;">
            Thank you for reaching out. Our team has received your message and will contact you within 24 hours.
          </p>
        </div>

        <div style="background: #171717; border: 1px solid #262626; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h3 style="color: #A3A3A3; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin: 0 0 8px 0;">Summary of Your Message:</h3>
          <p style="color: #D4D4D4; font-size: 13px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${cleanMessage}</p>
        </div>

        <div style="border-top: 1px solid #262626; padding-top: 20px; font-size: 11px; color: #737373; line-height: 1.5;">
          <p style="margin: 0 0 8px 0;">
            <strong>Please note:</strong> A refund is not possible once a purchase is processed.
          </p>
          <p style="margin: 0;">
            © ${new Date().getFullYear()} TapShield • Customer Reputation Management
          </p>
        </div>
      </div>
    `;

    const adminNotificationHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A0A; color: #FFFFFF; border-radius: 12px; border: 1px solid #262626; padding: 32px; box-sizing: border-box;">
        <!-- Admin Email Header Table -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-bottom: 1px solid #262626; padding-bottom: 18px; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td valign="middle" style="width: 48px; vertical-align: middle; padding-right: 14px; text-align: left;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0; padding: 0; border-collapse: collapse;">
                <tr>
                  <td align="center" valign="middle" style="width: 44px; height: 44px; padding: 0; border-radius: 11px; overflow: hidden; background-color: #10B981; text-align: center; vertical-align: middle;">
                    <img src="cid:tapshield-logo" width="44" height="44" alt="TapShield" style="display: block; width: 44px; height: 44px; border-radius: 11px; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle" align="left" style="vertical-align: middle; text-align: left;">
              <span style="background: #10B981; color: #000000; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 4px;">New Inquiry</span>
              <h2 style="color: #FFFFFF; font-size: 18px; line-height: 22px; margin: 0 0 2px 0; font-weight: 800; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                Contact Form Submission
              </h2>
              <p style="color: #737373; font-size: 12px; margin: 0; font-family: monospace;">Received: ${new Date().toLocaleString()}</p>
            </td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #262626; color: #737373; font-size: 12px; text-transform: uppercase; width: 90px; font-weight: 700;">Name:</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #262626; color: #FFFFFF; font-size: 14px; font-weight: 600;">${cleanName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #262626; color: #737373; font-size: 12px; text-transform: uppercase; font-weight: 700;">Email:</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #262626; color: #10B981; font-size: 14px; font-family: monospace;">
              <a href="mailto:${cleanEmail}" style="color: #10B981; text-decoration: none;">${cleanEmail}</a>
            </td>
          </tr>
        </table>

        <div style="background: #171717; border: 1px solid #262626; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
          <h3 style="color: #A3A3A3; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin: 0 0 10px 0;">Customer Message:</h3>
          <p style="color: #EDEDED; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${cleanMessage}</p>
        </div>

        <div style="border-top: 1px solid #262626; padding-top: 16px; font-size: 11px; color: #737373;">
          <p style="margin: 0;">Reply directly to this customer by emailing <a href="mailto:${cleanEmail}" style="color: #10B981;">${cleanEmail}</a>.</p>
        </div>
      </div>
    `;

    if (resend) {
      // 2. Resend Email Integration
      // In Resend, if the domain is not verified yet, sending from onboarding@resend.dev to the account email works for testing
      const effectiveFrom = process.env.RESEND_FROM_EMAIL || "TapShield <onboarding@resend.dev>";

      // Simultaneously dispatch customer auto-reply & admin notification
      const [autoReplyResult, adminResult] = await Promise.allSettled([
        resend.emails.send({
          from: effectiveFrom,
          to: cleanEmail,
          subject: "Thank you for reaching out - TapShield Support",
          text: autoReplyText,
          html: autoReplyHtml,
          attachments: resendAttachments,
        }),
        resend.emails.send({
          from: effectiveFrom,
          to: adminEmail,
          subject: `[Contact Form] New message from ${cleanName}`,
          text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\nMessage:\n${cleanMessage}`,
          html: adminNotificationHtml,
          attachments: resendAttachments,
        }),
      ]);

      inquiryRecord.autoReplySent = autoReplyResult.status === "fulfilled";
      inquiryRecord.adminNotified = adminResult.status === "fulfilled";

      if (autoReplyResult.status === "rejected") {
        console.warn("[CONTACT] Resend auto-reply to customer warning:", autoReplyResult.reason);
      } else {
        console.log("[CONTACT] Resend auto-reply successfully sent to customer:", cleanEmail);
      }

      if (adminResult.status === "rejected") {
        console.warn("[CONTACT] Resend admin notification warning:", adminResult.reason);
      } else {
        console.log("[CONTACT] Resend admin notification successfully sent to admin:", adminEmail);
      }
    } else {
      // 3. Graceful Fallback (Nodemailer / Development Preview Mode)
      emailServiceUsed = "nodemailer_or_preview";
      const transporter = getMailTransporter();

      const [autoReplyResult, adminResult] = await Promise.allSettled([
        transporter.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: "Thank you for reaching out - TapShield Support",
          text: autoReplyText,
          html: autoReplyHtml,
          attachments: nodemailerAttachments,
        }),
        transporter.sendMail({
          from: fromAddress,
          to: adminEmail,
          subject: `[Contact Form] New message from ${cleanName}`,
          text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\nMessage:\n${cleanMessage}`,
          html: adminNotificationHtml,
          attachments: nodemailerAttachments,
        }),
      ]);

      inquiryRecord.autoReplySent = autoReplyResult.status === "fulfilled";
      inquiryRecord.adminNotified = adminResult.status === "fulfilled";

      console.log(`[CONTACT] Auto-reply recorded for ${cleanEmail} (Service: ${emailServiceUsed})`);
      console.log(`[CONTACT] Admin notification recorded for ${adminEmail} (Service: ${emailServiceUsed})`);
    }

    memoryContactInquiries.unshift(inquiryRecord);

    return res.status(200).json({
      success: true,
      message: autoReplyText,
      data: {
        id: inquiryRecord.id,
        name: cleanName,
        email: cleanEmail,
        createdAt: inquiryRecord.createdAt,
        service: emailServiceUsed,
      },
    });
  } catch (error: any) {
    console.error("[CONTACT API ERROR]:", error);
    return res.status(500).json({
      error: error?.message || "Failed to process contact inquiry. Please try again later.",
    });
  }
});

// Admin endpoint to view recent inquiries
app.get("/api/contact/inquiries", (_req, res) => {
  res.json({
    total: memoryContactInquiries.length,
    inquiries: memoryContactInquiries,
  });
});

async function startServer() {
  // Explicitly serve public assets (logos, icons, manifests) directly
  app.use(express.static(path.join(process.cwd(), "public")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
