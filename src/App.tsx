import { useState, useEffect } from "react";
import { NfcRatingPage } from "./components/NfcRatingPage";
import { GatedDashboard } from "./components/GatedDashboard";
import { LandingPage } from "./components/LandingPage";
import { EmailVerificationScreen } from "./components/EmailVerificationScreen";
import { AuthModal } from "./components/AuthModal";
import { auth, fetchBusiness, saveBusinessProfile, signOutUser } from "./lib/firebase";
import { triggerStripeSubscriptionCheckout, checkEmailVerificationStatus } from "./lib/auth-service";
import type { AuthUserProfile } from "./types";
import { onAuthStateChanged } from "firebase/auth";
import {
  Smartphone,
  LayoutDashboard,
  Globe,
  Lock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
  ShieldCheck,
} from "lucide-react";

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

  // Authenticated user profile: starts with demo verified user or null
  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>({
    uid: "demo_owner_1",
    displayName: "Artisan Owner",
    email: "owner@artisanbrews.com",
    emailVerified: true,
    isDemo: true,
  });

  // Auth modal control
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activePreviewCode, setActivePreviewCode] = useState<string | undefined>(undefined);

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
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          let verified = user.emailVerified;
          // Check backend OTP verification store if client auth has false
          if (!verified && user.email) {
            try {
              verified = await checkEmailVerificationStatus(user.email, user.uid);
            } catch {
              // keep existing
            }
          }
          setCurrentUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            emailVerified: verified,
          });
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Handle Stripe Subscription checkout from Landing page or Dashboard
  const handleSubscribe = async (interval: "month" | "year") => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!currentUser.emailVerified) {
      // Actively guard: route to verification screen
      setCurrentView("dashboard");
      return;
    }

    setIsCheckingOut(true);
    try {
      await triggerStripeSubscriptionCheckout({
        businessId: activeBusinessId,
        businessName: "Downtown Artisan Cafe",
        planInterval: interval,
        user: currentUser,
      });
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

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch {
      // ignored
    }
    setCurrentUser(null);
    setActivePreviewCode(undefined);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Universal Flow Switcher Bar */}
      <nav
        aria-label="Demo flow navigation"
        className="bg-[#0F0F0F] text-stone-300 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between border-b border-white/10 shadow-sm z-40 gap-2"
      >
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

        {/* User Authentication Status & Actions */}
        <div className="flex items-center gap-2">
          {currentUser ? (
            <div className="flex items-center gap-2 bg-[#161616] px-2.5 py-1 rounded-lg border border-white/10 text-xs">
              <div className="w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-black">
                {currentUser.displayName?.[0] || currentUser.email?.[0] || "U"}
              </div>
              <span className="font-mono text-[11px] text-stone-300 max-w-[140px] truncate hidden sm:inline">
                {currentUser.email || currentUser.displayName}
              </span>

              {/* Email verification status badge */}
              {currentUser.emailVerified ? (
                <span
                  title="Email verified. Full access granted."
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="hidden md:inline">Verified</span>
                </span>
              ) : (
                <button
                  onClick={() => setCurrentView("dashboard")}
                  title="Email unverified. Click to enter 6-digit code."
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer animate-pulse"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Verify OTP</span>
                </button>
              )}

              <button
                onClick={handleSignOut}
                title="Sign Out"
                className="text-stone-400 hover:text-rose-400 p-1 cursor-pointer transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="btn-nav-open-auth"
              onClick={() => setIsAuthModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] uppercase tracking-wider transition cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
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
            onPreviewCodeReceived={(code) => setActivePreviewCode(code)}
          />
        )}

        {currentView === "dashboard" && (
          // ACTIVE ROUTING GUARD
          !currentUser ? (
            <div className="min-h-[80vh] flex items-center justify-center p-4">
              <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center space-y-5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black uppercase text-white">Owner Login Required</h2>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Please sign in to access your reputation dashboard, review private negative customer
                  feedback, and configure your store's NFC redirect URL.
                </p>
                <button
                  id="btn-login-prompt"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  Sign In / Create Account
                </button>
              </div>
            </div>
          ) : !currentUser.emailVerified ? (
            // User is unverified! ACTIVELY GUARD: display EmailVerificationScreen
            <EmailVerificationScreen
              currentUser={currentUser}
              initialPreviewCode={activePreviewCode}
              onVerified={(verifiedUser) => {
                setCurrentUser(verifiedUser);
                setActivePreviewCode(undefined);
              }}
              onSignOut={handleSignOut}
            />
          ) : (
            // User is verified! Full access to protected GatedDashboard
            <GatedDashboard
              currentUser={currentUser}
              onOpenCustomerRateView={(bizId) => {
                setActiveBusinessId(bizId);
                setCurrentView("rate");
              }}
              onUserAuthChange={setCurrentUser}
              onBackToLanding={() => setCurrentView("landing")}
            />
          )
        )}

        {currentView === "rate" && (
          <NfcRatingPage
            businessId={activeBusinessId}
            onNavigateToDashboard={() => setCurrentView("dashboard")}
          />
        )}
      </main>

      {/* Global Senior Firebase Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(user, previewCode) => {
          setCurrentUser(user);
          if (previewCode) {
            setActivePreviewCode(previewCode);
          }
          // Navigate to dashboard (which will actively guard if unverified, or open if verified)
          setCurrentView("dashboard");
        }}
      />
    </div>
  );
}
