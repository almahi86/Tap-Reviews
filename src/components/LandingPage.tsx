import { useState } from "react";
import {
  Shield,
  Smartphone,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Check,
  ArrowRight,
  TrendingUp,
  Lock,
  BarChart3,
  MapPin,
  Radio,
  Star,
  Zap,
  HelpCircle,
  CreditCard,
  User,
  LogOut,
  ShieldCheck,
  Mail,
} from "lucide-react";
import type { AuthUserProfile } from "../types";
import { AuthModal } from "./AuthModal";
import { ContactForm } from "./ContactForm";

interface LandingPageProps {
  currentUser: AuthUserProfile | null;
  isSubscribed: boolean;
  onEnterDashboard: () => void;
  onOpenCustomerRateView: () => void;
  onUserAuthChange: (user: AuthUserProfile | null) => void;
  onSignOut?: () => void;
  onSubscribe: (interval: "month" | "year") => Promise<void>;
  onActivateSandbox?: () => void;
  isCheckingOut: boolean;
}

export function LandingPage({
  currentUser,
  isSubscribed,
  onEnterDashboard,
  onOpenCustomerRateView,
  onUserAuthChange,
  onSignOut,
  onSubscribe,
  isCheckingOut,
}: LandingPageProps) {
  const [billingCycle, setBillingCycle] = useState<"month" | "year">("year");
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <div id="landing-page" className="min-h-screen bg-[#0A0A0A] text-white selection:bg-emerald-500 selection:text-black">
      {/* Header / Nav */}
      <header className="sticky top-0 z-40 bg-[#0F0F0F]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-black shadow-lg shadow-emerald-500/20">
              <Shield className="w-5 h-5 text-black" fill="currentColor" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-white uppercase text-base">
                  TapShield
                </span>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block tracking-tight font-medium">
                Customer Feedback & Google Review Routing
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-mono uppercase tracking-wider text-stone-300">
            <a href="#how-it-works" className="hover:text-emerald-400 transition">
              How It Works
            </a>
            <a href="#features" className="hover:text-emerald-400 transition">
              Features
            </a>
            <a href="#pricing" className="hover:text-emerald-400 transition">
              Pricing
            </a>
            <a href="#contact" className="hover:text-emerald-400 transition">
              Contact Us
            </a>
            <button
              onClick={onOpenCustomerRateView}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Test Customer View</span>
            </button>
          </nav>

          <div className="flex items-center gap-3">
            {currentUser && isSubscribed ? (
              <button
                id="btn-nav-dashboard"
                onClick={onEnterDashboard}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-black font-black uppercase text-xs tracking-wider hover:bg-emerald-400 transition cursor-pointer shadow-md"
              >
                <span>Access Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSubscribe(billingCycle)}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-black uppercase text-xs tracking-wider hover:bg-emerald-400 transition cursor-pointer"
                >
                  Subscribe to Access
                </button>
                <button
                  onClick={() => {
                    if (onSignOut) {
                      onSignOut();
                    } else {
                      onUserAuthChange(null);
                    }
                  }}
                  title="Sign Out"
                  className="p-2 text-stone-400 hover:text-white cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  id="btn-open-login"
                  onClick={() => setShowLoginModal(true)}
                  className="px-3.5 py-2 rounded-lg border border-white/20 text-stone-300 hover:text-white hover:border-white/40 font-mono text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  Log In
                </button>
                <a
                  href="#pricing"
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-black uppercase text-xs tracking-wider hover:bg-emerald-400 transition cursor-pointer shadow"
                >
                  Get Started
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-4 sm:px-8 border-b border-white/10 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono uppercase tracking-widest">
                <Shield className="w-3.5 h-3.5" />
                <span>Customer Feedback System</span>
              </div>

              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">
                More Good Reviews.<br />
                <span className="text-emerald-400">More Potential</span><br />
                Customers.
              </h1>

              <p className="text-base sm:text-lg text-stone-300 max-w-xl font-normal leading-relaxed">
                Place NFC stands or QR codes at your checkout counters and tables. Customers tap with
                their phone to leave a Google review in seconds—increasing your number of good reviews,
                boosting your local ranking, and attracting more potential customers, while keeping
                concerns in your private management inbox.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <a
                  href="#pricing"
                  id="hero-cta-pricing"
                  className="px-7 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-98"
                >
                  <span>View Pricing</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <button
                  id="hero-simulate-tap"
                  onClick={onOpenCustomerRateView}
                  className="px-6 py-4 rounded-lg bg-[#161616] hover:bg-[#202020] border border-white/20 text-white font-mono uppercase text-xs tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Test Customer View</span>
                </button>
              </div>

              {/* Sign In Prompt for Existing Owners */}
              {!currentUser && (
                <div className="pt-2 flex items-center gap-2 text-xs font-mono text-stone-400">
                  <span>Already have an account?</span>
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider underline cursor-pointer"
                  >
                    Sign in to Dashboard →
                  </button>
                </div>
              )}
            </div>

            {/* Visual Phone / NFC Simulator Preview */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-sm bg-[#161616] rounded-2xl border-2 border-white/20 p-6 shadow-2xl relative">
                <div className="absolute -top-3 right-6 bg-emerald-500 text-black px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                  Customer Flow
                </div>

                <div className="text-center space-y-4 pt-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto font-black text-xl">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>

                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                      In-Store NFC / QR Link
                    </div>
                    <div className="text-xl font-black uppercase text-white mt-1">
                      How was your visit?
                    </div>
                  </div>

                  {/* 2 Big Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-4 rounded-xl bg-emerald-500 text-black text-center space-y-1">
                      <ThumbsUp className="w-5 h-5 mx-auto" />
                      <div className="font-black text-sm uppercase">Like</div>
                      <div className="text-[9px] font-mono uppercase font-bold text-black/80">
                        → Google Reviews
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#222222] border border-white/10 text-white text-center space-y-1">
                      <ThumbsDown className="w-5 h-5 mx-auto text-rose-400" />
                      <div className="font-black text-sm uppercase">Dislike</div>
                      <div className="text-[9px] font-mono uppercase text-rose-400">
                        → Private Inbox
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 pt-2 border-t border-white/10 flex items-center justify-between">
                    <span>Routing</span>
                    <strong className="text-emerald-400">Positive → Google | Concerns → Private</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Capabilities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-16 pt-8 border-t border-white/10">
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-lg font-black text-emerald-400 uppercase">More Good Reviews</div>
              <div className="text-xs font-mono text-stone-400 mt-1">
                Turn happy in-store visits into 5-star Google reviews in seconds
              </div>
            </div>
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-lg font-black text-white uppercase">More Customers</div>
              <div className="text-xs font-mono text-stone-400 mt-1">
                Higher Google rating & review volume attract new local buyers
              </div>
            </div>
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-lg font-black text-white uppercase">Private Feedback</div>
              <div className="text-xs font-mono text-stone-400 mt-1">
                Customer concerns go straight to management before they leave
              </div>
            </div>
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-lg font-black text-cyan-400 uppercase">Fast NFC Stand Tap</div>
              <div className="text-xs font-mono text-stone-400 mt-1">
                Instant phone tap with no app download or account needed
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 1: WHAT THE APP DOES */}
      <section id="how-it-works" className="py-20 px-4 sm:px-8 border-b border-white/10">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-left space-y-3 max-w-2xl">
            <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
              Overview
            </p>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              How It Works
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
              Connect in-store touchpoints directly to your Google Maps review page, while routing customer
              concerns to a private management dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="bg-[#161616] p-8 rounded-xl border border-white/10 space-y-4 text-left relative">
              <div className="w-10 h-10 rounded bg-white/10 text-emerald-400 font-mono font-black text-lg flex items-center justify-center">
                01
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                Customer Taps NFC or Scans QR
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                Place an NFC stand or printed QR code on tables or checkout counters. Customers tap or scan
                with their phone, opening the rating screen instantly without downloading an app.
              </p>
              <div className="text-[11px] font-mono text-emerald-400">
                ✓ Compatible with standard NFC tags & QR codes
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#161616] p-8 rounded-xl border-l-4 border-emerald-500 border border-white/10 space-y-4 text-left relative">
              <div className="w-10 h-10 rounded bg-emerald-500 text-black font-mono font-black text-lg flex items-center justify-center">
                02
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                More Good Reviews → More Customers
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                If the customer taps <strong>"Like"</strong>, they are guided straight to your official
                Google Maps review dialog. Increasing your count of genuine 5-star reviews boosts your local
                ranking and drives more potential customers directly to your doors.
              </p>
              <div className="text-[11px] font-mono text-emerald-400">
                ✓ More 5-star reviews & higher local search visibility
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#161616] p-8 rounded-xl border-l-4 border-rose-500 border border-white/10 space-y-4 text-left relative">
              <div className="w-10 h-10 rounded bg-rose-500 text-black font-mono font-black text-lg flex items-center justify-center">
                03
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                Customer Concerns → Private Inbox
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                If the customer taps <strong>"Dislike"</strong>, a private feedback form collects their
                comments directly into your manager inbox so you can address the issue.
              </p>
              <div className="text-[11px] font-mono text-rose-400">
                ✓ Kept private to management
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: HOW IT HELPS BUSINESSES */}
      <section id="features" className="py-20 px-4 sm:px-8 border-b border-white/10 bg-[#0D0D0D]">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-left space-y-3 max-w-2xl">
            <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
              Features
            </p>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              Why Use In-Store Feedback Routing
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
              Gather genuine customer feedback in person—dramatically increasing your number of 5-star
              Google reviews and attracting more potential customers, while resolving service issues privately.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Benefit 1 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Star className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Increases Good Reviews
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Happy customers rarely remember to look up your business on Google after leaving. Tapping an
                in-store NFC stand takes 3 seconds and turns everyday satisfaction into verified 5-star reviews.
              </p>
            </div>

            {/* Benefit 2 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Attracts Potential Customers
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Google prioritizes businesses with higher ratings and recent review activity. Higher Google
                Maps placement gives your business maximum local visibility, turning searchers into new paying customers.
              </p>
            </div>

            {/* Benefit 3 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Private Feedback Channel
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Provide customers an immediate way to share concerns so your team can hear their feedback
                and address issues directly before they leave.
              </p>
            </div>

            {/* Benefit 4 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Daily & Weekly Analytics
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                View day-by-day sentiment charts: track total taps, positive ratings redirected to
                Google Maps, and private feedback submissions over the week.
              </p>
            </div>

            {/* Benefit 5 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Direct Customer Follow-Up
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Receive customer notes and optional contact details directly in your management inbox so
                staff can follow up, resolve complaints, and retain customers.
              </p>
            </div>

            {/* Benefit 6 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Standard NFC & QR Codes
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Compatible with any generic NFC stand, card, or QR code.
                No proprietary hardware or special equipment required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: SUBSCRIPTION PRICING ($24.99/mo & $199.99/yr) */}
      <section id="pricing" className="py-20 px-4 sm:px-8 border-b border-white/10">
        <div className="max-w-7xl mx-auto space-y-12 text-center">
          <div className="space-y-4 max-w-2xl mx-auto">
            <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              Subscription Plans
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed font-normal">
              Increase your positive Google reviews, attract more potential customers, and keep feedback private.
              Choose flexible monthly billing or save 33% with an annual plan.
            </p>

            {/* Monthly / Yearly Toggle */}
            <div className="pt-4 flex items-center justify-center gap-3">
              <div className="bg-[#161616] p-1 rounded-xl border border-white/10 inline-flex items-center">
                <button
                  id="toggle-monthly-plan"
                  onClick={() => setBillingCycle("month")}
                  className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider font-bold transition cursor-pointer ${
                    billingCycle === "month"
                      ? "bg-white text-black shadow"
                      : "text-stone-400 hover:text-white"
                  }`}
                >
                  Monthly ($24.99)
                </button>
                <button
                  id="toggle-yearly-plan"
                  onClick={() => setBillingCycle("year")}
                  className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider font-bold transition flex items-center gap-2 cursor-pointer ${
                    billingCycle === "year"
                      ? "bg-emerald-500 text-black shadow font-black"
                      : "text-stone-400 hover:text-white"
                  }`}
                >
                  <span>Yearly ($199.99)</span>
                  <span className="text-[10px] bg-black text-emerald-400 px-1.5 py-0.5 rounded font-black">
                    SAVE 33%
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto pt-4 text-left">
            {/* MONTHLY PLAN CARD */}
            <div
              className={`p-8 rounded-2xl border transition-all flex flex-col justify-between space-y-6 ${
                billingCycle === "month"
                  ? "bg-[#161616] border-2 border-white shadow-2xl"
                  : "bg-[#121212] border-white/10 opacity-85"
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black uppercase text-white tracking-tight">
                      Monthly Plan
                    </h3>
                    <p className="text-xs text-stone-400 font-mono">Standard billing</p>
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded bg-white/10 text-stone-300">
                    Flexible
                  </span>
                </div>

                <div className="border-b border-white/10 pb-6 pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black text-white tracking-tight">$24.99</span>
                    <span className="text-xs font-mono uppercase text-stone-400 font-bold">
                      / month
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1 font-mono">
                    Billed monthly. Cancel anytime.
                  </p>
                </div>

                <ul className="space-y-3 text-xs text-stone-300 font-sans">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Customer NFC & QR Rating Page</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Direct Google Maps Review Routing</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Private Feedback Collection</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Weekly Analytics Bar Chart</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Private Inbox</strong> for customer messages</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  id="btn-subscribe-monthly"
                  disabled={isCheckingOut}
                  onClick={() => onSubscribe("month")}
                  className="w-full py-4 px-6 rounded-lg bg-white hover:bg-stone-200 text-black font-black uppercase text-xs tracking-wider transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCheckingOut ? (
                    <span>Processing...</span>
                  ) : (
                    <span>Subscribe Monthly ($24.99/mo)</span>
                  )}
                </button>
              </div>
            </div>

            {/* YEARLY PLAN CARD (FEATURED / DISCOUNTED) */}
            <div
              className={`p-8 rounded-2xl border-2 transition-all flex flex-col justify-between space-y-6 relative ${
                billingCycle === "year"
                  ? "bg-[#181818] border-emerald-500 shadow-2xl shadow-emerald-500/10"
                  : "bg-[#141414] border-emerald-500/50"
              }`}
            >
              {/* Badge */}
              <div className="absolute -top-3.5 right-6 bg-emerald-500 text-black px-3.5 py-1 rounded text-xs font-black uppercase tracking-widest shadow-md">
                Best Value • Save 33%
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black uppercase text-white tracking-tight">
                      Annual Plan
                    </h3>
                    <p className="text-xs text-emerald-400 font-mono font-bold">
                      Discounted Annual Billing
                    </p>
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Save $99.89/yr
                  </span>
                </div>

                <div className="border-b border-white/10 pb-6 pt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-white tracking-tight">$199.99</span>
                    <span className="text-xs font-mono uppercase text-stone-400 font-bold">
                      / year
                    </span>
                  </div>

                  {/* Explicit Discount Breakdown */}
                  <div className="mt-2 p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 space-y-1 text-xs font-mono">
                    <div className="text-stone-300 flex items-center justify-between">
                      <span>Regular 12-month cost:</span>
                      <span className="line-through text-stone-500">$299.88</span>
                    </div>
                    <div className="text-emerald-400 font-black flex items-center justify-between">
                      <span>Discounted Yearly Rate:</span>
                      <span>$199.99 (Save $99.89)</span>
                    </div>
                    <div className="text-[10px] text-stone-400 text-right">
                      Equivalent to <strong>~$16.66/month</strong>
                    </div>
                  </div>
                </div>

                <ul className="space-y-3 text-xs text-stone-300 font-sans">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>All Monthly Plan Features Included</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Save $99.89 Annually</strong> (equivalent to 2 months free)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Weekly Review & Feedback Analytics</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Unlimited NFC Taps & QR Scans</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Assistance with Setup & NFC Configuration</strong></span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  id="btn-subscribe-yearly"
                  disabled={isCheckingOut}
                  onClick={() => onSubscribe("year")}
                  className="w-full py-4 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {isCheckingOut ? (
                    <span>Opening Stripe Checkout...</span>
                  ) : (
                    <span>Subscribe Yearly ($199.99/yr — Save 33%)</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: FAQ */}
      <section className="py-20 px-4 sm:px-8 border-b border-white/10">
        <div className="max-w-4xl mx-auto space-y-8 text-left">
          <div className="space-y-2">
            <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
              Questions & Answers
            </p>
            <h2 className="text-3xl font-black uppercase tracking-tight text-white">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                Do customers need to download an app or log in?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                No. Both modern iPhones and Android smartphones have native NFC readers enabled by
                default. Touching the phone to the NFC tag automatically launches your rating page in
                mobile Safari or Chrome in seconds.
              </p>
            </div>

            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                Where do the NFC tags come from?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                You can use any standard NFC stands, counter cards, or stickers (such as
                NTAG213 or NTAG215). Using a free NFC app on your phone (like NFC Tools), you simply write
                your store's URL to the tag.
              </p>
            </div>

            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                How does the Google Maps redirect work?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                You paste your business's Google Maps "Write a Review" link in your dashboard. When a
                customer taps "Like", they are forwarded straight to Google Maps to complete their review.
              </p>
            </div>

            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                What does the weekly analytics chart show?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                The dashboard bar chart visualizes day-by-day customer activity: total reviews received,
                positive ratings routed to Google Maps, and private customer feedback messages.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: Contact Us */}
      <section id="contact" className="py-20 px-4 sm:px-8 border-b border-white/10 bg-[#0E0E0E]">
        <div className="max-w-xl mx-auto space-y-8 text-left">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono uppercase tracking-widest">
              <Mail className="w-3.5 h-3.5" />
              <span>Get In Touch</span>
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tight text-white">
              Contact Us
            </h2>
            <p className="text-xs text-stone-400 max-w-md mx-auto">
              Have questions about TapShield, NFC stands, or setup? Send our team a message and we'll be in touch within 24 hours.
            </p>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl">
            <ContactForm
              initialName={currentUser?.displayName || ""}
              initialEmail={currentUser?.email || ""}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-8 bg-[#080808] text-center text-xs font-mono uppercase tracking-wider text-stone-500 space-y-4">
        <div className="flex items-center justify-center gap-2 text-white font-black text-sm">
          <div className="w-6 h-6 bg-emerald-500 rounded-md flex items-center justify-center text-black">
            <Shield className="w-3.5 h-3.5 text-black" fill="currentColor" />
          </div>
          <span>TapShield</span>
        </div>
        <p className="text-stone-400">
          Monthly: $24.99/mo • Yearly: $199.99/yr (Save 33%)
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-stone-400">
          <a href="#how-it-works" className="hover:text-emerald-400 transition">How It Works</a>
          <span>•</span>
          <a href="#pricing" className="hover:text-emerald-400 transition">Pricing</a>
          <span>•</span>
          <a href="#contact" className="text-emerald-400 hover:text-emerald-300 transition font-bold">Contact Us</a>
        </div>
        <p className="text-[11px] text-stone-600">
          © {new Date().getFullYear()} TapShield • Customer Feedback & Review Routing
        </p>
      </footer>

      {/* Senior Firebase Auth Modal */}
      <AuthModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onAuthSuccess={(user) => {
          onUserAuthChange(user);
          // Direct user to pay first if they do not yet have an active subscription
          if (!isSubscribed) {
            onSubscribe(billingCycle);
          } else {
            onEnterDashboard();
          }
        }}
      />
    </div>
  );
}
