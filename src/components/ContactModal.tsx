import React from "react";
import { X, Mail } from "lucide-react";
import { ContactForm } from "./ContactForm";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  initialEmail?: string;
}

export function ContactModal({
  isOpen,
  onClose,
  initialName = "",
  initialEmail = "",
}: ContactModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#141414] border border-white/15 rounded-2xl shadow-2xl my-auto max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-tight leading-tight">
                Contact Us
              </h2>
              <p className="text-[10px] text-stone-400 font-mono">
                Get in touch with the TapShield support team
              </p>
            </div>
          </div>

          <button
            id="btn-close-contact-modal"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-stone-200 hover:text-white flex items-center justify-center transition cursor-pointer flex-shrink-0 shadow"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto [scrollbar-width:thin]">
          <ContactForm
            initialName={initialName}
            initialEmail={initialEmail}
          />
        </div>
      </div>
    </div>
  );
}
