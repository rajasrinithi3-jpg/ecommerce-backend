import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChat, type ChatMessage, type ChatProduct } from "./api";
import "./ChatWidget.css";

type ChatEntry = ChatMessage & {
  id: number;
  products?: ChatProduct[];
};

const suggestions = [
  "Best deals under ₹2000",
  "Top rated gadgets",
  "Is a good time to buy?",
];

const signalLabel: Record<ChatProduct["signal"], string> = {
  BUY_NOW: "BUY NOW",
  GOOD_DEAL: "GOOD DEAL",
  WAIT: "WAIT",
  PRICE_RISING: "PRICE RISING",
  NO_DATA: "NO DATA",
};

export default function ChatWidget({
  onOpenProduct,
}: {
  onOpenProduct: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "offline" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, open]);

  const sendMessage = async (value: string) => {
    const message = value.trim();
    if (!message || sending) return;

    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    const userEntry: ChatEntry = { id: Date.now(), role: "user", content: message };
    setMessages((items) => [...items, userEntry]);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const response = await sendChat(message, history);
      setMode(response.mode);
      setMessages((items) => [
        ...items,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.reply,
          products: response.products,
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "I couldn't send that just now. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="commerce-chat">
      {open && (
        <section className="commerce-chat-panel" aria-label="CommerceIQ Assistant">
          <header className="commerce-chat-header">
            <div>
              <strong>CommerceIQ Assistant</strong>
              <span className={`commerce-chat-mode ${mode === "ai" ? "is-ai" : ""}`}>
                {mode === "ai" ? "AI" : "Basic mode"}
              </span>
            </div>
            <button
              className="commerce-chat-close"
              type="button"
              aria-label="Close chat"
              title="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="commerce-chat-messages" aria-live="polite">
            <div className="commerce-chat-row assistant-row">
              <div className="commerce-chat-bubble assistant-bubble">
                Hi! Tell me what you’re shopping for, your budget, or ask whether a product looks like a good buy.
              </div>
            </div>

            {messages.length === 0 && (
              <div className="commerce-chat-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((entry) => (
              <div
                className={`commerce-chat-row ${entry.role === "user" ? "user-row" : "assistant-row"}`}
                key={entry.id}
              >
                <div className={`commerce-chat-bubble ${entry.role === "user" ? "user-bubble" : "assistant-bubble"}`}>
                  {entry.content}
                </div>
                {entry.role === "assistant" && entry.products && entry.products.length > 0 && (
                  <div className="commerce-chat-products">
                    {entry.products.map((product) => (
                      <button
                        className="commerce-chat-product"
                        key={product.id}
                        type="button"
                        onClick={() => onOpenProduct(product.id)}
                      >
                        {product.image ? (
                          <img src={product.image} alt="" />
                        ) : (
                          <span className="commerce-chat-product-image">CI</span>
                        )}
                        <span className="commerce-chat-product-info">
                          <span className="commerce-chat-product-title">{product.title}</span>
                          <span className="commerce-chat-product-price">
                            ₹{product.price.toLocaleString("en-IN")}
                            {product.rating !== null && ` · ★ ${product.rating.toFixed(1)}`}
                          </span>
                          <span className={`commerce-chat-signal signal-${product.signal.toLowerCase().replace(/_/g, "-")}`}>
                            {signalLabel[product.signal]}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && <div className="commerce-chat-typing">Typing...</div>}
            <div ref={endRef} />
          </div>

          {error && <p className="commerce-chat-error" role="alert">{error}</p>}

          <form className="commerce-chat-form" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about products or deals"
              aria-label="Message CommerceIQ Assistant"
              maxLength={500}
              disabled={sending}
            />
            <button type="submit" aria-label="Send message" title="Send message" disabled={sending || !input.trim()}>
              ↑
            </button>
          </form>
        </section>
      )}

      <button
        className="commerce-chat-toggle"
        type="button"
        aria-label={open ? "Close shopping assistant" : "Open shopping assistant"}
        title="Shopping assistant"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "×" : "✦"}
      </button>
    </div>
  );
}