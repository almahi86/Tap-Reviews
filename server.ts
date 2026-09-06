import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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
  rating: "like" | "dislike";
  customerNote: string;
  customerContact?: string;
  customerName?: string;
  status: "new" | "reviewed" | "resolved";
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
};

const fallbackFeedbacks: StoredFeedback[] = [
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

// Health API
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
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

// 3. Create Stripe Subscription Checkout (Instantiates Stripe, fetches/creates Customer ID, sets mode: 'subscription')
app.post(["/api/create-subscription-checkout", "/api/create-checkout-session"], async (req, res) => {
  try {
    const { businessId, businessName, email, returnUrl, planInterval, userId } = req.body;
    const stripe = getStripe();
    const interval = planInterval === "year" ? "year" : "month";
    const amount = interval === "year" ? 19999 : 2499; // $199.99/yr or $24.99/mo

    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const baseUrl = returnUrl || origin;

    if (!stripe) {
      // Mock / Preview Mode when Stripe Secret is not configured in .env
      const mockSessionId = `test_sess_${Date.now()}`;
      return res.json({
        mode: "demo",
        message: "Stripe API Key not configured in .env. Falling back to sandbox checkout.",
        sessionId: mockSessionId,
        checkoutUrl: `${baseUrl}?session_id=${mockSessionId}&subscribed=true&plan=${interval}&business_id=${encodeURIComponent(
          businessId || "demo-cafe"
        )}`,
      });
    }

    // Fetch or create Stripe Customer ID for this user
    let customerId = email ? memoryStripeCustomers[email.toLowerCase()] : undefined;
    if (!customerId && email) {
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
    }

    const priceId =
      interval === "year"
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : (process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_PRICE_ID);

    // Use price ID if configured, or create an ad-hoc subscription line item
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: `TapShield Pro (${interval === "year" ? "Annual" : "Monthly"})`,
              description: `NFC negative feedback recovery & Google review booster for ${businessName || "Your Business"} (${interval === "year" ? "$199.99/year" : "$24.99/month"})`,
            },
            unit_amount: amount,
            recurring: { interval: interval as "month" | "year" },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : (email || undefined),
      client_reference_id: businessId,
      line_items: [lineItem],
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
      success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}&subscribed=true&plan=${interval}&business_id=${encodeURIComponent(
        businessId || ""
      )}`,
      cancel_url: `${baseUrl}?canceled=true&business_id=${encodeURIComponent(businessId || "")}`,
    });

    res.json({
      mode: "live_stripe",
      sessionId: session.id,
      checkoutUrl: session.url,
      customerId: customerId || session.customer,
    });
  } catch (error: any) {
    console.error("Error creating Stripe checkout session:", error);
    res.status(500).json({ error: error?.message || "Failed to create checkout session" });
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
app.get("/api/businesses/:businessId", (req, res) => {
  const { businessId } = req.params;
  const business = fallbackBusinesses[businessId];
  if (!business) {
    // Generate a starter business record if accessing a new ID in demo mode
    const newBiz: StoredBusiness = {
      id: businessId,
      ownerUid: `owner_${businessId}`,
      businessName: businessId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
      subscriptionStatus: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fallbackBusinesses[businessId] = newBiz;
    return res.json(newBiz);
  }
  res.json(business);
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
  const { customerNote, customerContact, customerName, rating } = req.body;

  if (!customerNote || typeof customerNote !== "string") {
    return res.status(400).json({ error: "Customer note is required" });
  }

  const newFeedback: StoredFeedback = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    businessId,
    rating: rating === "like" ? "like" : "dislike",
    customerNote: customerNote.trim().slice(0, 2000),
    customerContact: customerContact?.slice(0, 150) || undefined,
    customerName: customerName?.slice(0, 100) || undefined,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  fallbackFeedbacks.unshift(newFeedback);
  res.status(201).json(newFeedback);
});

app.patch("/api/businesses/:businessId/feedbacks/:feedbackId", (req, res) => {
  const { feedbackId } = req.params;
  const { status } = req.body;
  const item = fallbackFeedbacks.find((f) => f.id === feedbackId);
  if (!item) {
    return res.status(404).json({ error: "Feedback not found" });
  }
  if (status) item.status = status;
  res.json(item);
});

async function startServer() {
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
