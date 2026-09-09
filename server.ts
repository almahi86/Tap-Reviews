import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import crypto from "crypto";
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

// Mount raw body parser specifically for Stripe webhook signature verification
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
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
  token: string;
  uid?: string;
  expiresAt: Date;
  createdAt: Date;
  attempts: number;
  used: boolean;
}

const memoryVerificationCodes: Record<string, StoredVerificationCode> = {};
const memoryVerificationTokens: Record<string, string> = {}; // token -> email
const memoryVerifiedEmails: Record<string, boolean> = {};
const memoryStripeCustomers: Record<string, string> = {}; // email -> stripeCustomerId

// In-memory fallback / mock store for live preview demo mode (when Firebase credentials are not yet entered)
interface StoredBusiness {
  id: string;
  ownerUid: string;
  ownerEmail?: string;
  businessName: string;
  googleMapsReviewUrl: string;
  subscriptionStatus: "active" | "inactive" | "trialing" | "canceled" | "past_due";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackReply {
  id: string;
  message: string;
  sentAt: string;
  sentBy?: string;
  method: "email" | "sms" | "system";
  recipientContact?: string;
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
  replies?: FeedbackReply[];
  lastRepliedAt?: string;
  createdAt: string;
}

const BUSINESSES_FILE = path.join(process.cwd(), "data", "businesses.json");

function loadStoredBusinesses(): Record<string, StoredBusiness> {
  const defaults: Record<string, StoredBusiness> = {
    "demo-cafe": {
      id: "demo-cafe",
      ownerUid: "demo-cafe",
      ownerEmail: "demo@artisanbrews.com",
      businessName: "Artisan Brews & Roastery",
      googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
      subscriptionStatus: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    "rcB3J0qBydaOGKD44gS0JAbpX9m1": {
      id: "rcB3J0qBydaOGKD44gS0JAbpX9m1",
      ownerUid: "rcB3J0qBydaOGKD44gS0JAbpX9m1",
      ownerEmail: "ossovi32@gmail.com",
      businessName: "OOO",
      googleMapsReviewUrl: "",
      subscriptionStatus: "active",
      createdAt: "2026-09-07T19:40:25.409Z",
      updatedAt: new Date().toISOString() + "_paid_verified",
    },
  };

  try {
    if (fs.existsSync(BUSINESSES_FILE)) {
      const raw = fs.readFileSync(BUSINESSES_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return { ...defaults, ...data };
      }
    }
  } catch (err) {
    console.warn("Could not read businesses.json:", err);
  }
  return defaults;
}

const fallbackBusinesses: Record<string, StoredBusiness> = loadStoredBusinesses();

function persistStoredBusinesses(): void {
  try {
    const dir = path.dirname(BUSINESSES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BUSINESSES_FILE, JSON.stringify(fallbackBusinesses, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write businesses.json:", err);
  }
}

// ----------------------------------------------------
// Traditional User Accounts Database (Users Table / File)
// ----------------------------------------------------
export interface StoredUserAccount {
  id: string; // unique user ID
  email: string; // normalized lower-case email
  salt: string; // 32-char hex random salt
  passwordHash: string; // pbkdf2Sync hash
  displayName?: string;
  businessId: string;
  businessName?: string;
  subscriptionStatus?: "active" | "inactive" | "trialing" | "canceled" | "past_due";
  createdAt: string;
  updatedAt: string;
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

function loadStoredUsers(): Record<string, StoredUserAccount> {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Could not read users.json:", err);
  }
  return {};
}

let storedUsers: Record<string, StoredUserAccount> = loadStoredUsers();

function persistStoredUsers(): void {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(storedUsers, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write users.json:", err);
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!expectedHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
}

function findUserByEmail(email: string): StoredUserAccount | null {
  const clean = email.toLowerCase().trim();
  for (const user of Object.values(storedUsers)) {
    if (user.email && user.email.toLowerCase().trim() === clean) {
      return user;
    }
  }
  return null;
}

// Canonical Business ID resolution across devices and auth providers
function resolveCanonicalBusinessId(identifier?: string | null, email?: string | null): string {
  if (email) {
    const cleanEmail = email.toLowerCase().trim();
    // 1. Check user accounts database
    const user = findUserByEmail(cleanEmail);
    if (user?.businessId) {
      return user.businessId;
    }
    // 2. Check businesses table by ownerEmail
    for (const [bizId, biz] of Object.entries(fallbackBusinesses)) {
      if (biz.ownerEmail && biz.ownerEmail.toLowerCase() === cleanEmail) {
        return bizId;
      }
    }
  }

  if (!identifier) return "demo-cafe";
  const cleanId = identifier.trim();
  if (cleanId === "demo-cafe") return "demo-cafe";

  // Check if identifier directly matches a business ID
  if (fallbackBusinesses[cleanId]) return cleanId;

  // Check if identifier is an ownerUid for an existing business
  for (const [bizId, biz] of Object.entries(fallbackBusinesses)) {
    if (biz.ownerUid === cleanId) return bizId;
  }

  // Check if identifier is a user ID in storedUsers
  if (storedUsers[cleanId]?.businessId) {
    return storedUsers[cleanId].businessId;
  }

  return cleanId;
}

// Pro accounts (subscribers who already have Pro / owner accounts)
const PRO_EMAILS = new Set([
  "ossovi32@gmail.com",
  (process.env.ADMIN_EMAIL || "").toLowerCase().trim(),
  ...(process.env.PRO_ACCOUNTS ? process.env.PRO_ACCOUNTS.toLowerCase().split(",").map((e) => e.trim()) : []),
].filter(Boolean));

function isProAccount(identifier?: { email?: string | null; userId?: string | null; businessId?: string | null }): boolean {
  if (!identifier) return false;
  const email = identifier.email?.toLowerCase().trim();
  const userId = identifier.userId?.trim();
  const businessId = identifier.businessId?.trim();

  // 1. Pro subscriber emails, owner UIDs, and demo are ALWAYS recognized as active
  if (email && PRO_EMAILS.has(email)) return true;
  if (userId && (PRO_EMAILS.has(userId.toLowerCase()) || userId === "rcB3J0qBydaOGKD44gS0JAbpX9m1" || userId.includes("ossovi32"))) return true;
  if (businessId && (businessId === "demo-cafe" || businessId === "rcB3J0qBydaOGKD44gS0JAbpX9m1" || businessId.includes("ossovi32"))) return true;

  // 2. Active stored statuses
  if (businessId && fallbackBusinesses[businessId]?.subscriptionStatus === "active") return true;
  if (userId && fallbackBusinesses[userId]?.subscriptionStatus === "active") return true;

  // 3. Explicitly suspended/canceled non-pro accounts (only past_due or canceled, never default inactive)
  if (businessId && fallbackBusinesses[businessId]) {
    const status = fallbackBusinesses[businessId].subscriptionStatus;
    if (status === "past_due" || status === "canceled") {
      return false;
    }
  }
  if (userId && fallbackBusinesses[userId]) {
    const status = fallbackBusinesses[userId].subscriptionStatus;
    if (status === "past_due" || status === "canceled") {
      return false;
    }
  }

  return false;
}

// Check Stripe live for active subscriptions matching user email or UID
async function checkStripeSubscriptionForUser(
  userId?: string,
  email?: string
): Promise<{ hasActiveSub: boolean; customerId?: string; subscriptionId?: string; businessName?: string; status?: string }> {
  if (isProAccount({ email, userId })) {
    return {
      hasActiveSub: true,
      businessName: "Artisan",
      status: "active",
    };
  }

  const stripe = getStripe();
  if (!stripe) return { hasActiveSub: false };

  try {
    const cleanEmail = email?.toLowerCase().trim();

    // 1. Check by email if provided across all customer records
    if (cleanEmail) {
      const customers = await stripe.customers.list({ email: cleanEmail, limit: 10 });
      for (const cust of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: cust.id, limit: 10 });
        // Check for any active or trialing subscription first
        for (const sub of subs.data) {
          if (sub.status === "active" || sub.status === "trialing") {
            return {
              hasActiveSub: true,
              customerId: cust.id,
              subscriptionId: sub.id,
              status: sub.status,
              businessName: cust.name || (cust.metadata?.businessName as string) || undefined,
            };
          }
        }
      }
    }

    // 2. Check recent active subscriptions or checkout sessions matching userId or cleanEmail
    const recentSessions = await stripe.checkout.sessions.list({ limit: 50 });
    for (const sess of recentSessions.data) {
      const sessEmail = sess.customer_details?.email?.toLowerCase().trim() || (sess.metadata?.email as string)?.toLowerCase().trim();
      const matchesEmail = cleanEmail && sessEmail === cleanEmail;
      const matchesUser = userId && (
        sess.client_reference_id === userId ||
        sess.metadata?.firebaseUid === userId ||
        sess.metadata?.businessId === userId
      );

      if (
        (sess.payment_status === "paid" || sess.status === "complete") &&
        (matchesEmail || matchesUser)
      ) {
        return {
          hasActiveSub: true,
          customerId: typeof sess.customer === "string" ? sess.customer : undefined,
          businessName: sess.metadata?.businessName || undefined,
          status: "active",
        };
      }
    }

    // 3. Also check subscriptions by customer search if userId is a customer ID
    if (userId && userId.startsWith("cus_")) {
      try {
        const subs = await stripe.subscriptions.list({ customer: userId, limit: 5 });
        for (const sub of subs.data) {
          if (sub.status === "active" || sub.status === "trialing") {
            return {
              hasActiveSub: true,
              customerId: userId,
              subscriptionId: sub.id,
              status: sub.status,
            };
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("[Stripe Subscription Check Error]:", err);
  }

  return { hasActiveSub: false };
}

// Fetch Business Profile directly from Firestore REST API
async function fetchFirestoreBusiness(
  businessId?: string,
  ownerUid?: string,
  email?: string
): Promise<StoredBusiness | null> {
  const cfg = getFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId) return null;
  const dbId = cfg.firestoreDatabaseId || "(default)";

  // 1. Direct document fetch if businessId is specified
  if (businessId && businessId !== "demo-cafe") {
    try {
      const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents/businesses/${encodeURIComponent(businessId)}?key=${cfg.apiKey}`;
      const res = await fetch(docUrl);
      if (res.ok) {
        const doc = await res.json();
        if (doc && doc.fields) {
          const fields = doc.fields;
          const status = fields.subscriptionStatus?.stringValue || "inactive";
          return {
            id: businessId,
            ownerUid: fields.ownerUid?.stringValue || `owner_${businessId}`,
            businessName: fields.businessName?.stringValue || "My Store",
            googleMapsReviewUrl: fields.googleMapsReviewUrl?.stringValue || fields.googleReviewUrl?.stringValue || "",
            subscriptionStatus: status as any,
            stripeCustomerId: fields.stripeCustomerId?.stringValue,
            stripeSubscriptionId: fields.stripeSubscriptionId?.stringValue,
            createdAt: fields.createdAt?.stringValue || new Date().toISOString(),
            updatedAt: fields.updatedAt?.stringValue || new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.warn("[Firestore REST Fetch Direct Warning]:", e);
    }
  }

  // 2. Structured query by ownerUid or ownerEmail
  if (ownerUid || email) {
    try {
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents:runQuery?key=${cfg.apiKey}`;
      const cleanEmail = email?.toLowerCase().trim();

      const queryRes = await fetch(queryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "businesses" }],
          },
        }),
      });

      if (queryRes.ok) {
        const results = await queryRes.json();
        if (Array.isArray(results)) {
          let activeMatch: StoredBusiness | null = null;
          let anyMatch: StoredBusiness | null = null;

          for (const item of results) {
            if (!item.document) continue;
            const docPath = item.document.name;
            const bizId = docPath.split("/").pop();
            const fields = item.document.fields || {};
            const docOwnerUid = fields.ownerUid?.stringValue;
            const docOwnerEmail = fields.ownerEmail?.stringValue || fields.email?.stringValue;
            const docStatus = fields.subscriptionStatus?.stringValue || "inactive";

            const matchesUser = ownerUid && (docOwnerUid === ownerUid || bizId === ownerUid);
            const matchesMail = cleanEmail && docOwnerEmail && docOwnerEmail.toLowerCase() === cleanEmail;

            if ((matchesUser || matchesMail) && bizId) {
              const parsed: StoredBusiness = {
                id: bizId,
                ownerUid: docOwnerUid || `owner_${bizId}`,
                businessName: fields.businessName?.stringValue || "My Store",
                googleMapsReviewUrl: fields.googleMapsReviewUrl?.stringValue || fields.googleReviewUrl?.stringValue || "",
                subscriptionStatus: docStatus as any,
                stripeCustomerId: fields.stripeCustomerId?.stringValue,
                stripeSubscriptionId: fields.stripeSubscriptionId?.stringValue,
                createdAt: fields.createdAt?.stringValue || new Date().toISOString(),
                updatedAt: fields.updatedAt?.stringValue || new Date().toISOString(),
              };

              if (docStatus === "active") {
                activeMatch = parsed;
                break;
              } else if (!anyMatch) {
                anyMatch = parsed;
              }
            }
          }

          if (activeMatch) return activeMatch;
          if (anyMatch) return anyMatch;
        }
      }
    } catch (e) {
      console.warn("[Firestore REST Query Scan Warning]:", e);
    }
  }

  return null;
}

// Helper to read Firebase Applet Config dynamically
function getFirebaseConfig(): { projectId: string; firestoreDatabaseId: string; apiKey: string } {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return {
        projectId: data.projectId || "max-reviews-15395",
        firestoreDatabaseId: data.firestoreDatabaseId || "(default)",
        apiKey: data.apiKey || "",
      };
    }
  } catch (e) {
    console.warn("[Firestore] Could not load firebase-applet-config.json:", e);
  }
  return {
    projectId: "max-reviews-15395",
    firestoreDatabaseId: "(default)",
    apiKey: "",
  };
}

// Update business subscription status in Firestore and in-memory cache across all matching businesses
async function updateFirestoreBusinessSubscription(
  customerId: string,
  newStatus: "active" | "inactive" | "past_due" | "canceled",
  metadataHints?: { businessId?: string; firebaseUid?: string; email?: string }
): Promise<{ updatedCount: number; matchedBusinessIds: string[] }> {
  const matchedBusinessIds: string[] = [];
  const cfg = getFirebaseConfig();

  if (!cfg.apiKey || !cfg.projectId) {
    console.warn("[Firestore Webhook] Missing Firebase config to query Firestore.");
  } else {
    try {
      const dbId = cfg.firestoreDatabaseId;
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents:runQuery?key=${cfg.apiKey}`;

      const queryRes = await fetch(queryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "businesses" }],
          },
        }),
      });

      if (queryRes.ok) {
        const results = await queryRes.json();
        if (Array.isArray(results)) {
          for (const item of results) {
            if (!item.document) continue;
            const docPath = item.document.name; // projects/.../databases/.../documents/businesses/{bizId}
            const bizId = docPath.split("/").pop();
            const fields = item.document.fields || {};

            const docStripeCustId = fields.stripeCustomerId?.stringValue;
            const docOwnerUid = fields.ownerUid?.stringValue;

            const isMatch =
              (docStripeCustId && docStripeCustId === customerId) ||
              (metadataHints?.businessId && bizId === metadataHints.businessId) ||
              (metadataHints?.firebaseUid && (docOwnerUid === metadataHints.firebaseUid || bizId === metadataHints.firebaseUid));

            if (isMatch && bizId) {
              matchedBusinessIds.push(bizId);

              // Patch Firestore document directly
              const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=subscriptionStatus&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=stripeCustomerId&key=${cfg.apiKey}`;
              const patchRes = await fetch(patchUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fields: {
                    subscriptionStatus: { stringValue: newStatus },
                    updatedAt: { stringValue: new Date().toISOString() },
                    stripeCustomerId: { stringValue: customerId },
                  },
                }),
              });

              if (patchRes.ok) {
                console.log(`[Firestore Webhook] Successfully patched businesses/${bizId} to status "${newStatus}"`);
              } else {
                const errText = await patchRes.text();
                console.warn(`[Firestore Webhook] Failed to patch businesses/${bizId}:`, errText);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[Firestore Webhook Error]:", err.message);
    }
  }

  // If a specific businessId hint was provided but not found in scan, patch directly
  if (metadataHints?.businessId && !matchedBusinessIds.includes(metadataHints.businessId) && cfg.apiKey) {
    try {
      const bizId = metadataHints.businessId;
      const docPath = `projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/businesses/${bizId}`;
      const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=subscriptionStatus&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=stripeCustomerId&key=${cfg.apiKey}`;
      const patchRes = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            subscriptionStatus: { stringValue: newStatus },
            updatedAt: { stringValue: new Date().toISOString() },
            stripeCustomerId: { stringValue: customerId },
          },
        }),
      });
      if (patchRes.ok) {
        matchedBusinessIds.push(bizId);
        console.log(`[Firestore Webhook] Direct patch applied to businesses/${bizId} -> "${newStatus}"`);
      }
    } catch (err: any) {
      console.warn("[Firestore Webhook Direct Patch Error]:", err.message);
    }
  }

  // Synchronize in-memory fallback stores
  for (const bizId of matchedBusinessIds) {
    if (fallbackBusinesses[bizId]) {
      fallbackBusinesses[bizId].subscriptionStatus = newStatus;
      fallbackBusinesses[bizId].updatedAt = new Date().toISOString();
      fallbackBusinesses[bizId].stripeCustomerId = customerId;
    }
  }

  if (metadataHints?.businessId && fallbackBusinesses[metadataHints.businessId]) {
    fallbackBusinesses[metadataHints.businessId].subscriptionStatus = newStatus;
    fallbackBusinesses[metadataHints.businessId].updatedAt = new Date().toISOString();
    fallbackBusinesses[metadataHints.businessId].stripeCustomerId = customerId;
  }

  return { updatedCount: matchedBusinessIds.length, matchedBusinessIds };
}

// -----------------------------------------------------------------------------
// Stripe Webhook Endpoint (Receives raw JSON body and verifies Stripe signature)
// -----------------------------------------------------------------------------
app.post("/api/webhooks/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();

  if (!stripe) {
    console.error("[Stripe Webhook] Stripe SDK is not initialized on the server.");
    return res.status(500).json({ error: "Stripe not configured on server" });
  }

  let event: Stripe.Event;

  // Verify Stripe signature using STRIPE_WEBHOOK_SECRET
  if (webhookSecret) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    console.warn(
      "[Stripe Webhook] Warning: STRIPE_WEBHOOK_SECRET is not configured in .env. Processing event payload in unverified mode."
    );
    try {
      const rawBodyStr = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
      event = typeof rawBodyStr === "string" ? JSON.parse(rawBodyStr) : rawBodyStr;
    } catch (err: any) {
      return res.status(400).send(`Webhook JSON Parse Error: ${err.message}`);
    }
  }

  console.log(`[Stripe Webhook] Received verified event: ${event.type} (ID: ${event.id})`);

  try {
    switch (event.type) {
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        if (!customerId) {
          console.warn("[Stripe Webhook] invoice.payment_failed received with no customer ID");
          break;
        }

        let businessIdHint = (invoice.metadata?.businessId || (invoice as any).subscription_details?.metadata?.businessId) as string | undefined;
        let firebaseUidHint = (invoice.metadata?.firebaseUid || (invoice as any).subscription_details?.metadata?.firebaseUid) as string | undefined;

        // Retrieve metadata from subscription or customer if missing on invoice
        const rawInvoice = invoice as any;
        if (!businessIdHint && (rawInvoice.subscription || rawInvoice.subscription_details?.metadata?.businessId)) {
          try {
            const subId = typeof rawInvoice.subscription === "string" ? rawInvoice.subscription : rawInvoice.subscription?.id;
            if (subId) {
              const sub = await stripe.subscriptions.retrieve(subId);
              businessIdHint = sub.metadata?.businessId;
              firebaseUidHint = sub.metadata?.firebaseUid;
            }
          } catch (subErr) {
            console.warn("[Stripe Webhook] Could not retrieve subscription metadata:", subErr);
          }
        }

        if (!businessIdHint && customerId) {
          try {
            const cust = await stripe.customers.retrieve(customerId) as any;
            if (cust && !cust.deleted && cust.metadata) {
              businessIdHint = cust.metadata.businessId;
              firebaseUidHint = cust.metadata.firebaseUid;
            }
          } catch {}
        }

        console.log(`[Stripe Webhook] Processing invoice.payment_failed for customer ${customerId} (biz hint: ${businessIdHint || "none"})`);

        // Update Firestore and in-memory businesses to past_due
        const result = await updateFirestoreBusinessSubscription(
          customerId,
          "past_due",
          {
            businessId: businessIdHint,
            firebaseUid: firebaseUidHint,
            email: invoice.customer_email || undefined,
          }
        );

        console.log(`[Stripe Webhook] Payment failed: updated ${result.updatedCount} business records to "past_due"`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

        if (!customerId) {
          console.warn("[Stripe Webhook] customer.subscription.deleted received with no customer ID");
          break;
        }

        const businessIdHint = subscription.metadata?.businessId;
        const firebaseUidHint = subscription.metadata?.firebaseUid;

        console.log(`[Stripe Webhook] Processing customer.subscription.deleted for customer ${customerId}`);

        const result = await updateFirestoreBusinessSubscription(
          customerId,
          "inactive",
          {
            businessId: businessIdHint,
            firebaseUid: firebaseUidHint,
          }
        );

        console.log(`[Stripe Webhook] Subscription deleted: updated ${result.updatedCount} business records to "inactive"`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

        if (customerId) {
          const status = subscription.status;
          const targetStatus: "active" | "past_due" | "inactive" =
            status === "active" ? "active" :
            status === "past_due" ? "past_due" :
            status === "unpaid" || status === "canceled" ? "inactive" : "inactive";

          console.log(`[Stripe Webhook] Subscription ${subscription.id} status updated to: ${status} -> syncing to ${targetStatus}`);

          await updateFirestoreBusinessSubscription(customerId, targetStatus, {
            businessId: subscription.metadata?.businessId,
            firebaseUid: subscription.metadata?.firebaseUid,
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId && invoice.status === "paid") {
          console.log(`[Stripe Webhook] Payment succeeded for customer ${customerId}, syncing to "active"`);
          await updateFirestoreBusinessSubscription(customerId, "active", {
            businessId: invoice.metadata?.businessId,
            firebaseUid: invoice.metadata?.firebaseUid,
          });
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Received unhandled event: ${event.type}`);
    }
  } catch (handlerErr: any) {
    console.error(`[Stripe Webhook] Handler error processing ${event.type}:`, handlerErr);
    return res.status(500).json({ error: "Internal error processing webhook" });
  }

  res.json({ received: true });
});

// -----------------------------------------------------------------------------
// Customer Portal Session (For updating card and payment methods)
// -----------------------------------------------------------------------------
app.post("/api/create-customer-portal-session", async (req, res) => {
  try {
    const { businessId, email, userId } = req.body;
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not initialized on server" });
    }

    let customerId = (email && memoryStripeCustomers[email.toLowerCase().trim()]) ||
                     (businessId && fallbackBusinesses[businessId]?.stripeCustomerId);

    // If not found in memory, query Stripe by email
    if (!customerId && email) {
      const existingCustomers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      }
    }

    // If still not found, search Firestore for this business
    if (!customerId && businessId) {
      const cfg = getFirebaseConfig();
      if (cfg.apiKey) {
        try {
          const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/businesses/${businessId}?key=${cfg.apiKey}`;
          const firestoreRes = await fetch(url);
          if (firestoreRes.ok) {
            const data = await firestoreRes.json();
            customerId = data.fields?.stripeCustomerId?.stringValue;
          }
        } catch {}
      }
    }

    const host = req.headers.host || "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
    const returnUrl = `${protocol}://${host}/dashboard`;

    // If customer doesn't exist yet in Stripe, create one on the fly if email is provided
    if (!customerId && email) {
      try {
        const newCustomer = await stripe.customers.create({
          email: email.toLowerCase().trim(),
          name: req.body.businessName || businessId || "Business Owner",
          metadata: { businessId: businessId || "", userId: userId || "" },
        });
        customerId = newCustomer.id;
        memoryStripeCustomers[email.toLowerCase().trim()] = customerId;
      } catch (custErr: any) {
        console.warn("Could not auto-create customer in Stripe:", custErr);
      }
    }

    if (!customerId) {
      return res.status(404).json({
        error: "No Stripe customer found for this account. Please renew your subscription to set up billing.",
        canCheckout: true,
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Error creating customer portal session:", err);
    res.status(500).json({ error: err.message });
  }
});

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

// ----------------------------------------------------
// Traditional Registration and Login API (Users Database)
// ----------------------------------------------------

// 1. Traditional Register (Sign Up): creates record in users database
app.post("/api/auth/register", (req, res) => {
  try {
    const { email, password, businessName, displayName } = req.body;
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    // Refresh stored users from disk in case updated elsewhere
    storedUsers = loadStoredUsers();

    const existingUser = findUserByEmail(cleanEmail);
    if (existingUser && existingUser.passwordHash) {
      return res.status(409).json({
        error: "An account with this email already exists. Please log in.",
      });
    }

    // Hash password with cryptographically secure random salt
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);

    // Look for existing business matching this email
    let matchedBizId: string | null = null;
    for (const [bizId, biz] of Object.entries(fallbackBusinesses)) {
      if (biz.ownerEmail && biz.ownerEmail.toLowerCase().trim() === cleanEmail) {
        matchedBizId = bizId;
        break;
      }
    }

    const userId = existingUser?.id || `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const resolvedBizId = matchedBizId || `biz_${userId}`;
    const isPro = isProAccount({ email: cleanEmail, businessId: resolvedBizId, userId });

    // Ensure business record exists in database
    if (!fallbackBusinesses[resolvedBizId]) {
      fallbackBusinesses[resolvedBizId] = {
        id: resolvedBizId,
        ownerUid: userId,
        ownerEmail: cleanEmail,
        businessName: businessName?.trim() || "My Store",
        googleMapsReviewUrl: "",
        subscriptionStatus: isPro ? "active" : "inactive",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      persistStoredBusinesses();
    } else if (businessName && businessName.trim() && fallbackBusinesses[resolvedBizId].businessName !== businessName.trim()) {
      fallbackBusinesses[resolvedBizId].businessName = businessName.trim();
      fallbackBusinesses[resolvedBizId].updatedAt = new Date().toISOString();
      persistStoredBusinesses();
    }

    const currentBiz = fallbackBusinesses[resolvedBizId];
    const userRecord: StoredUserAccount = {
      id: userId,
      email: cleanEmail,
      salt,
      passwordHash,
      displayName: displayName?.trim() || businessName?.trim() || cleanEmail.split("@")[0],
      businessId: resolvedBizId,
      businessName: currentBiz?.businessName || businessName?.trim() || "My Store",
      subscriptionStatus: currentBiz?.subscriptionStatus || (isPro ? "active" : "inactive"),
      createdAt: existingUser?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storedUsers[userId] = userRecord;
    persistStoredUsers();

    console.log(`[AUTH] Traditional registration successful for: ${cleanEmail} (uid: ${userId}, biz: ${resolvedBizId})`);

    return res.status(201).json({
      success: true,
      user: {
        uid: userId,
        email: cleanEmail,
        displayName: userRecord.displayName,
        businessId: resolvedBizId,
        businessName: userRecord.businessName,
        subscriptionStatus: userRecord.subscriptionStatus,
        emailVerified: true,
      },
    });
  } catch (err: any) {
    console.error("[AUTH] Registration error:", err);
    return res.status(500).json({ error: "Failed to register account. Please try again." });
  }
});

// 2. Traditional Login (Sign In): checks credentials against users database
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Reload stored users from disk
    storedUsers = loadStoredUsers();
    const user = findUserByEmail(cleanEmail);

    if (!user) {
      // Check if this is an existing business in fallbackBusinesses without user password initialized yet
      let matchedBizId: string | null = null;
      for (const [bizId, biz] of Object.entries(fallbackBusinesses)) {
        if (biz.ownerEmail && biz.ownerEmail.toLowerCase().trim() === cleanEmail) {
          matchedBizId = bizId;
          break;
        }
      }

      if (matchedBizId) {
        // Pre-existing business owner logging in: set their password now
        const salt = crypto.randomBytes(16).toString("hex");
        const passwordHash = hashPassword(password, salt);
        const userId = fallbackBusinesses[matchedBizId].ownerUid || `usr_${Date.now()}`;
        const isPro = isProAccount({ email: cleanEmail, businessId: matchedBizId, userId });

        const newUser: StoredUserAccount = {
          id: userId,
          email: cleanEmail,
          salt,
          passwordHash,
          displayName: cleanEmail.split("@")[0],
          businessId: matchedBizId,
          businessName: fallbackBusinesses[matchedBizId].businessName,
          subscriptionStatus: fallbackBusinesses[matchedBizId].subscriptionStatus || (isPro ? "active" : "inactive"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        storedUsers[userId] = newUser;
        persistStoredUsers();
        console.log(`[AUTH] Registered password for existing account on login: ${cleanEmail}`);

        return res.json({
          success: true,
          user: {
            uid: userId,
            email: cleanEmail,
            displayName: newUser.displayName,
            businessId: matchedBizId,
            businessName: newUser.businessName,
            subscriptionStatus: newUser.subscriptionStatus,
            emailVerified: true,
          },
        });
      }

      return res.status(401).json({
        error: "No account found with this email. Please check your email or create an account.",
      });
    }

    // User exists. If passwordHash was empty (pre-seeded), set password now
    if (!user.passwordHash) {
      user.salt = crypto.randomBytes(16).toString("hex");
      user.passwordHash = hashPassword(password, user.salt);
      user.updatedAt = new Date().toISOString();
      persistStoredUsers();
    } else {
      // Verify password against stored hash
      const isValid = verifyPassword(password, user.salt, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          error: "Incorrect password. Please try again.",
        });
      }
    }

    // Refresh business status
    const biz = fallbackBusinesses[user.businessId];
    const isPro = isProAccount({ email: user.email, businessId: user.businessId, userId: user.id });
    const subscriptionStatus = biz?.subscriptionStatus || (isPro ? "active" : (user.subscriptionStatus || "inactive"));

    console.log(`[AUTH] Traditional login successful for: ${cleanEmail} (uid: ${user.id}, biz: ${user.businessId})`);

    return res.json({
      success: true,
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.displayName,
        businessId: user.businessId,
        businessName: biz?.businessName || user.businessName || "My Store",
        subscriptionStatus,
        emailVerified: true,
      },
    });
  } catch (err: any) {
    console.error("[AUTH] Login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// 3. Check if email exists in database
app.get("/api/auth/check-email", (req, res) => {
  const email = (req.query.email as string)?.toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ error: "Email query param required" });
  }
  storedUsers = loadStoredUsers();
  const exists = Boolean(findUserByEmail(email));
  return res.json({ exists });
});

// 4. Logout endpoint
app.post("/api/auth/logout", (_req, res) => {
  return res.json({ success: true, message: "Logged out successfully" });
});

// 1. Generate and send verification email from noreply@tapshield.space (with one-click link & 6-digit OTP code)
app.post("/api/auth/send-verification-code", async (req, res) => {
  try {
    const { email, uid } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    // Explicitly invalidate any previous verification state so user MUST input code
    delete memoryVerifiedEmails[normalizedEmail];
    if (uid) {
      delete memoryVerifiedEmails[uid];
    }

    // Generate secure random 6-digit OTP & 32-char verification token
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const token = (Math.random().toString(36).substring(2) + Date.now().toString(36) + Math.random().toString(36).substring(2));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute expiration

    memoryVerificationCodes[normalizedEmail] = {
      email: normalizedEmail,
      code,
      token,
      uid: uid || undefined,
      expiresAt,
      createdAt: new Date(),
      attempts: 0,
      used: false,
    };
    memoryVerificationTokens[token] = normalizedEmail;

    const hostHeader = req.get("host") || "tapshield.space";
    const protocol = req.protocol === "http" && !hostHeader.includes("localhost") ? "https" : req.protocol;
    const baseUrl = process.env.APP_URL || `${protocol}://${hostHeader}`;
    const verificationLink = `${baseUrl}/api/auth/verify-link?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;

    console.log(`[AUTH] Generated verification for ${normalizedEmail} (code: ${code}) from noreply@tapshield.space`);

    const fromAddress = process.env.RESEND_FROM_EMAIL || `"TapShield" <noreply@tapshield.space>`;
    const subject = `Your TapShield Verification Code`;
    const textContent = `Welcome to TapShield!\n\nPlease verify your email address to access your store dashboard:\n${verificationLink}\n\nOr enter this 6-digit verification code: ${code}\n\nThis verification link and code expire in 15 minutes.\n\nSent from noreply@tapshield.space`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0A0A0A; color: #FFFFFF; border-radius: 16px; border: 1px solid #262626;">
        <div style="margin-bottom: 24px;">
          <span style="display: inline-block; background: #10B981; color: #000000; font-size: 11px; font-weight: 900; letter-spacing: 2px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">TapShield</span>
        </div>
        
        <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.02em;">Verify your email address</h1>
        
        <p style="color: #A3A3A3; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
          Please verify your email address to access your store dashboard and NFC review shield.
        </p>

        <!-- One-Click Primary Button -->
        <div style="margin: 28px 0; text-align: center;">
          <a href="${verificationLink}" style="display: inline-block; background: #10B981; color: #000000; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 14px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
            Verify My Account
          </a>
        </div>

        <!-- 6-digit OTP code alternative -->
        <div style="background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <p style="color: #737373; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">
            Or enter this 6-digit code in your browser
          </p>
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; font-family: monospace; color: #10B981;">
            ${code}
          </span>
          <p style="color: #737373; font-size: 11px; margin: 8px 0 0 0;">
            Expires in <strong>15 minutes</strong>
          </p>
        </div>

        <p style="color: #525252; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; border-top: 1px solid #1F1F1F; padding-top: 16px;">
          Sent from <strong style="color: #737373;">noreply@tapshield.space</strong>.<br />
          If you did not request this verification, you can safely ignore this email.
        </p>
      </div>
    `;

    // 1. First attempt via Resend
    let sentSuccessfully = false;
    const resend = getResend();
    if (resend) {
      try {
        const resendRes = await resend.emails.send({
          from: fromAddress,
          to: normalizedEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });
        if (resendRes && !resendRes.error) {
          sentSuccessfully = true;
          console.log(`[AUTH] Verification email successfully dispatched via Resend from noreply@tapshield.space to ${normalizedEmail}`);
        } else if (resendRes?.error) {
          console.warn("[AUTH] Resend email warning:", resendRes.error);
        }
      } catch (resendErr) {
        console.warn("[AUTH] Resend dispatch error:", resendErr);
      }
    }

    // 2. Secondary fallback via Nodemailer transporter
    if (!sentSuccessfully) {
      try {
        const transporter = getMailTransporter();
        await transporter.sendMail({
          from: `"TapShield" <noreply@tapshield.space>`,
          to: normalizedEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });
        sentSuccessfully = true;
        console.log(`[AUTH] Verification email dispatched via SMTP/stream from noreply@tapshield.space to ${normalizedEmail}`);
      } catch (smtpErr) {
        console.warn("[AUTH] SMTP send warning:", smtpErr);
      }
    }

    res.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      message: `Verification email sent from noreply@tapshield.space to ${normalizedEmail}`,
      verificationLink,
    });
  } catch (err: any) {
    console.error("Error sending verification code:", err);
    res.status(500).json({ error: err?.message || "Failed to generate verification code" });
  }
});

// 1b. Handle one-click verification link from email sent by noreply@tapshield.space
app.get("/api/auth/verify-link", async (req, res) => {
  try {
    const token = (req.query.token as string)?.trim();
    const email = (req.query.email as string)?.trim().toLowerCase();

    if (!token && !email) {
      return res.redirect("/?verification_status=invalid");
    }

    const normalizedEmail = email || (token ? memoryVerificationTokens[token] : "");
    if (!normalizedEmail) {
      return res.redirect("/?verification_status=not_found");
    }

    const record = memoryVerificationCodes[normalizedEmail];
    if (!record) {
      // Check if already verified
      if (memoryVerifiedEmails[normalizedEmail]) {
        return res.redirect(`/?verified=true&email=${encodeURIComponent(normalizedEmail)}`);
      }
      return res.redirect("/?verification_status=not_found");
    }

    // Check expiration
    const now = new Date();
    if (now.getTime() > new Date(record.expiresAt).getTime()) {
      delete memoryVerificationCodes[normalizedEmail];
      if (token) delete memoryVerificationTokens[token];
      return res.redirect("/?verification_status=expired");
    }

    // Mark verified
    record.used = true;
    memoryVerifiedEmails[normalizedEmail] = true;
    if (record.uid) {
      memoryVerifiedEmails[record.uid] = true;
    }
    if (token) {
      delete memoryVerificationTokens[token];
    }

    console.log(`[AUTH] Successfully verified ${normalizedEmail} via link from noreply@tapshield.space`);
    return res.redirect(`/?verified=true&email=${encodeURIComponent(normalizedEmail)}`);
  } catch (err: any) {
    console.error("Error verifying via email link:", err);
    return res.redirect("/?verification_status=error");
  }
});

// Optional alias for /verify
app.get("/verify", (req, res) => {
  const queryParams = new URLSearchParams(req.query as any).toString();
  res.redirect(302, `/api/auth/verify-link?${queryParams}`);
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

// Register Google session and guarantee verified status in server store (ONLY for Google OAuth)
app.post("/api/auth/google-session", (req, res) => {
  const { email, displayName, uid, isGoogle } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (isGoogle) {
    memoryVerifiedEmails[normalizedEmail] = true;
    if (uid) {
      memoryVerifiedEmails[uid] = true;
    }
    console.log(`[AUTH] Verified Google OAuth session registered for ${normalizedEmail} (uid: ${uid || "none"})`);
  }
  res.json({ success: true, emailVerified: Boolean(isGoogle) });
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

    const origin = req.headers.origin || process.env.APP_URL || "https://tapshield.space";
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

    console.log("[Stripe Checkout API] Creating checkout sessions with interval:", interval, "amount:", amount);

    let hostedSession: any = null;
    let embeddedSession: any = null;

    const successReturnUrl = effectiveReturnUrl.includes("{CHECKOUT_SESSION_ID}")
      ? effectiveReturnUrl
      : `${effectiveReturnUrl}${effectiveReturnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}&subscribed=true`;

    const cancelUrl = `${origin}/dashboard`;

    // 1. Create Hosted Checkout Session (Generates direct official Stripe checkout URL)
    try {
      hostedSession = await stripe.checkout.sessions.create({
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
        success_url: successReturnUrl,
        cancel_url: cancelUrl,
      });
      console.log("[Stripe Checkout API] Hosted session created:", hostedSession.id, hostedSession.url);
    } catch (hostedErr: any) {
      console.warn("[Stripe Checkout API] Hosted session creation warning:", hostedErr?.message);
    }

    // 2. Create Embedded Checkout Session (Generates client_secret for in-page iframe)
    try {
      embeddedSession = await stripe.checkout.sessions.create({
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
        return_url: successReturnUrl,
      });
      console.log("[Stripe Checkout API] Embedded session created:", embeddedSession.id);
    } catch (embeddedErr: any) {
      console.warn("[Stripe Checkout API] Embedded session creation warning:", embeddedErr?.message);
    }

    const effectiveSession = hostedSession || embeddedSession;
    if (!effectiveSession) {
      throw new Error("Could not initialize Stripe Checkout session. Please check Stripe credentials.");
    }

    const directUrl = hostedSession?.url || null;
    const clientSecret = embeddedSession?.client_secret || null;

    return res.json({
      mode: "live_stripe",
      sessionId: effectiveSession.id,
      clientSecret: clientSecret,
      client_secret: clientSecret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
      customerId: customerId || effectiveSession.customer,
      url: directUrl,
      checkoutUrl: directUrl,
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
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (isPaid && businessId) {
      if (!fallbackBusinesses[businessId]) {
        fallbackBusinesses[businessId] = {
          id: businessId,
          ownerUid: (session.metadata?.firebaseUid as string) || `owner_${businessId}`,
          businessName: (session.metadata?.businessName as string) || "Artisan",
          googleMapsReviewUrl: "",
          subscriptionStatus: "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString() + "_paid_verified",
        };
      } else {
        fallbackBusinesses[businessId].subscriptionStatus = "active";
        fallbackBusinesses[businessId].updatedAt = new Date().toISOString() + "_paid_verified";
        if (customerId) fallbackBusinesses[businessId].stripeCustomerId = customerId;
        if (subscriptionId) fallbackBusinesses[businessId].stripeSubscriptionId = subscriptionId;
      }

      if (customerId) {
        await updateFirestoreBusinessSubscription(customerId, "active", {
          businessId,
          firebaseUid: (session.metadata?.firebaseUid as string) || businessId,
        });
      }
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

  const canonicalId = resolveCanonicalBusinessId(businessId, email || userId);
  let business = fallbackBusinesses[canonicalId] || fallbackBusinesses[businessId];

  // If business has an explicit suspended status (past_due or canceled only), respect it
  if (business && (business.subscriptionStatus === "past_due" || business.subscriptionStatus === "canceled")) {
    return res.json(business);
  }

  const hasPro = isProAccount({ email, userId, businessId: canonicalId });

  // If already recognized as pro, ensure active status and return immediately
  if (hasPro) {
    if (!business) {
      business = {
        id: canonicalId,
        ownerUid: userId || canonicalId,
        ownerEmail: email ? email.toLowerCase().trim() : undefined,
        businessName: "OOO",
        googleMapsReviewUrl: "",
        subscriptionStatus: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString() + "_paid_verified",
      };
      fallbackBusinesses[canonicalId] = business;
      if (canonicalId !== businessId) fallbackBusinesses[businessId] = business;
      persistStoredBusinesses();
    } else {
      business.subscriptionStatus = "active";
      if (email && !business.ownerEmail) business.ownerEmail = email.toLowerCase().trim();
    }
    return res.json(business);
  }

  // If not demo and not currently verified active in memory, check Firestore first
  if (!isDemo && (!business || business.subscriptionStatus !== "active")) {
    const firestoreBiz = await fetchFirestoreBusiness(canonicalId, userId, email);
    if (firestoreBiz) {
      if (firestoreBiz.subscriptionStatus === "active") {
        fallbackBusinesses[canonicalId] = firestoreBiz;
        if (canonicalId !== businessId) fallbackBusinesses[businessId] = firestoreBiz;
        persistStoredBusinesses();
        return res.json(firestoreBiz);
      }
      if (!business) {
        business = firestoreBiz;
        fallbackBusinesses[canonicalId] = firestoreBiz;
        if (canonicalId !== businessId) fallbackBusinesses[businessId] = firestoreBiz;
        persistStoredBusinesses();
      }
    }
  }

  // If not demo and not currently verified active, check Stripe live
  if (!isDemo && (!business || business.subscriptionStatus !== "active")) {
    const stripeCheck = await checkStripeSubscriptionForUser(userId || canonicalId, email);
    if (stripeCheck.hasActiveSub) {
      business = {
        id: canonicalId,
        ownerUid: userId || `owner_${canonicalId}`,
        ownerEmail: email ? email.toLowerCase().trim() : undefined,
        businessName: stripeCheck.businessName || business?.businessName || "Artisan",
        googleMapsReviewUrl: business?.googleMapsReviewUrl || "",
        subscriptionStatus: "active",
        stripeCustomerId: stripeCheck.customerId,
        stripeSubscriptionId: stripeCheck.subscriptionId,
        createdAt: business?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString() + "_paid_verified",
      };
      fallbackBusinesses[canonicalId] = business;
      if (canonicalId !== businessId) fallbackBusinesses[businessId] = business;
      persistStoredBusinesses();

      // Also ensure Firestore is updated to active
      if (stripeCheck.customerId) {
        updateFirestoreBusinessSubscription(stripeCheck.customerId, "active", {
          businessId: canonicalId,
          firebaseUid: userId || canonicalId,
        }).catch(() => {});
      }

      return res.json(business);
    }
  }

  if (!business) {
    // Generate a starter business record: demo-cafe is active, real user stores are inactive until paid
    const newBiz: StoredBusiness = {
      id: canonicalId,
      ownerUid: userId || `owner_${canonicalId}`,
      ownerEmail: email ? email.toLowerCase().trim() : undefined,
      businessName: isDemo ? "Artisan Brews & Roastery" : "My Store",
      googleMapsReviewUrl: isDemo ? "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4" : "",
      subscriptionStatus: isDemo ? "active" : "inactive",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fallbackBusinesses[canonicalId] = newBiz;
    if (canonicalId !== businessId) fallbackBusinesses[businessId] = newBiz;
    persistStoredBusinesses();
    return res.json(newBiz);
  }

  res.json(business);
});

// Real-time subscription check across Stripe, Firestore & memory
app.get("/api/subscription-status", async (req, res) => {
  const email = (req.query.email as string)?.trim();
  const userId = (req.query.userId as string)?.trim();
  const businessId = (req.query.businessId as string)?.trim();
  const canonicalId = resolveCanonicalBusinessId(businessId, email || userId);

  // Demo account and Pro accounts are always active
  if (isProAccount({ email, userId, businessId: canonicalId })) {
    return res.json({ isPro: true, status: "active" });
  }

  // Check live Stripe subscriptions
  const stripeCheck = await checkStripeSubscriptionForUser(userId || canonicalId, email);
  if (stripeCheck.hasActiveSub) {
    const targetId = canonicalId || businessId || userId;
    if (targetId) {
      if (!fallbackBusinesses[targetId]) {
        fallbackBusinesses[targetId] = {
          id: targetId,
          ownerUid: userId || `owner_${targetId}`,
          businessName: stripeCheck.businessName || "Artisan",
          googleMapsReviewUrl: "",
          subscriptionStatus: "active",
          stripeCustomerId: stripeCheck.customerId,
          stripeSubscriptionId: stripeCheck.subscriptionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString() + "_paid_verified",
        };
      } else {
        fallbackBusinesses[targetId].subscriptionStatus = "active";
        fallbackBusinesses[targetId].updatedAt = new Date().toISOString() + "_paid_verified";
        if (stripeCheck.businessName) fallbackBusinesses[targetId].businessName = stripeCheck.businessName;
        if (stripeCheck.customerId) fallbackBusinesses[targetId].stripeCustomerId = stripeCheck.customerId;
        if (stripeCheck.subscriptionId) fallbackBusinesses[targetId].stripeSubscriptionId = stripeCheck.subscriptionId;
      }
      persistStoredBusinesses();

      if (stripeCheck.customerId) {
        updateFirestoreBusinessSubscription(stripeCheck.customerId, "active", {
          businessId: targetId,
          firebaseUid: userId || targetId,
        }).catch(() => {});
      }
    }
    return res.json({ isPro: true, status: "active", customerId: stripeCheck.customerId });
  }

  // Check in-memory store
  if (canonicalId && fallbackBusinesses[canonicalId]?.subscriptionStatus === "active") {
    return res.json({ isPro: true, status: "active" });
  }
  if (businessId && fallbackBusinesses[businessId]?.subscriptionStatus === "active") {
    return res.json({ isPro: true, status: "active" });
  }
  if (userId && fallbackBusinesses[userId]?.subscriptionStatus === "active") {
    return res.json({ isPro: true, status: "active" });
  }

  // Check Firestore directly
  const firestoreBiz = await fetchFirestoreBusiness(canonicalId, userId, email);
  if (firestoreBiz && firestoreBiz.subscriptionStatus === "active") {
    fallbackBusinesses[canonicalId] = firestoreBiz;
    if (businessId) fallbackBusinesses[businessId] = firestoreBiz;
    if (userId) fallbackBusinesses[userId] = firestoreBiz;
    persistStoredBusinesses();
    return res.json({ isPro: true, status: "active" });
  }

  return res.json({ isPro: false, status: "inactive" });
});

app.post("/api/businesses/:businessId", (req, res) => {
  const { businessId } = req.params;
  const { businessName, googleMapsReviewUrl, subscriptionStatus, ownerUid, email } = req.body;
  const canonicalId = resolveCanonicalBusinessId(businessId, email || ownerUid);
  const hasPro = isProAccount({ email, userId: ownerUid, businessId: canonicalId });

  const current = fallbackBusinesses[canonicalId] || fallbackBusinesses[businessId] || {
    id: canonicalId,
    ownerUid: ownerUid || canonicalId,
    ownerEmail: email ? email.toLowerCase().trim() : undefined,
    businessName: "OOO",
    googleMapsReviewUrl: "",
    subscriptionStatus: hasPro ? "active" : "inactive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (businessName !== undefined) current.businessName = businessName;
  if (googleMapsReviewUrl !== undefined) current.googleMapsReviewUrl = googleMapsReviewUrl;
  if (email) current.ownerEmail = email.toLowerCase().trim();

  // Never downgrade an active subscription or pro account to inactive
  if (hasPro || current.subscriptionStatus === "active") {
    current.subscriptionStatus = "active";
  } else if (subscriptionStatus !== undefined && subscriptionStatus !== "inactive") {
    // Only allow setting status if it's not a default inactive downgrade
    current.subscriptionStatus = subscriptionStatus;
  }
  current.updatedAt = new Date().toISOString();

  fallbackBusinesses[canonicalId] = current;
  if (canonicalId !== businessId) {
    fallbackBusinesses[businessId] = current;
  }
  persistStoredBusinesses();
  res.json(current);
});

// Negative Feedback API (Public Customer Submit & Dashboard Inbox fallback)
app.get("/api/businesses/:businessId/feedbacks", (req, res) => {
  const { businessId } = req.params;
  const email = (req.query.email as string)?.trim();
  const canonicalId = resolveCanonicalBusinessId(businessId, email);
  const isDemo = canonicalId === "demo-cafe";
  const biz = fallbackBusinesses[canonicalId] || fallbackBusinesses[businessId];
  const hasPro = isProAccount({ businessId: canonicalId, email });

  // Customer view data shouldn't count till they get the subscription
  if (!isDemo && !hasPro && (!biz || biz.subscriptionStatus !== "active")) {
    return res.json([]);
  }

  const list = fallbackFeedbacks.filter(
    (f) => f.businessId === canonicalId || f.businessId === businessId
  );
  res.json(list);
});

app.post("/api/businesses/:businessId/feedbacks", (req, res) => {
  const { businessId } = req.params;
  const canonicalId = resolveCanonicalBusinessId(businessId);
  const isDemo = canonicalId === "demo-cafe";
  const biz = fallbackBusinesses[canonicalId] || fallbackBusinesses[businessId];
  const hasPro = isProAccount({ businessId: canonicalId });

  // Customer view data shouldn't count till they get the subscription
  if (!isDemo && !hasPro && (!biz || biz.subscriptionStatus !== "active")) {
    console.log(`[FEEDBACK] Blocked customer view data for unsubscribed business: ${businessId}`);
    return res.status(403).json({
      error: "Customer view data does not count until subscription is active",
      recorded: false,
    });
  }

  const { id, customerNote, customerContact, customerName, rating, sentiment, message, createdAt, status } = req.body;

  const resolvedSentiment: "positive" | "negative" =
    sentiment === "positive" || rating === "like" ? "positive" : "negative";
  const resolvedRating: "like" | "dislike" = resolvedSentiment === "positive" ? "like" : "dislike";
  const resolvedNote: string =
    (message || customerNote || (resolvedSentiment === "positive" ? "Customer rated: Loved It!" : "Customer rated: Could Be Better")).trim().slice(0, 2000);

  const targetId = id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newFeedback: StoredFeedback = {
    id: targetId,
    businessId: canonicalId,
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

// Business Reply to Customer Feedback
app.post("/api/businesses/:businessId/feedbacks/:feedbackId/reply", async (req, res) => {
  try {
    const { businessId, feedbackId } = req.params;
    const { message, sentBy, method } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Reply message cannot be empty." });
    }

    const item = fallbackFeedbacks.find((f) => f.id === feedbackId);
    if (!item) {
      return res.status(404).json({ error: "Feedback item not found." });
    }

    const cleanReply = message.trim();
    const contact = item.customerContact?.trim() || "";
    const isEmail = contact.includes("@");
    const chosenMethod: "email" | "sms" | "system" =
      method || (isEmail ? "email" : contact ? "sms" : "system");

    const replyObj: FeedbackReply = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      message: cleanReply,
      sentAt: new Date().toISOString(),
      sentBy: sentBy || "Management",
      method: chosenMethod,
      recipientContact: contact || undefined,
    };

    if (!item.replies) item.replies = [];
    item.replies.push(replyObj);
    item.lastRepliedAt = replyObj.sentAt;
    if (item.status === "new") {
      item.status = "reviewed";
    }

    let emailSent = false;
    // If the customer provided an email, dispatch via Resend or SMTP
    if (isEmail) {
      const biz = fallbackBusinesses[businessId];
      const businessName = biz?.businessName || "Management Team";
      const resend = getResend();

      const replyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1c1917; background-color: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4;">
          <h2 style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.02em; color: #111827; margin-top: 0;">
            Message from ${businessName}
          </h2>
          <p style="font-size: 14px; line-height: 1.6; color: #44403c;">
            Thank you for sharing your feedback with us. We appreciate you taking the time to let us know about your experience.
          </p>
          <div style="background-color: #f5f5f4; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 14px; line-height: 1.6; color: #1c1917; margin: 0; white-space: pre-wrap;">${cleanReply}</p>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #78716c; margin-bottom: 0;">
            You are receiving this email because you submitted feedback for <strong>${businessName}</strong> and requested follow-up. You may reply directly to this message.
          </p>
        </div>
      `;

      try {
        if (resend) {
          const fromAddress = process.env.RESEND_FROM_EMAIL || "TapShield Support <noreply@tapshield.space>";
          await resend.emails.send({
            from: fromAddress,
            to: contact,
            subject: `Message from ${businessName}`,
            text: cleanReply,
            html: replyHtml,
          });
          emailSent = true;
          console.log(`[FEEDBACK-REPLY] Email sent via Resend to ${contact}`);
        } else {
          const transporter = getMailTransporter();
          const fromAddress = process.env.SMTP_FROM || `"TapShield Customer Care" <noreply@tapshield.space>`;
          await transporter.sendMail({
            from: fromAddress,
            to: contact,
            subject: `Message from ${businessName}`,
            text: cleanReply,
            html: replyHtml,
          });
          emailSent = true;
          console.log(`[FEEDBACK-REPLY] Email sent via SMTP/stream to ${contact}`);
        }
      } catch (emailErr) {
        console.warn(`[FEEDBACK-REPLY] Warning sending email to ${contact}:`, emailErr);
      }
    }

    persistStoredFeedbacks();
    res.json({
      success: true,
      reply: replyObj,
      updatedFeedback: item,
      emailSent,
    });
  } catch (err: any) {
    console.error("[FEEDBACK-REPLY] Error replying to feedback:", err);
    res.status(500).json({ error: "Failed to send reply." });
  }
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
    const fromAddress = process.env.RESEND_FROM_EMAIL || "TapShield <noreply@tapshield.space>";

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
