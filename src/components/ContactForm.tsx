import React, { useState } from "react";
import {
  Mail,
  User,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from "lucide-react";

interface ContactFormProps {
  initialName?: string;
  initialEmail?: string;
  onSuccess?: () => void;
  className?: string;
}

export function ContactForm({
  initialName = "",
  initialEmail = "",
  onSuccess,
  className = "",
}: ContactFormProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Basic validation
    if (!name.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!message.trim() || message.trim().length < 5) {
      setErrorMessage("Please enter a message of at least 5 characters.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit your message. Please try again.");
      }

      setSuccessMessage(
        data.message ||
          "Thank you for reaching out. Our team has received your message and will contact you within 24 hours."
      );
      setMessage("");

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error submitting contact form:", err);
      setErrorMessage(
        err?.message || "An unexpected error occurred while sending your message. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Success Banner */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Message Sent Successfully</span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed font-mono">
            {successMessage}
          </p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-[11px] underline hover:text-emerald-300 font-mono transition cursor-pointer mt-1"
          >
            Send another message
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 leading-relaxed">
            <span className="font-bold">Submission Error: </span>
            {errorMessage}
          </div>
        </div>
      )}

      {!successMessage && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="contact-name"
              className="text-[11px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-stone-400" />
              <span>Your Name</span>
            </label>
            <input
              id="contact-name"
              type="text"
              required
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-white/15 bg-[#0A0A0A] text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>

          {/* Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="contact-email"
              className="text-[11px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-stone-400" />
              <span>Your Email Address</span>
            </label>
            <input
              id="contact-email"
              type="email"
              required
              disabled={isSubmitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. sarah@example.com"
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-white/15 bg-[#0A0A0A] text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>

          {/* Message Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="contact-message"
              className="text-[11px] font-mono uppercase tracking-wider text-stone-300 flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
              <span>Message</span>
            </label>
            <textarea
              id="contact-message"
              required
              rows={4}
              disabled={isSubmitting}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we assist you with TapShield NFC stands or your subscription?"
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-white/15 bg-[#0A0A0A] text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none disabled:opacity-50 leading-relaxed"
            />
          </div>

          {/* Mandatory Refund Policy Disclaimer */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-300">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <p className="leading-relaxed text-[11px]">
              <strong>Please note:</strong> A refund is not possible once a purchase is processed.
            </p>
          </div>

          {/* Submit Button */}
          <button
            id="btn-contact-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-98"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending Message...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send Message</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
