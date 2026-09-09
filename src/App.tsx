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
  isProAccountEmail,
  checkAccountProStatus,
  getCanonicalUidForEmail,
} from "./lib/auth-service";
import type { AuthUserProfile, Business } from "./types";
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
  ExternalLink,
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
    checkoutUrl?: string;
  } | null>(null);

  // Subscription state: tracks if business owner has active access (false by default for new accounts)
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);

  // Check stored auth session expiration on app launch
  useEffect(() => {
    const session = getStoredAuthSession();
    if (session && session.expiresAt && Date.now() > session.expiresAt) {
      clearAuthSession();
      if (auth?.currentUser) {
        signOutUser().catch(() => {});
      }
      setCurrentUser(null);
    }
  }, []);

  // When signed in AND subscribed, transition from landing to dashboard
  useEffect(() => {
    if (currentUser && isSubscribed && currentView === "landing") {
      setCurrentView("dashboard");
    }
  }, [currentUser, isSubscribed, currentView]);

  // When an account that has an active subscription is detected, automatically close any subscription modal
  useEffect(() => {
    if (isSubscribed && isSubscriptionModalOpen) {
      setIsSubscriptionModalOpen(false);
    }
  }, [isSubscribed, isSubscriptionModalOpen]);

  // Sync business subscription status and business name
  useEffect(() => {
    async function loadSubStatus() {
      // If user is signed out, they do not have an active subscription
      if (!currentUser) {
        setIsSubscribed(false);
        return;
      }

      try {
        const isUserPro = isProAccountEmail(currentUser.email);
        if (isUserPro) {
          setIsSubscribed(true);
          setIsSubscriptionModalOpen(false);
        }

        const canonicalId = getCanonicalUidForEmail(currentUser.email, activeBusinessId);
        const biz = await fetchBusiness(canonicalId, currentUser.email);
        if (biz?.id && biz.id !== activeBusinessId) {
          setActiveBusinessId(biz.id);
        }
        if (biz?.businessName) {
          setCurrentBusinessName(biz.businessName);
        }

        let active = isUserPro || biz?.subscriptionStatus === "active" || (biz as any)?.isPro === true;

        // Also check live Stripe subscription directly if not marked active yet
        if (!active && currentUser) {
          try {
            const isPro = await checkAccountProStatus(canonicalId, currentUser.email);
            if (isPro) {
              active = true;
            }
          } catch {}
        }

        setIsSubscribed(active);
        if (active) {
          setIsSubscriptionModalOpen(false);
        }
      } catch (err) {
        console.warn("Could not load initial business profile:", err);
        const isPro = isProAccountEmail(currentUser?.email);
        setIsSubscribed(isPro);
        if (isPro) {
          setIsSubscriptionModalOpen(false);
        }
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
      const canonicalUid = getCanonicalUidForEmail(session.email, session.uid);
      const restoredUser: AuthUserProfile = {
        uid: canonicalUid,
        email: session.email,
        displayName: session.displayName,
        emailVerified: session.emailVerified ?? false,
        isDemo: false,
      };
      setCurrentUser(restoredUser);
      setActiveBusinessId(canonicalUid);
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

          let verified = false;
          if (isGoogleUser) {
            verified = true;
          } else if (session && session.emailVerified === false) {
            // Pending email verification code from recent signup or login
            verified = false;
          } else if (session && session.emailVerified === true) {
            // Already verified for the current active session
            verified = true;
          } else {
            // If user has not verified yet in this session, check if existing record was verified
            verified = Boolean(user.emailVerified);
            if (!verified && user.email) {
              try {
                verified = await checkEmailVerificationStatus(user.email, user.uid);
              } catch {
                // keep existing
              }
            }
          }

          const canonicalUid = getCanonicalUidForEmail(user.email, user.uid);
          const profile: AuthUserProfile = {
            uid: canonicalUid,
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
          setActiveBusinessId(canonicalUid);
        } else {
          // Check if we have an active valid stored session (e.g. Google preview auth)
          const session = getStoredAuthSession();
          if (session && Date.now() <= session.expiresAt && session.uid) {
            const canonicalUid = getCanonicalUidForEmail(session.email, session.uid);
            const restoredUser: AuthUserProfile = {
              uid: canonicalUid,
              email: session.email,
              displayName: session.displayName,
              emailVerified: session.emailVerified ?? false,
              isDemo: false,
            };
            setCurrentUser(restoredUser);
            setActiveBusinessId(canonicalUid);
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

      if (session?.clientSecret || session?.url || session?.checkoutUrl) {
        setEmbeddedSession({
          clientSecret: session.clientSecret || "",
          sessionId: session.sessionId,
          publishableKey: session.publishableKey,
          checkoutUrl: session.url || session.checkoutUrl,
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
    } catch (err) {
      console.warn("Sign out error:", err);
    }
    clearAuthSession();
    setCurrentUser(null);
    setIsSubscribed(false);
    setEmbeddedSession(null);
    setIsAuthModalOpen(false);
    setIsSubscriptionModalOpen(false);
    setActiveBusinessId("demo-cafe");
    setCurrentView("landing");
  };

  const handleUserAuthChange = (newUser: AuthUserProfile | null) => {
    if (!newUser) {
      handleSignOut();
    } else {
      setCurrentUser(newUser);
      saveAuthSession(newUser, true);
    }
  };

  // Standalone Customer Rating Page (/rate/[businessId]):
  // When an NFC card or QR code is scanned, or when opening the dedicated live card page in a new tab,
  // display a completely isolated, distraction-free layout with NO SaaS navbar or dashboard links.
  const isDirectRateRoute =
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/rate/") ||
      new URLSearchParams(window.location.search).has("rate") ||
      (currentView === "rate" && !currentUser));

  if (isDirectRateRoute) {
    return <NfcRatingPage businessId={activeBusinessId} isOwnerPreview={false} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Universal Flow Switcher Bar */}
      <nav
        aria-label="Demo flow navigation"
        className="bg-[#0F0F0F] text-stone-300 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between border-b border-white/10 shadow-sm z-40 gap-2"
      >
        <div
          onClick={() => {
            if (currentUser) {
              setCurrentView("dashboard");
            } else {
              setCurrentView("landing");
            }
          }}
          className="flex items-center gap-2.5 cursor-pointer"
        >
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

        {/* View Switcher Tabs: when subscribed, only Dashboard and Customer View are shown */}
        <div className="flex items-center gap-1 bg-[#161616] p-1 rounded-lg border border-white/10">
          {(!currentUser || !isSubscribed) && (
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
          )}

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
            onClick={() => {
              const bizId = currentUser ? currentUser.uid : activeBusinessId;
              setActiveBusinessId(bizId);
              setCurrentView("rate");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              currentView === "rate"
                ? "bg-white text-black shadow-xs font-black"
                : "text-stone-400 hover:text-white"
            }`}
            title="Interactive in-dashboard customer flow preview"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Customer Preview</span>
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
            onUserAuthChange={handleUserAuthChange}
            onSignOut={handleSignOut}
            onSubscribe={handleSubscribe}
            isCheckingOut={isCheckingOut}
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
              onUserAuthChange={handleUserAuthChange}
              onSignOut={handleSignOut}
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
            businessId={currentUser ? currentUser.uid : activeBusinessId}
            isOwnerPreview={Boolean(currentUser)}
            onBackToDashboard={() => setCurrentView("dashboard")}
          />
        )}
      </main>

      {/* Global Embedded Stripe Checkout Modal */}
      {embeddedSession && (
        <StripeEmbeddedCheckoutModal
          clientSecret={embeddedSession.clientSecret}
          sessionId={embeddedSession.sessionId}
          publishableKey={embeddedSession.publishableKey}
          checkoutUrl={embeddedSession.checkoutUrl}
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
        onAuthSuccess={async (user, businessName) => {
          setCurrentUser(user);
          setActiveBusinessId(user.uid);

          const canonicalUid = getCanonicalUidForEmail(user.email, user.uid);
          user.uid = canonicalUid;
          // Check if this user account has Pro or an active subscription
          const isUserPro = isProAccountEmail(user.email) || (await checkAccountProStatus(canonicalUid, user.email));

          // Fetch existing business profile FIRST to identify existing business and subscription status
          let existingBiz: Business | null = null;
          try {
            existingBiz = await fetchBusiness(canonicalUid, user.email || undefined);
          } catch {}

          const hasActiveSubscription =
            isUserPro ||
            existingBiz?.subscriptionStatus === "active" ||
            (existingBiz as any)?.isPro === true;

          const resolvedBizId = existingBiz?.id || canonicalUid;
          setActiveBusinessId(resolvedBizId);
          if (existingBiz?.businessName) {
            setCurrentBusinessName(existingBiz.businessName);
          } else if (businessName) {
            setCurrentBusinessName(businessName);
          }

          // Only update business profile if businessName is provided and different, never downgrading subscription
          if (businessName && (!existingBiz || existingBiz.businessName !== businessName)) {
            try {
              await saveBusinessProfile({
                id: resolvedBizId,
                businessName,
                subscriptionStatus: hasActiveSubscription ? "active" : (existingBiz?.subscriptionStatus || "inactive"),
              });
            } catch (err) {
              console.warn("Could not save initial business name:", err);
            }
          }

          setIsSubscribed(hasActiveSubscription);

          // CRITICAL: NEVER show subscription modal when an account logs in.
          // Especially for active subscribers, this modal must remain closed.
          setIsSubscriptionModalOpen(false);

          // Navigate directly to dashboard
          setCurrentView("dashboard");
        }}
      />

      {/* Subscription Signup Modal (prompts for business name before checkout) */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        currentUser={currentUser}
        isSubscribed={isSubscribed}
        initialPlan={subscriptionPlan}
        initialBusinessName={currentBusinessName}
        onConfirmSubscription={handleConfirmSubscription}
        onAuthSuccess={async (user, businessName) => {
          const canonicalUid = getCanonicalUidForEmail(user.email, user.uid);
          user.uid = canonicalUid;
          setCurrentUser(user);

          const isUserPro = isProAccountEmail(user.email) || (await checkAccountProStatus(canonicalUid, user.email));
          let existingBiz: Business | null = null;
          try {
            existingBiz = await fetchBusiness(canonicalUid, user.email || undefined);
          } catch {}

          const hasActive =
            isUserPro ||
            existingBiz?.subscriptionStatus === "active" ||
            (existingBiz as any)?.isPro === true;

          const resolvedBizId = existingBiz?.id || canonicalUid;
          setActiveBusinessId(resolvedBizId);
          if (existingBiz?.businessName) {
            setCurrentBusinessName(existingBiz.businessName);
          } else if (businessName) {
            setCurrentBusinessName(businessName);
          }

          if (hasActive) {
            setIsSubscribed(true);
            setIsSubscriptionModalOpen(false);
            setCurrentView("dashboard");
            return;
          }

          if (businessName) {
            try {
              await saveBusinessProfile({
                id: existingBiz?.id || user.uid,
                businessName,
                subscriptionStatus: existingBiz?.subscriptionStatus || "inactive",
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
