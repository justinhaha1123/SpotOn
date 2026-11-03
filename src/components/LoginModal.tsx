import React, { useState } from "react";
import { AppUser } from "../types";
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AppUser) => void;
  currentUser?: AppUser | null;
  onLogout?: () => void;
  contextMessage?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  currentUser,
  onLogout,
  contextMessage,
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  if (currentUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
          {/* Modal Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-base leading-tight">Name on this device</h3>
                <p className="text-[11px] text-emerald-300">Local notes only</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Security Guarantee Banner */}
          <div className="p-4 bg-emerald-50 border-b border-emerald-200 text-emerald-950 text-xs flex gap-3">
            <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0 text-emerald-700">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-emerald-900 block mb-0.5">
                Saved in this browser only
              </span>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                This name is kept in local storage on this device. It is not an account, it is not encrypted, and it is not sent to a server.
              </p>
            </div>
          </div>

          {/* User Details */}
          <div className="p-5 space-y-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Contributor:</span>
                <span className="font-bold text-slate-900">{currentUser.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-800">{currentUser.email}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Live Space Updates:</span>
                <span className="font-bold text-blue-600">{currentUser.updatesCount || 0} submitted</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Storage:</span>
                <span className="text-[11px] font-semibold text-slate-700">
                  This browser only
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
              >
                Close
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition"
                >
                  Clear name
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }

    if (mode === "register" && !name.trim()) {
      setError("Please enter your name or driver handle.");
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const derivedName =
        name.trim() || email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const user: AppUser = {
        id: `user-${Date.now()}`,
        name: derivedName,
        email: email.trim().toLowerCase(),
        verifiedContributor: false,
        updatesCount: 0,
        loginTime: new Date().toISOString(),
        encryptionSecurity: "Stored in this browser only",
      };

      setIsSubmitting(false);
      onLoginSuccess(user);
      onClose();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Name on this device</h3>
              <p className="text-[11px] text-blue-200">Used only to label your own notes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Emphasis Notice */}
        <div className="p-4 bg-emerald-50 border-b border-emerald-200 text-emerald-950 text-xs flex gap-3">
          <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0 self-start text-emerald-700">
            <Lock className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-900">
              <span>Nothing is uploaded</span>
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-800">
              The name and email stay in this browser so a note can show who wrote it. There is no password, no verified-driver status, and no encryption claim.
            </p>
          </div>
        </div>

        {/* Context Message (if triggered by Live Update action) */}
        {contextMessage && (
          <div className="mx-5 mt-4 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs text-blue-900">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{contextMessage}</span>
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-200 px-5 pt-3">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`pb-2.5 text-xs font-bold border-b-2 mr-6 transition ${
              mode === "login"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`pb-2.5 text-xs font-bold border-b-2 transition ${
              mode === "register"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Create Free Account
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === "register" && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Full Name / Driver Handle
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex M. (Camden)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.co.uk"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {isSubmitting
                ? "Saving…"
                : mode === "login"
                ? "Save name"
                : "Save name"}
            </span>
          </button>

          {/* Safe Storage Guarantees */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Stored on this device</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Not a live space feed</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
