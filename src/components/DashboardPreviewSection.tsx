import React, { useState } from "react";
import {
  Lock,
  ArrowRight,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Radio,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  Save,
  CheckCircle2,
  BarChart3,
  MessageSquare,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Info,
  QrCode,
  CornerDownRight,
  Mail,
  Phone,
} from "lucide-react";
import { WeeklyAnalyticsChart } from "./WeeklyAnalyticsChart";
import type { FeedbackItem } from "../types";

interface DashboardPreviewSectionProps {
  onOpenAuthModal: () => void;
  onExploreDemo?: () => void;
}

interface FixedSampleFeedback extends FeedbackItem {
  relativeTime: string;
}

// Fixed showcase reviews for the example dashboard
const fixedSampleFeedbacks: FixedSampleFeedback[] = [
  {
    id: "fb-ex-1",
    businessId: "demo-cafe",
    rating: "dislike",
    customerNote: "The oat cortado took 20 minutes to arrive during the morning rush and was lukewarm. Waitstaff was courteous though.",
    customerName: "Sarah M.",
    customerContact: "sarah.miller@example.com",
    status: "new",
    createdAt: "2026-09-07T11:42:00.000Z",
    relativeTime: "Today, 11:42 AM",
    replies: [],
  },
  {
    id: "fb-ex-2",
    businessId: "demo-cafe",
    rating: "dislike",
    customerNote: "Music was a bit loud near the front counter for remote working, but the cold brew was top notch!",
    customerName: "Alex R.",
    customerContact: "alex.r@example.com",
    status: "reviewed",
    createdAt: "2026-09-06T15:30:00.000Z",
    relativeTime: "Yesterday, 3:30 PM",
    replies: [
      {
        id: "rep-1",
        message: "Hi Alex, thank you for letting us know! We adjusted the counter speaker volume so remote workers have a quieter workspace.",
        sentAt: "2026-09-06T16:15:00.000Z",
        sentBy: "Store Manager",
        method: "email",
        recipientContact: "alex.r@example.com",
      },
    ],
  },
  {
    id: "fb-ex-3",
    businessId: "demo-cafe",
    rating: "dislike",
    customerNote: "Napkin dispenser on the patio was empty and table 4 had not been wiped yet. Great avocado toast as usual.",
    customerName: "Elena V.",
    customerContact: "+1 (512) 555-0182",
    status: "resolved",
    createdAt: "2026-09-05T13:10:00.000Z",
    relativeTime: "2 days ago",
    replies: [
      {
        id: "rep-2",
        message: "Thank you for alerting us, Elena! Patio cleaning checklists have been refreshed for the team. We'd love to treat you to coffee on your next visit.",
        sentAt: "2026-09-05T14:00:00.000Z",
        sentBy: "Artisan Brews Management",
        method: "sms",
        recipientContact: "+1 (512) 555-0182",
      },
    ],
  },
  {
    id: "fb-ex-4",
    businessId: "demo-cafe",
    rating: "dislike",
    customerNote: "Waited 12 minutes in the line for a pastry. Quality was great though.",
    customerName: "David K.",
    customerContact: "david.k@example.com",
    status: "resolved",
    createdAt: "2026-09-04T09:20:00.000Z",
    relativeTime: "3 days ago",
    replies: [
      {
        id: "rep-3",
        message: "Hi David, apologies for the pastry delay! We added an extra warming station during morning rush hours.",
        sentAt: "2026-09-04T10:15:00.000Z",
        sentBy: "Store Manager",
        method: "email",
        recipientContact: "david.k@example.com",
      },
    ],
  },
  {
    id: "fb-ex-5",
    businessId: "demo-cafe",
    rating: "dislike",
    customerNote: "Guest WiFi password on the board had a missing character so I could not connect right away.",
    customerName: "Marcus L.",
    customerContact: "marcus.l@example.com",
    status: "reviewed",
    createdAt: "2026-09-03T16:45:00.000Z",
    relativeTime: "4 days ago",
    replies: [
      {
        id: "rep-4",
        message: "Thanks Marcus, chalkboard updated with the correct guest credentials!",
        sentAt: "2026-09-03T17:00:00.000Z",
        sentBy: "Store Manager",
        method: "email",
        recipientContact: "marcus.l@example.com",
      },
    ],
  },
];

export function DashboardPreviewSection({
  onOpenAuthModal,
  onExploreDemo,
}: DashboardPreviewSectionProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");

  const handleCopyLink = () => {
    navigator.clipboard.writeText("https://tapshield.space/r/artisan-brews");
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const filteredFeedbacks = fixedSampleFeedbacks.filter((item) => {
    if (activeFilter === "all") return true;
    return item.status === activeFilter;
  });

  return (
    <div id="dashboard-preview-section" className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Top Banner Explaining the Actual Dashboard */}
      <div className="bg-[#141414] border border-white/15 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Authentic Subscriber Dashboard Preview</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">
              What Your Dashboard Actually Looks Like
            </h1>

            <p className="text-stone-300 text-xs sm:text-sm leading-relaxed">
              When you subscribe, this is your live command center. Every widget is specifically built for your NFC review stands: live conversion metrics, weekly 5-star Google redirects, private feedback intercept inbox, and direct Google Maps configuration.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 flex-shrink-0">
            <button
              id="btn-preview-sign-in"
              onClick={onOpenAuthModal}
              className="py-3.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-98 whitespace-nowrap"
            >
              <Lock className="w-4 h-4" />
              <span>Sign In / Create Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {onExploreDemo && (
              <button
                id="btn-preview-explore-demo"
                onClick={onExploreDemo}
                className="py-3 px-5 rounded-xl bg-[#0A0A0A] hover:bg-white/5 border border-white/15 text-stone-200 hover:text-white font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open Live Interactive Store</span>
              </button>
            )}
          </div>
        </div>

        {/* Feature summary bullets */}
        <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono text-stone-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span>1-Tap NFC Counter Stand Sync</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span>94.2% Positive Review Redirect Rate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span>Private Feedback Intercept Protection</span>
          </div>
        </div>
      </div>

      {/* Browser Window Frame displaying the ACTUAL TapShield Dashboard */}
      <div className="bg-[#111111] border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* macOS-style Window Header Bar */}
        <div className="bg-[#161616] px-4 py-3 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
          </div>

          <div className="flex-1 max-w-md mx-auto hidden sm:block">
            <div className="bg-[#0A0A0A] border border-white/10 rounded-lg px-3 py-1 text-center font-mono text-[11px] text-stone-400 flex items-center justify-center gap-2 truncate">
              <Lock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-stone-300">https://tapshield.space/dashboard</span>
              <span className="px-1.5 py-0.2 text-[9px] rounded bg-emerald-500/20 text-emerald-300 uppercase font-bold">
                Live Subscribed State
              </span>
            </div>
          </div>

          <div className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active Subscription View</span>
          </div>
        </div>

        {/* The Exact Real TapShield Dashboard Interface */}
        <div className="p-6 sm:p-8 space-y-8 bg-[#0D0D0D]">
          {/* Dashboard Header Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-white/10">
            <div>
              <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs mb-2">
                Store Owner Dashboard
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-none uppercase text-white">
                Customer Overview
              </h2>
              <p className="text-xs text-stone-400 mt-2 font-mono uppercase tracking-wider">
                Store: Artisan Brews & Roastery
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="text-left sm:text-right">
                <div className="text-xs opacity-50 uppercase font-bold tracking-wider mb-1 text-stone-400">
                  Subscription Status
                </div>
                <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>ACTIVE SUBSCRIPTION</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-black uppercase tracking-wider bg-emerald-500 text-black hover:bg-emerald-400 transition cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Test Customer View</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 Core Stat Cards (Showcasing fixed demo metrics) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-[#161616] p-6 border-l-4 border-emerald-500 border border-white/5 rounded-r-xl">
              <div className="text-4xl sm:text-5xl font-black mb-1 text-white tracking-tight">
                6
              </div>
              <div className="text-xs uppercase font-bold opacity-60 tracking-wider text-stone-300">
                Private Feedback Intercepted
              </div>
              <p className="text-[10px] text-emerald-400 mt-2 font-mono uppercase tracking-wider">
                Shielded from public Google profile
              </p>
            </div>

            <div className="bg-[#161616] p-6 border-l-4 border-white border border-white/5 rounded-r-xl">
              <div className="text-4xl sm:text-5xl font-black mb-1 text-white tracking-tight">
                1
              </div>
              <div className="text-xs uppercase font-bold opacity-60 tracking-wider text-stone-300">
                Pending Action Items
              </div>
              <p className="text-[10px] text-amber-400 mt-2 font-mono uppercase tracking-wider">
                Awaiting manager follow-up
              </p>
            </div>

            <div className="bg-[#161616] p-6 border-l-4 border-emerald-500 border border-white/5 rounded-r-xl">
              <div className="text-4xl sm:text-5xl font-black mb-1 text-white tracking-tight">
                90%
              </div>
              <div className="text-xs uppercase font-bold opacity-60 tracking-wider text-stone-300">
                Direct Google Reviews
              </div>
              <p className="text-[10px] text-emerald-400 mt-2 font-mono uppercase tracking-wider">
                Routed to Google Maps
              </p>
            </div>

            <div className="bg-[#161616] p-6 border-l-4 border-white border border-white/5 rounded-r-xl">
              <div className="text-2xl sm:text-3xl font-black mb-1 text-white tracking-tight uppercase">
                Cloud Sync
              </div>
              <div className="text-xs uppercase font-bold opacity-60 tracking-wider text-stone-300">
                Database Storage
              </div>
              <p className="text-[10px] text-stone-400 mt-2 font-mono uppercase tracking-wider">
                Real-Time Encrypted Storage
              </p>
            </div>
          </div>

          {/* Weekly Review Analytics Bar Chart (Fixed showcase demo data) */}
          <div className="rounded-xl border border-white/10 overflow-hidden bg-[#161616] p-5 shadow-lg">
            <WeeklyAnalyticsChart isExample={true} feedbacks={fixedSampleFeedbacks} />
          </div>

          {/* Configuration Row: Google Maps URL + NFC Tag Programming */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Google Maps Review URL Setup */}
            <div className="lg:col-span-7 bg-[#161616] rounded-xl border border-white/10 overflow-hidden shadow-lg space-y-0">
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#1C1C1C]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-emerald-500 text-black flex items-center justify-center font-black">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-white text-base sm:text-lg">
                      Google Maps Review URL
                    </h3>
                    <p className="text-xs text-stone-400">
                      Target destination when a customer taps "Like"
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-stone-300">
                    Store or Location Name
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="Artisan Brews & Roastery"
                    className="w-full text-xs font-mono px-3.5 py-3 rounded border border-white/20 bg-[#0A0A0A] text-white outline-none cursor-default"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-stone-300">
                    Direct Google Maps "Write a Review" URL
                  </label>
                  <input
                    type="url"
                    readOnly
                    value="https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"
                    className="w-full text-xs font-mono px-3.5 py-3 rounded border border-white/20 bg-[#0A0A0A] text-white outline-none cursor-default"
                  />
                  <p className="text-[11px] text-stone-400">
                    💡 <strong>Tip:</strong> From your Google Business Profile, copy your short review link.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider text-xs transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Settings</span>
                  </button>

                  <a
                    href="https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-3 rounded bg-[#0A0A0A] hover:bg-white/10 text-stone-200 border border-white/10 font-bold uppercase text-xs transition"
                  >
                    <span>Test Link</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* In-Store NFC Link Programming */}
            <div className="lg:col-span-5 bg-[#161616] rounded-xl border border-white/10 overflow-hidden shadow-lg flex flex-col justify-between">
              <div>
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#1C1C1C]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-emerald-500 text-black flex items-center justify-center font-black">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black uppercase tracking-tight text-white text-base sm:text-lg">
                        In-Store NFC Link
                      </h3>
                      <p className="text-xs text-stone-400">Program your NFC stands or counter cards</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="bg-[#0A0A0A] p-3.5 rounded border border-white/10 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-emerald-400 truncate select-all">
                      https://tapshield.space/r/artisan-brews
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="p-2 rounded bg-white text-black hover:bg-stone-200 transition flex-shrink-0 cursor-pointer"
                      title="Copy NFC URL"
                    >
                      {copiedLink ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-stone-400 leading-relaxed">
                    Write this URL to any standard NTAG213 / NTAG215 NFC stand, card, or sticker using free apps like <em>NFC Tools</em>.
                  </p>

                  <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-xs text-stone-300">
                    <QrCode className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                    <p className="text-[11px] leading-tight">
                      Or print your counter stand QR code directly from your store dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Feedback Log (Private Feedback Inbox) */}
          <div className="bg-[#161616] rounded-xl border border-white/10 overflow-hidden shadow-lg">
            <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1C1C1C]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-emerald-500 text-black flex items-center justify-center font-black">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black uppercase tracking-tight text-white text-base sm:text-lg">
                    Private Customer Feedback Log
                  </h3>
                  <p className="text-xs text-stone-400">
                    Negative feedback intercepted before reaching public Google Maps
                  </p>
                </div>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 bg-[#0A0A0A] p-1 rounded-lg border border-white/10 text-xs font-bold uppercase">
                {(["all", "new", "reviewed", "resolved"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-1 rounded transition cursor-pointer ${
                      activeFilter === filter
                        ? "bg-emerald-500 text-black shadow"
                        : "text-stone-400 hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {filteredFeedbacks.map((item) => (
                <div key={item.id} className="p-5 hover:bg-white/[0.02] transition space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        <ThumbsDown className="w-3 h-3" />
                        <span>Private Interception</span>
                      </span>

                      <span className="text-white font-bold text-sm">{item.customerName}</span>
                      {item.customerContact && (
                        <span className="text-stone-400 text-xs font-mono inline-flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded">
                          {item.customerContact.includes("@") ? (
                            <Mail className="w-3 h-3 text-sky-400" />
                          ) : (
                            <Phone className="w-3 h-3 text-emerald-400" />
                          )}
                          <span>{item.customerContact}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                          item.status === "new"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : item.status === "reviewed"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-stone-400 text-[11px] font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{item.relativeTime}</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-stone-200 text-xs sm:text-sm leading-relaxed bg-[#111111] p-3 rounded-lg border border-white/5">
                    "{item.customerNote}"
                  </p>

                  {/* Business Replies Thread (Showcasing Reply in System feature) */}
                  {item.replies && item.replies.length > 0 && (
                    <div className="pl-4 sm:pl-6 border-l-2 border-emerald-500/40 space-y-2 mt-2">
                      {item.replies.map((rep) => (
                        <div key={rep.id} className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-emerald-400 font-bold inline-flex items-center gap-1.5">
                              <CornerDownRight className="w-3.5 h-3.5" />
                              <span>{rep.sentBy || "Store Manager"}</span>
                              <span className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded">
                                via {rep.method === "email" ? "Email" : rep.method === "sms" ? "SMS" : "System"}
                              </span>
                            </span>
                            <span className="text-stone-400 text-[10px]">
                              Direct Resolution Sent
                            </span>
                          </div>
                          <p className="text-stone-300 leading-relaxed text-xs pl-5">
                            "{rep.message}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Comparison Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-[#141414] border border-white/10 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <ThumbsUp className="w-4 h-4" />
          </div>
          <h3 className="text-white font-bold text-sm">Automatic 5★ Funnel</h3>
          <p className="text-xs text-stone-400 leading-relaxed">
            Customers rating their experience favorably are immediately forwarded to your public Google Maps profile to leave 5-star reviews.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-[#141414] border border-white/10 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <ThumbsDown className="w-4 h-4" />
          </div>
          <h3 className="text-white font-bold text-sm">Private Complaint Intercept</h3>
          <p className="text-xs text-stone-400 leading-relaxed">
            Unhappy guests leave feedback on your private form instead of venting on Google Maps, safeguarding your public rating.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-[#141414] border border-white/10 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </div>
          <h3 className="text-white font-bold text-sm">Actionable Store Analytics</h3>
          <p className="text-xs text-stone-400 leading-relaxed">
            Monitor tap volume by day of the week, track resolution times on customer feedback, and verify staff performance.
          </p>
        </div>
      </div>
    </div>
  );
}
