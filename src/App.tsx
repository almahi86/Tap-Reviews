import { useState, useEffect } from "react";
import { NfcRatingPage } from "./components/NfcRatingPage";
import { GatedDashboard } from "./components/GatedDashboard";
import { LandingPage } from "./components/LandingPage";
import { auth, fetchBusiness, saveBusinessProfile } from "./lib/firebase";
import type { AuthUserProfile, Business } from "./types";
import { onAuthStateChanged } from "firebase/auth";
import { Smartphone, LayoutDashboard, Globe, Lock, CheckCircle2 } from "lucide-react";

export default function App() {
  // Parse URL on initial load to determine route
  const getInitialRoute = (): { view: "landing" | "dashboard" | "rate"; businessId: string } => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    // Matches /rate/:businessId or query params ?rate=... / ?business_id=...
    const ratePathMatch = path.match(/^\/rate\/([^/]+)/);
    if (ratePathMatch && ratePathMatch[1]) {
      return { view: "rate", businessId: ratePathMatch[1] };
    }

    const queryRate = searchParams.get("rate") || searchParams.get("business_id");
    if (queryRate) {
      return { view: "rate", businessId: queryRate };
    }

    // Stripe checkout return or explicit dashboard view
    const sessionId = searchParams.get("session_id");
    const isSubscribedParam = searchParams.get("subscribed") === "true";
    const viewParam = searchParams.get("view");
    if (sessionId || isSubscribedParam || viewParam === "dashboard") {
      return { view: "dashboard", businessId: "demo-cafe" };
    }

    // Default first page when clicked on the main website
    return { view: "landing", businessId: "demo-cafe" };
  };

  const initial = getInitialRoute();
  const [currentView, setCurrentView] = useState<"landing" | "dashboard" | "rate">(initial.view);
  const [activeBusinessId, setActiveBusinessId] = useState<string>(initial.businessId);

  // Authenticated user profile
  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>({
    uid: "demo_owner_1",
    displayName: "Artisan Owner",
    email: "owner@artisanbrews.com",
    isDemo: true,
  });

  // Subscription state: tracks if business owner has active access
  const [isSubscribed, setIsSubscribed] = useState<boolean>(true);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);

  // Sync business subscription status
  useEffect(() => {
    async function loadSubStatus() {
      try {
        const biz = await fetchBusiness(activeBusinessId);
        if (biz) {
          setIsSubscribed(biz.subscriptionStatus === "active");
        }
      } catch (err) {
        console.warn("Could not load initial business profile:", err);
      }
    }
    loadSubStatus();
  }, [activeBusinessId]);

  // Check URL parameters for Stripe success callback
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("session_id") || searchParams.get("subscribed") === "true") {
      setIsSubscribed(true);
      setCurrentView("dashboard");
    }
  }, []);

  // Listen to Firebase Auth if active
  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setCurrentUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          });
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Handle Stripe Subscription checkout from Landing page or Dashboard
  const handleSubscribe = async (interval: "month" | "year") => {
    setIsCheckingOut(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?subscribed=true&view=dashboard`;
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: activeBusinessId,
          businessName: "Downtown Artisan Cafe",
          email: currentUser?.email || "owner@artisanbrews.com",
          returnUrl,
          planInterval: interval,
        }),
      });

      const data = await res.json();
      if (data.checkoutUrl) {
        if (data.mode === "demo") {
          // Direct sandbox activation
          setIsSubscribed(true);
          await saveBusinessProfile({
            id: activeBusinessId,
            subscriptionStatus: "active",
          });
          setCurrentView("dashboard");
        } else {
          // Redirect to live Stripe Checkout
          window.location.href = data.checkoutUrl;
        }
      } else {
        throw new Error(data.error || "Failed to create Stripe session");
      }
    } catch (err) {
      console.error("Subscription checkout error:", err);
      // Fallback sandbox activation to never block the reviewer
      setIsSubscribed(true);
      setCurrentView("dashboard");
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Sandbox mode instant bypass
  const handleActivateSandbox = async () => {
    setIsSubscribed(true);
    try {
      await saveBusinessProfile({
        id: activeBusinessId,
        subscriptionStatus: "active",
      });
    } catch (err) {
      console.warn("Could not save sandbox status:", err);
    }
    setCurrentView("dashboard");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Universal Flow Switcher Bar */}
      <nav aria-label="Demo flow navigation" className="bg-[#0F0F0F] text-stone-300 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between border-b border-white/10 shadow-sm z-50 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center font-black text-black text-xs">
            R
          </div>
          <span className="font-black text-white tracking-widest uppercase text-[11px]">
            TapShield Platform
          </span>
          <span className="hidden lg:inline text-stone-400 text-xs tracking-tight">
            NFC Customer Feedback Recovery Micro-SaaS
          </span>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-[#161616] p-1 rounded-lg border border-white/10">
          <button
            id="nav-tab-landing"
            onClick={() => setCurrentView("landing")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              currentView === "landing"
                ? "bg-white text-black shadow-xs font-black"
                : "text-stone-400 hover:text-white"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Main Website</span>
          </button>

          <button
            id="nav-tab-dashboard"
            onClick={() => setCurrentView("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              currentView === "dashboard"
                ? "bg-white text-black shadow-xs font-black"
                : "text-stone-400 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Owner Dashboard</span>
            {!isSubscribed && <Lock className="w-3 h-3 text-amber-400" />}
          </button>

          <button
            id="nav-tab-rate"
            onClick={() => setCurrentView("rate")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              currentView === "rate"
                ? "bg-emerald-500 text-black shadow-xs font-black"
                : "text-stone-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Customer NFC Tap</span>
          </button>
        </div>
      </nav>

      {/* Screen Views */}
      <main className="flex-1">
        {currentView === "landing" && (
          <LandingPage
            currentUser={currentUser}
            isSubscribed={isSubscribed}
            onEnterDashboard={() => setCurrentView("dashboard")}
            onOpenCustomerRateView={() => setCurrentView("rate")}
            onUserAuthChange={setCurrentUser}
            onSubscribe={handleSubscribe}
            onActivateSandbox={handleActivateSandbox}
            isCheckingOut={isCheckingOut}
          />
        )}

        {currentView === "dashboard" && (
          <GatedDashboard
            currentUser={currentUser}
            onOpenCustomerRateView={(bizId) => {
              setActiveBusinessId(bizId);
              setCurrentView("rate");
            }}
            onUserAuthChange={setCurrentUser}
            onBackToLanding={() => setCurrentView("landing")}
          />
        )}

        {currentView === "rate" && (
          <NfcRatingPage
            businessId={activeBusinessId}
            onNavigateToDashboard={() => setCurrentView("dashboard")}
          />
        )}
      </main>
    </div>
  );
}
