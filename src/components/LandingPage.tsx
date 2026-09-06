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
} from "lucide-react";
import type { AuthUserProfile } from "../types";
import { AuthModal } from "./AuthModal";

interface LandingPageProps {
  currentUser: AuthUserProfile | null;
  isSubscribed: boolean;
  onEnterDashboard: () => void;
  onOpenCustomerRateView: () => void;
  onUserAuthChange: (user: AuthUserProfile | null) => void;
  onSubscribe: (interval: "month" | "year") => Promise<void>;
  onActivateSandbox: () => void;
  isCheckingOut: boolean;
  onPreviewCodeReceived?: (code: string) => void;
}

export function LandingPage({
  currentUser,
  isSubscribed,
  onEnterDashboard,
  onOpenCustomerRateView,
  onUserAuthChange,
  onSubscribe,
  onActivateSandbox,
  isCheckingOut,
  onPreviewCodeReceived,
}: LandingPageProps) {
  const [billingCycle, setBillingCycle] = useState<"month" | "year">("year");
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <div id="landing-page" className="min-h-screen bg-[#0A0A0A] text-white selection:bg-emerald-500 selection:text-black">
      {/* Header / Nav */}
      <header className="sticky top-0 z-40 bg-[#0F0F0F]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center font-black text-black text-xl">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-white uppercase text-base">
                  TapShield
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-stone-300 border border-white/10">
                  Micro-SaaS
                </span>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block tracking-tight font-medium">
                NFC In-Store Review Protection & Recovery
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-mono uppercase tracking-wider text-stone-300">
            <a href="#what-it-does" className="hover:text-emerald-400 transition">
              What It Does
            </a>
            <a href="#how-it-helps" className="hover:text-emerald-400 transition">
              How It Helps
            </a>
            <a href="#pricing" className="hover:text-emerald-400 transition">
              Pricing
            </a>
            <button
              onClick={onOpenCustomerRateView}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Simulate NFC Tap</span>
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
                  onClick={() => onUserAuthChange(null)}
                  title="Sign Out"
                  className="p-2 text-stone-400 hover:text-white"
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
                <span>NFC Review Shield for Physical Businesses</span>
              </div>

              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">
                Deflect 1-Star<br />
                <span className="text-emerald-400">Google Reviews</span><br />
                Before They Happen.
              </h1>

              <p className="text-base sm:text-lg text-stone-300 max-w-xl font-normal leading-relaxed">
                Smart NFC tap pucks placed on your checkout counters and dining tables.
                Customers tap their phone in 2 seconds: happy visitors are instantly funneled to
                post a <strong>5-star Google Review</strong>, while unhappy visitors are routed
                to a <strong>private manager inbox</strong> — keeping your public rating spotless.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <a
                  href="#pricing"
                  id="hero-cta-pricing"
                  className="px-7 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-98"
                >
                  <span>View Pricing & Get Shield</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <button
                  id="hero-simulate-tap"
                  onClick={onOpenCustomerRateView}
                  className="px-6 py-4 rounded-lg bg-[#161616] hover:bg-[#202020] border border-white/20 text-white font-mono uppercase text-xs tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Simulate In-Store Tap</span>
                </button>
              </div>

              {/* Quick Status / Sandbox bypass */}
              <div className="pt-2 flex items-center gap-4 text-xs font-mono text-stone-400">
                <span>Instant testing?</span>
                <button
                  onClick={() => {
                    onActivateSandbox();
                    onEnterDashboard();
                  }}
                  className="text-emerald-400 hover:text-emerald-300 underline font-bold uppercase tracking-wider cursor-pointer"
                >
                  Launch Sandbox Pro Mode →
                </button>
              </div>
            </div>

            {/* Visual Phone / NFC Simulator Preview */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-sm bg-[#161616] rounded-2xl border-2 border-white/20 p-6 shadow-2xl relative">
                <div className="absolute -top-3 right-6 bg-emerald-500 text-black px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                  Live Customer Flow
                </div>

                <div className="text-center space-y-4 pt-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto font-black text-xl">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>

                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                      NFC Table Puck Tapped
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
                        → Google 5★
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
                    <span>Public Review Risk</span>
                    <strong className="text-emerald-400">0% Negative Leaks</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Social Proof / Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 pt-8 border-t border-white/10">
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-3xl sm:text-4xl font-black text-white">100%</div>
              <div className="text-xs uppercase font-mono tracking-wider text-stone-400 mt-1">
                Negative Shielding
              </div>
            </div>
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-3xl sm:text-4xl font-black text-emerald-400">+10x</div>
              <div className="text-xs uppercase font-mono tracking-wider text-stone-400 mt-1">
                More 5-Star Reviews
              </div>
            </div>
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-3xl sm:text-4xl font-black text-white">2 Sec</div>
              <div className="text-xs uppercase font-mono tracking-wider text-stone-400 mt-1">
                Zero App Download
              </div>
            </div>
            <div className="bg-[#141414] p-5 rounded-lg border border-white/5 text-left">
              <div className="text-3xl sm:text-4xl font-black text-cyan-400">7-Day</div>
              <div className="text-xs uppercase font-mono tracking-wider text-stone-400 mt-1">
                Review Velocity Chart
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 1: WHAT THE APP DOES */}
      <section id="what-it-does" className="py-20 px-4 sm:px-8 border-b border-white/10">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-left space-y-3 max-w-2xl">
            <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
              Architecture / How It Works
            </p>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              What TapShield Does
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
              We bridge the physical touchpoint in your store or restaurant directly to your online
              Google Maps profile, bifurcating sentiment at the moment of customer interaction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="bg-[#161616] p-8 rounded-xl border border-white/10 space-y-4 text-left relative">
              <div className="w-10 h-10 rounded bg-white/10 text-emerald-400 font-mono font-black text-lg flex items-center justify-center">
                01
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                Customer Taps NFC Puck
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                An elegant NFC puck or sticker is set on tables or counter stands. Customers tap with
                an iPhone or Android. The browser opens instantly without installing any app.
              </p>
              <div className="text-[11px] font-mono text-emerald-400">
                ✓ Compatible with standard NTAG213/215
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#161616] p-8 rounded-xl border-l-4 border-emerald-500 border border-white/10 space-y-4 text-left relative">
              <div className="w-10 h-10 rounded bg-emerald-500 text-black font-mono font-black text-lg flex items-center justify-center">
                02
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                Happy Customers → Google Reviews
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                If the customer taps <strong>"Like"</strong>, TapShield automatically redirects them
                directly into your official Google Maps "Write a Review" dialog with 5 stars ready to post.
              </p>
              <div className="text-[11px] font-mono text-emerald-400">
                ✓ Deep-linked Google Maps URL
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#161616] p-8 rounded-xl border-l-4 border-rose-500 border border-white/10 space-y-4 text-left relative">
              <div className="w-10 h-10 rounded bg-rose-500 text-black font-mono font-black text-lg flex items-center justify-center">
                03
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                Unhappy Visitors → Private Shield
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                If the customer taps <strong>"Dislike"</strong>, Google Maps is completely bypassed.
                A private, empathetic feedback form collects their complaint directly into your manager inbox.
              </p>
              <div className="text-[11px] font-mono text-rose-400">
                ✓ Zero negative reviews reach Google
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: HOW IT HELPS BUSINESSES */}
      <section id="how-it-helps" className="py-20 px-4 sm:px-8 border-b border-white/10 bg-[#0D0D0D]">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-left space-y-3 max-w-2xl">
            <p className="text-emerald-400 font-mono text-xs uppercase font-bold tracking-widest">
              Business Impact & ROI
            </p>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              How It Will Help Your Business
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
              Google Maps ratings dictate walk-ins, delivery orders, and local search supremacy.
              A single 1-star drop costs thousands of dollars in lost customers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Benefit 1 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Prevents Emotional 1-Star Reviews
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                When people are disappointed by cold coffee, slow service, or an incorrect order,
                they just want to be heard. Giving them an immediate in-store channel neutralizes
                their anger before they open Google to write a scathing 1-star review.
              </p>
            </div>

            {/* Benefit 2 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Star className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Multiplies 5-Star Review Volume
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Satisfied customers rarely think about searching for your business on Google to post
                a review. Tapping an NFC puck takes under 3 seconds and catches them while their
                positive sentiment is at its highest peak.
              </p>
            </div>

            {/* Benefit 3 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Weekly Velocity & Trend Analytics
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Your protected dashboard provides interactive bar charts breaking down daily
                traffic: how many good vs. bad reviews you logged, deflection percentages, and
                conversions redirected to Google Maps over the entire week.
              </p>
            </div>

            {/* Benefit 4 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Immediate Manager Remedy Loop
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Receive customer contact info and exact notes directly in your real-time dashboard.
                Store managers can immediately call or email the customer, offer a voucher, and
                transform a lost visitor into a lifelong advocate.
              </p>
            </div>

            {/* Benefit 5 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Higher Google Maps SEO Ranking
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Google's local search algorithm prioritizes businesses with a high velocity of fresh,
                positive reviews. By steadily feeding high-sentiment customers to Google daily, your
                rank in local "near me" searches climbs rapidly.
              </p>
            </div>

            {/* Benefit 6 */}
            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 text-left space-y-3">
              <div className="w-10 h-10 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                Zero Hardware Lock-In
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Program your own generic NFC tags with any free smartphone app (NFC Tools), or use
                our auto-generated QR code cards. No proprietary or expensive vendor hardware needed.
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
              Simple, Transparent Plans
            </p>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
              Subscription Cost
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed font-normal">
              One intercepted 1-star review or single retained customer pays for the entire year.
              Choose monthly flexibility or save 33% with annual billing.
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
                    <p className="text-xs text-stone-400 font-mono">Standard flex billing</p>
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
                    Cancel anytime with 1 click. No long-term commitment.
                  </p>
                </div>

                <ul className="space-y-3 text-xs text-stone-300 font-sans">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>NFC Public Tap Landing Page</strong> (Instant 2-sec load)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Automated Google Review Funnel</strong> (100% happy redirects)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Private Dislike Shield</strong> (No bad reviews to Google)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Weekly Analytics Bar Chart</strong> (Daily Good/Bad velocity)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Encrypted Management Inbox</strong> for instant customer recovery</span>
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
                      Annual Pro Plan
                    </h3>
                    <p className="text-xs text-emerald-400 font-mono font-bold">
                      Discounted Annual Shield
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
                      Equivalent to just <strong>~$16.66/month</strong>
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
                    <span><strong>2 Months Completely Free</strong> (Save ~$100 annually)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Full Weekly Review Analytics</strong> with Recharts visualization</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Unlimited NFC Taps & Scans</strong> (No per-tap fees)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span><strong>Priority Business Support</strong> for setup & NFC tags</span>
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

          {/* Sandbox instant toggle note */}
          <div className="max-w-md mx-auto p-4 rounded-xl bg-[#141414] border border-white/10 text-xs text-stone-400 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono uppercase font-bold text-stone-300">
                Testing without live Stripe key?
              </span>
              <button
                id="btn-sandbox-activate-landing"
                onClick={() => {
                  onActivateSandbox();
                  onEnterDashboard();
                }}
                className="text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider underline cursor-pointer"
              >
                Activate Sandbox Pro Mode
              </button>
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              Immediately unlocks the full owner dashboard, weekly bar chart analytics, and NFC link configuration without running card transactions.
            </p>
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
                default. Touching the phone to the NFC puck automatically launches your TapShield
                rating page in mobile Safari or Chrome in under 2 seconds.
              </p>
            </div>

            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                Where do the NFC pucks come from?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                You can use any standard, readily available NFC stickers or table pucks (such as
                NTAG213 or NTAG215) ordered from Amazon for under $1 each. Using the free <em>NFC Tools</em>
                app on your phone, you simply write your store's unique TapShield URL to the tag in 5 seconds.
              </p>
            </div>

            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                How does the Google Maps redirect work?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                You paste your business's Google Maps "Write a Review" short link in your TapShield
                dashboard. When a customer taps "Like", TapShield forwards them straight to Google
                Maps to complete their 5-star rating.
              </p>
            </div>

            <div className="bg-[#161616] p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-black uppercase text-white text-base">
                What does the weekly analytics chart show?
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                The dashboard bar chart visualizes day-by-day customer sentiment: total reviews
                received, how many were good (positive taps), how many were intercepted away from
                Google, and how many successful redirects to Google were made.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-8 bg-[#080808] text-center text-xs font-mono uppercase tracking-wider text-stone-500 space-y-4">
        <div className="flex items-center justify-center gap-2 text-white font-black text-sm">
          <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center font-black text-black text-xs">
            R
          </div>
          <span>TapShield Micro-SaaS Platform</span>
        </div>
        <p className="text-stone-400">
          Monthly: $24.99/mo • Yearly: $199.99/yr (Save 33% / $99.89 off)
        </p>
        <p className="text-[11px] text-stone-600">
          © {new Date().getFullYear()} TapShield Inc. NFC Customer Feedback Recovery Platform.
        </p>
      </footer>

      {/* Senior Firebase Auth Modal */}
      <AuthModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onAuthSuccess={(user, previewCode) => {
          onUserAuthChange(user);
          if (previewCode && onPreviewCodeReceived) {
            onPreviewCodeReceived(previewCode);
          }
          // Proceed to guarded dashboard view
          onEnterDashboard();
        }}
      />
    </div>
  );
}
