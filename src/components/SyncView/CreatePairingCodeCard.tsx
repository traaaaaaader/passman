import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type PairingCode } from "../../lib/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui";
import { formatTimeLeft } from "./formatTimeLeft";

export function CreatePairingCodeCard() {
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена может быть недоступен (например, в мобильном WebView
      // вне пользовательского жеста) — код всё равно виден на экране.
    }
  };

  useEffect(() => {
    if (!pairing) return undefined;
    const id = setInterval(() => setTimeLeft(formatTimeLeft(pairing.expiresAt)), 1000);
    setTimeLeft(formatTimeLeft(pairing.expiresAt));
    return () => clearInterval(id);
  }, [pairing]);

  const createCode = async () => {
    setCreating(true);
    try {
      setPairing(await api.createPairingCode());
    } catch (error) {
      console.error("Не удалось создать код приглашения:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пригласить устройство</CardTitle>
        <CardDescription>
          Создайте код на этом устройстве и введите его на другом
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pairing ? (
          <div className="border-border bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div>
              <p className="text-foreground font-mono text-lg font-semibold tracking-widest sm:text-xl">
                {pairing.code}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Истекает через {timeLeft}
              </p>
            </div>
            <button
              onClick={() => void copyCode()}
              title="Скопировать код"
              className="text-muted-foreground hover:bg-card hover:text-primary rounded-md p-2"
            >
              {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
            </button>
          </div>
        ) : (
          <Button onClick={() => void createCode()} disabled={creating}>
            {creating ? "Генерация…" : "Создать код приглашения"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
