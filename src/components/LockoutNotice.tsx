import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface LockoutNoticeProps {
  initialRemainingMs: number;
  onExpire: () => void;
}

/** Обратный отсчёт до снятия блокировки после серии неудачных попыток входа. */
export function LockoutNotice({ initialRemainingMs, onExpire }: LockoutNoticeProps) {
  const [remaining, setRemaining] = useState(initialRemainingMs);

  useEffect(() => {
    setRemaining(initialRemainingMs);
    if (initialRemainingMs <= 0) return undefined;

    const start = Date.now();
    const id = setInterval(() => {
      const left = initialRemainingMs - (Date.now() - start);
      if (left <= 0) {
        clearInterval(id);
        setRemaining(0);
        onExpire();
      } else {
        setRemaining(left);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [initialRemainingMs, onExpire]);

  return (
    <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
      Хранилище временно заблокировано. Повторите через {formatRemaining(remaining)}.
    </div>
  );
}
