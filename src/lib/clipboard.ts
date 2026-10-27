let pendingClear: ReturnType<typeof setTimeout> | null = null;

/**
 * Копирует значение в буфер обмена и планирует его очистку через заданное
 * время — но только если буфер к этому моменту всё ещё содержит то же
 * значение (пользователь не скопировал что-то новое поверх).
 */
export async function copyWithAutoClear(value: string, clearAfterSeconds: number) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // На некоторых мобильных WebView (в частности iOS WKWebView) доступ к
    // буферу обмена может быть запрещён вне явного пользовательского жеста —
    // даём вызывающему коду показать понятную ошибку вместо необработанного
    // отказа промиса.
    throw new Error("Не удалось скопировать — буфер обмена недоступен");
  }

  if (pendingClear) clearTimeout(pendingClear);
  pendingClear = setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === value) {
        await navigator.clipboard.writeText("");
      }
    } catch {
      // доступ к буферу обмена может быть запрещён — тогда просто пропускаем очистку
    }
  }, clearAfterSeconds * 1000);
}
