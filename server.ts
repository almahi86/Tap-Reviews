import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import dotenv from "dotenv";

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
    timestamp: new Date().toISOString(),
  });
});

// Create Stripe Checkout Session
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { businessId, businessName, email, returnUrl, planInterval } = req.body;
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

    const priceId = interval === "year" ? process.env.STRIPE_YEARLY_PRICE_ID : process.env.STRIPE_PRICE_ID;

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
      customer_email: email || undefined,
      client_reference_id: businessId,
      line_items: [lineItem],
      metadata: {
        businessId: businessId || "",
        businessName: businessName || "",
        planInterval: interval,
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
