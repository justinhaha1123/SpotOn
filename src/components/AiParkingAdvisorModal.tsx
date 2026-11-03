import React, { useState, useRef, useEffect } from "react";
import { X, Sparkles, Send, Bot, User, MapPin } from "lucide-react";

type FacilityRef = { id: string; name: string };

interface AiParkingAdvisorModalProps {
  onClose: () => void;
  onSelectRecommendation?: (facilityName: string) => void;
  facilities?: FacilityRef[];
  userLocation?: { lat: number; lng: number } | null;
  locationKind?: "gps" | "map-centre";
}

const ASSISTANT_UNAVAILABLE =
  "The parking assistant isn't available right now. Prices and space counts on the map are not filled in by the assistant.";

export const AiParkingAdvisorModal: React.FC<AiParkingAdvisorModalProps> = ({
  onClose,
  onSelectRecommendation,
  facilities,
  userLocation,
  locationKind = "map-centre",
}) => {
  const [messages, setMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    {
      sender: "ai",
      text: "Ask about the car parks already loaded. I can only use those records. If GEMINI_API_KEY is missing, I stay off rather than guessing prices or free spaces.",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const predefinedPrompts = [
    "Find car parks near Soho with EV fast chargers",
    "Which London car parks have height clearance over 2.1m for SUVs?",
    "Cheapest off-street parking options near Central London",
    "How does the Congestion Charge apply to off-street parking?",
  ];

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || inputPrompt;
    if (!query.trim() || isLoading) return;

    const newMessages = [...messages, { sender: "user" as const, text: query }];
    setMessages(newMessages);
    setInputPrompt("");
    setIsLoading(true);

    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 28000);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: query,
          userLocation: userLocation
            ? { lat: userLocation.lat, lng: userLocation.lng }
            : undefined,
          lat: userLocation?.lat,
          lng: userLocation?.lng,
          locationKind,
        }),
      });
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : null;
      if (
        res.ok &&
        data?.success === true &&
        typeof data.answer === "string" &&
        data.answer.trim().length > 0
      ) {
        setMessages([...newMessages, { sender: "ai", text: data.answer }]);
      } else {
        const explained = (
          data?.error === "missing_api_key" ||
          data?.error === "rejected_api_key" ||
          data?.error === "quota" ||
          data?.error === "assistant_busy"
        ) && typeof data?.message === "string";
        if (!explained) {
          console.error("Assistant request failed", {
            status: res.status,
            error: typeof data?.error === "string" ? data.error : null,
          });
        }
        setMessages([
          ...newMessages,
          { sender: "ai", text: explained ? data.message : ASSISTANT_UNAVAILABLE },
        ]);
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) console.error("Assistant request error", err);
      setMessages([
        ...newMessages,
        {
          sender: "ai",
          text: aborted
            ? "The assistant is busy and did not answer within 25 seconds. Try again in a moment."
            : ASSISTANT_UNAVAILABLE,
        },
      ]);
    } finally {
      window.clearTimeout(abortTimer);
      setIsLoading(false);
    }
  };

  // Match facility names from the loaded dataset that appear in the assistant's text
  const extractFacilityPills = (text: string) => {
    const haystack = text.toLowerCase();
    const seen = new Set<string>();
    const pills: Array<{ key: string; query: string }> = [];
    const list: FacilityRef[] = facilities ?? [];
    for (const f of list) {
      if (!f?.id || !f?.name || seen.has(f.id)) continue;
      if (haystack.includes(f.name.toLowerCase())) {
        seen.add(f.id);
        pills.push({ key: f.name, query: f.name });
      }
    }
    return pills.slice(0, 6);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">London Parking AI Assistant</h3>
              <p className="text-xs text-blue-100 mt-0.5">Real-time guidance &amp; regulations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="btn-close-ai-modal"
            className="p-1.5 text-blue-100 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 bg-slate-50 border-b border-slate-100 flex gap-2 overflow-x-auto">
          {predefinedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              disabled={isLoading}
              className="text-xs bg-white text-slate-700 px-3 py-1.5 rounded-full border border-slate-200 hover:border-blue-300 hover:text-blue-600 font-medium whitespace-nowrap shrink-0 shadow-2xs transition"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3.5 bg-slate-50/50">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${
                m.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  m.sender === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gradient-to-tr from-indigo-600 to-blue-600 text-white shadow-sm"
                }`}
              >
                {m.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] ${
                  m.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-none"
                    : "bg-white text-slate-800 border border-slate-200/90 shadow-2xs rounded-tl-none whitespace-pre-line"
                }`}
              >
                <div>{m.text}</div>
                {m.sender === "ai" && onSelectRecommendation && (
                  (() => {
                    const pills = extractFacilityPills(m.text);
                    if (pills.length === 0) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-slate-400 font-medium self-center">View on map:</span>
                        {pills.map((pill, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => onSelectRecommendation(pill.query)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md transition"
                          >
                            <MapPin className="w-3 h-3 text-blue-600" />
                            {pill.key}
                          </button>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-slate-700 text-xs pl-9 bg-white border border-slate-200 rounded-xl px-3 py-2" role="status" aria-live="polite">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span>Asking the assistant… This usually takes a few seconds and stops after 25 seconds if Google is busy.</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about tariffs, EV bays, or best spaces..."
            className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputPrompt.trim() || isLoading}
            id="btn-send-ai-query"
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
