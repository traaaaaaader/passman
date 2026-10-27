import { useCallback, useEffect, useState } from "react";
import { api, type RateLimitStatus } from "./api";

/** Статус защиты от перебора мастер-пароля — опрашивается на экране входа. */
export function useRateLimitStatus() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);

  const refresh = useCallback(() => {
    void api
      .rateLimitStatus()
      .then(setStatus)
      .catch((error: unknown) =>
        console.error("Не удалось получить статус блокировки:", error),
      );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}
