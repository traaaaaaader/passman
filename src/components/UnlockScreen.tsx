import { Shield } from "lucide-react";
import { useState } from "react";
import { useRateLimitStatus } from "../lib/useRateLimitStatus";
import { useSession } from "../lib/session";
import {
  firstIssueMessage,
  masterPasswordSchema,
  setupMasterPasswordSchema,
} from "../lib/validation";
import { LockoutNotice } from "./LockoutNotice";
import { Button, Card, CardContent, TextField } from "./ui";

export function UnlockScreen() {
  const { status, setupMasterPassword, unlock } = useSession();
  const { status: rateLimit, refresh: refreshRateLimit } = useRateLimitStatus();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!status) return null;
  const isSetup = !status.initialized;
  const isLocked = !isSetup && Boolean(rateLimit?.isLocked);

  const submit = async () => {
    setError(null);
    if (isSetup) {
      const result = setupMasterPasswordSchema.safeParse({ password, confirm });
      if (!result.success) {
        setError(firstIssueMessage(result.error));
        return;
      }
    } else {
      const result = masterPasswordSchema.safeParse(password);
      if (!result.success) {
        setError(firstIssueMessage(result.error));
        return;
      }
    }
    setLoading(true);
    try {
      if (isSetup) {
        await setupMasterPassword(password);
      } else {
        await unlock(password);
      }
    } catch (e) {
      setError(String(e));
      if (!isSetup) refreshRateLimit();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background flex h-full w-full items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent>
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="bg-accent mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <Shield size={24} className="text-primary" />
            </div>
            <h1 className="text-foreground text-lg font-semibold">
              {isSetup ? "Создайте мастер-пароль" : "Разблокировать Passman"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isSetup
                ? "Он защищает доступ к вашему хранилищу. Запомните его — восстановить будет нельзя."
                : "Введите мастер-пароль, чтобы открыть хранилище."}
            </p>
          </div>

          {isLocked && rateLimit && (
            <div className="mb-4">
              <LockoutNotice
                initialRemainingMs={rateLimit.lockoutRemainingMs}
                onExpire={refreshRateLimit}
              />
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextField
              label="Мастер-пароль"
              type="password"
              autoFocus
              autoComplete={isSetup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLocked}
            />
            {isSetup && (
              <TextField
                label="Повторите пароль"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            {error && !isLocked && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || isLocked}>
              {loading ? "Проверка…" : isSetup ? "Создать хранилище" : "Разблокировать"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
