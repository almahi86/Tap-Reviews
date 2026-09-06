import { useState, useEffect } from "react";
import { NfcRatingPage } from "./components/NfcRatingPage";
import { GatedDashboard } from "./components/GatedDashboard";
import { LandingPage } from "./components/LandingPage";
import { DashboardPreviewSection } from "./components/DashboardPreviewSection";
import { EmailVerificationScreen } from "./components/EmailVerificationScreen";
import { AuthModal } from "./components/AuthModal";
import { SubscriptionModal } from "./components/SubscriptionModal";
import { StripeEmbeddedCheckoutModal } from "./components/StripeEmbeddedCheckout";
import { ReturnPage } from "./components/ReturnPage";
import { ContactModal } from "./components/ContactModal";
import { auth, fetchBusiness, saveBusinessProfile, signOutUser } from "./lib/firebase";
import {
  createEmbeddedCheckoutSession,
  triggerStripeSubscriptionCheckout,
  checkEmailVerificationStatus,
  getStoredAuthSession,
  saveAuthSession,
  clearAuthSession,
} from "./lib/auth-service";
import type { AuthUserProfile } from "./types";
import { onAuthStateChanged } from "firebase/auth";
import {
  Smartphone,
  LayoutDashboard,
  Globe,
  Lock,
  LogOut,
  User,
  Shield,
  ShieldCheck,
  Mail,
} from "lucide-react";

export default function App() {
  // Parse URL on initial load to determine route
  const getInitialRoute = (): { view: "landing" | "dashboard" | "rate" | "return"; businessId: string } => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    // Return page for Stripe Embedded Checkout
    if (path.startsWith("/return") || searchParams.has("session_id")) {
      const bizId = searchParams.get("business_id") || "demo-cafe";
      return { view: "return", businessId: bizId };
    }

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
    const isSubscribedParam = searchParams.get("subscribed") === "true";
    const viewParam = searchParams.get("view");
    if (isSubscribedParam || viewParam === "dashboard") {
      return { view: "dashboard", businessId: "demo-cafe" };
    }

    // Default first page when clicked on the main website
    return { view: "landing", businessId: "demo-cafe" };
  };

  const initial = getInitialRoute();
  const [currentView, setCurrentView] = useState<"landing" | "dashboard" | "rate" | "return">(initial.view);
  const [activeBusinessId, setActiveBusinessId] = useState<string>(initial.businessId);

  // Authenticated user profile: starts as null (no automatic demo account)
  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>(null);

  // Auth modal control
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activePreviewCode, setActivePreviewCode] = useState<string | undefined>(undefined);

  // Subscription modal control (prompts for business name before checkout)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<"month" | "year">("year");
  const [currentBusinessName, setCurrentBusinessName] = useState<string>("");
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // Embedded Stripe checkout modal state
  const [embeddedSession, setEmbeddedSession] = useState<{
    clientSecret: string;
    sessionId: string;
    publishableKey?: string;
  } | null>(null);

  // Subscription state: tracks if business owner has active access (false by default for new accounts)
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);

  // Check stored auth session expiration on app launch
  useEffect(() => {
    const session = getStoredAuthSession();
    if (!session) {
      clearAuthSession();
      if (auth?.currentUser) {
        signOutUser().catch(() => {});
      }
      setCurrentUser(null);
    }
  }, []);

  // Sync business subscription status and business name
  useEffect(() => {
    async function loadSubStatus() {
      try {
        const biz = await fetchBusiness(activeBusinessId, currentUser?.email || undefined);
        let active = biz?.subscriptionStatus === "active";

        // Also check live Stripe subscription directly if not marked active yet
        if (!active && currentUser) {
          try {
            const res = await fetch(
              `/api/subscription-status?email=${encodeURIComponent(currentUser.email || "")}&userId=${encodeURIComponent(currentUser.uid)}&businessId=${encodeURIComponent(activeBusinessId)}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data.isPro || data.status === "active") {
                active = true;
              }
            }
          } catch {}
        }

        setIsSubscribed(active);
        if (biz?.businessName) {
          setCurrentBusinessName(biz.businessName);
        }
      } catch (err) {
        console.warn("Could not load initial business profile:", err);
        setIsSubscribed(activeBusinessId === "demo-cafe");
      }
    }
    loadSubStatus();
  }, [activeBusinessId, currentUser]);

  // Check URL parameters for Stripe success callback
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("session_id") || searchParams.get("subscribed") === "true") {
      setIsSubscribed(true);
      setCurrentView("dashboard");
    }
  }, []);

  // Check and restore active 7-day session on mount
  useEffect(() => {
    const session = getStoredAuthSession();
    if (session && Date.now() <= session.expiresAt && session.uid) {
      const restoredUser: AuthUserProfile = {
        uid: session.uid,
        email: session.email,
        displayName: session.displayName,
        emailVerified: session.emailVerified ?? false,
        isDemo: false,
      };
      setCurrentUser(restoredUser);
      setActiveBusinessId(session.uid);
    }
  }, []);

  // Listen to Firebase Auth if active with 7-day session check
  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          // Check if session has expired beyond 7 days
          const session = getStoredAuthSession();
          if (session && Date.now() > session.expiresAt) {
            console.log("Auth session expired after 7 days, signing out user.");
            await signOutUser().catch(() => {});
            clearAuthSession();
            setCurrentUser(null);
            return;
          }

          const isGoogleUser =
            user.providerData?.some((p) => p.providerId === "google.com") ||
            user.uid.startsWith("google_");

          let verified = isGoogleUser || Boolean(user.emailVerified);
          // Check backend verification store if not verified yet
          if (!verified && user.email) {
            try {
              verified = await checkEmailVerificationStatus(user.email, user.uid);
            } catch {
              // keep existing
            }
          }

          const profile: AuthUserProfile = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            emailVerified: verified,
            isDemo: false,
          };

          // If no stored session, initialize 7-day session by default
          if (!session) {
            saveAuthSession(profile, true);
          }

          setCurrentUser(profile);
          setActiveBusinessId(user.uid);
        } else {
          // Check if we have an active valid stored session (e.g. Google preview auth)
          const session = getStoredAuthSession();
          if (session && Date.now() <= session.expiresAt && session.uid) {
            const restoredUser: AuthUserProfile = {
              uid: session.uid,
              email: session.email,
              displayName: session.displayName,
              emailVerified: session.emailVerified ?? false,
              isDemo: false,
            };
            setCurrentUser(restoredUser);
            setActiveBusinessId(session.uid);
          } else {
            clearAuthSession();
            setCurrentUser(null);
          }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Handle subscription initiation from Landing page or Dashboard: Opens Subscription Modal to capture business name
  const handleSubscribe = async (interval: "month" | "year") => {
    setSubscriptionPlan(interval);
    setIsSubscriptionModalOpen(true);
  };

  // Called when business confirms their name and selected plan
  const handleConfirmSubscription = async ({
    businessName,
    interval,
  }: {
    businessName: string;
    interval: "month" | "year";
  }) => {
    setIsCheckingOut(true);
    try {
      const trimmedName = businessName.trim();
      const bizId = currentUser ? currentUser.uid : activeBusinessId;
      setActiveBusinessId(bizId);
      setCurrentBusinessName(trimmedName);

      // Save business name to Firestore and local API as inactive until paid
      await saveBusinessProfile({
        id: bizId,
        businessName: trimmedName,
        subscriptionStatus: "inactive",
      });

      const session = await createEmbeddedCheckoutSession({
        businessId: bizId,
        businessName: trimmedName,
        planInterval: interval,
        user: currentUser,
      });

      if (session?.clientSecret) {
        setEmbeddedSession({
          clientSecret: session.clientSecret,
          sessionId: session.sessionId,
          publishableKey: session.publishableKey,
        });
      }
    } catch (err: any) {
      console.error("Subscription checkout error:", err);
      setIsCheckingOut(false);
      const errorMsg = err?.message || "Failed to connect to checkout";
      window.alert(errorMsg);
      // Keep view on dashboard so user can review the payment gate and retry
      setCurrentView("dashboard");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch {
      // ignored
    }
    clearAuthSession();
    setCurrentUser(null);
    setActivePreviewCode(undefined);
    setActiveBusinessId("demo-cafe");
    setCurrentView("landing");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Universal Flow Switcher Bar */}
      <nav
        aria-label="Demo flow navigation"
        className="bg-[#0F0F0F] text-stone-300 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between border-b border-white/10 shadow-sm z-40 gap-2"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center text-black">
            <Shield className="w-3.5 h-3.5 text-black" fill="currentColor" />
          </div>
          <span className="font-black text-white tracking-widest uppercase text-[11px]">
            TapShield
          </span>
          <span className="hidden lg:inline text-stone-400 text-xs tracking-tight">
            Customer Feedback & Google Review Routing
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
            <span>Overview</span>
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
            <span>Dashboard</span>
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
            <span>Customer View</span>
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

              {isSubscribed && (
                <span
                  id="badge-nav-pro"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase tracking-wider shadow-sm"
                  title="TapShield Pro Active Subscriber"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  PRO
                </span>
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

          {/* Contact Support Button */}
          <button
            id="btn-nav-contact"
            onClick={() => setIsContactModalOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-stone-300 hover:text-white text-[11px] font-mono transition cursor-pointer"
            title="Contact TapShield Support"
          >
            <Mail className="w-3.5 h-3.5 text-emerald-400" />
            <span>Contact</span>
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
            isCheckingOut={isCheckingOut}
            onPreviewCodeReceived={(code) => setActivePreviewCode(code)}
          />
        )}

        {currentView === "dashboard" && (
          // ACTIVE ROUTING GUARD
          !currentUser ? (
            <DashboardPreviewSection
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onExploreDemo={() => {
                const demoUser: AuthUserProfile = {
                  uid: "demo-cafe",
                  email: "demo@artisanbrews.com",
                  displayName: "Artisan Brews (Demo)",
                  emailVerified: true,
                  isDemo: true,
                };
                setCurrentUser(demoUser);
                setActiveBusinessId("demo-cafe");
              }}
            />
          ) : !currentUser.emailVerified ? (
            // User is unverified! ACTIVELY GUARD: display EmailVerificationScreen
            <EmailVerificationScreen
              currentUser={currentUser}
              onVerified={(verifiedUser) => {
                setCurrentUser(verifiedUser);
                saveAuthSession(verifiedUser, true);
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
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
            />
          )
        )}

        {currentView === "return" && (
          <ReturnPage
            onGoToDashboard={() => {
              setIsSubscribed(true);
              setCurrentView("dashboard");
            }}
            onGoToRating={(bizId) => {
              setActiveBusinessId(bizId);
              setCurrentView("rate");
            }}
          />
        )}

        {currentView === "rate" && (
          <NfcRatingPage
            businessId={activeBusinessId}
            onNavigateToDashboard={() => setCurrentView("dashboard")}
          />
        )}
      </main>

      {/* Global Embedded Stripe Checkout Modal */}
      {embeddedSession && (
        <StripeEmbeddedCheckoutModal
          clientSecret={embeddedSession.clientSecret}
          sessionId={embeddedSession.sessionId}
          publishableKey={embeddedSession.publishableKey}
          businessName={currentBusinessName}
          onClose={() => setEmbeddedSession(null)}
          onComplete={async () => {
            setEmbeddedSession(null);
            setIsSubscribed(true);
            const bizId = currentUser ? currentUser.uid : activeBusinessId;
            try {
              await saveBusinessProfile({
                id: bizId,
                businessName: currentBusinessName || "My Business",
                subscriptionStatus: "active",
              });
            } catch (err) {
              console.warn("Could not activate subscription locally:", err);
            }
            setCurrentView("dashboard");
          }}
        />
      )}

      {/* Global Senior Firebase Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={async (user, previewCode, businessName) => {
          setCurrentUser(user);
          setActiveBusinessId(user.uid);
          if (previewCode) {
            setActivePreviewCode(previewCode);
          }
          if (businessName) {
            setCurrentBusinessName(businessName);
            try {
              await saveBusinessProfile({
                id: user.uid,
                businessName,
                subscriptionStatus: "inactive",
              });
            } catch (err) {
              console.warn("Could not save initial business name:", err);
            }
          }

          // Verify if this account already has an active paid subscription
          let hasActiveSubscription = false;
          try {
            const biz = await fetchBusiness(user.uid);
            hasActiveSubscription = biz?.subscriptionStatus === "active";
          } catch {
            hasActiveSubscription = false;
          }

          setIsSubscribed(hasActiveSubscription);

          // If not paid and verified, trigger the subscription payment modal
          if (!hasActiveSubscription && user.emailVerified) {
            setIsSubscriptionModalOpen(true);
          }

          // Navigate to dashboard (which renders the subscription paywall if inactive)
          setCurrentView("dashboard");
        }}
      />

      {/* Subscription Signup Modal (prompts for business name before checkout) */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        currentUser={currentUser}
        initialPlan={subscriptionPlan}
        initialBusinessName={currentBusinessName}
        onConfirmSubscription={handleConfirmSubscription}
        onAuthSuccess={async (user, previewCode, businessName) => {
          setCurrentUser(user);
          setActiveBusinessId(user.uid);
          if (previewCode) {
            setActivePreviewCode(previewCode);
          }
          if (businessName) {
            setCurrentBusinessName(businessName);
            try {
              await saveBusinessProfile({
                id: user.uid,
                businessName,
                subscriptionStatus: "inactive",
              });
            } catch (err) {
              console.warn("Could not save initial business name on subscription auth:", err);
            }
          }
        }}
      />

      {/* Contact Us Support Modal */}
      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        initialName={currentUser?.displayName || ""}
        initialEmail={currentUser?.email || ""}
      />
    </div>
  );
}
