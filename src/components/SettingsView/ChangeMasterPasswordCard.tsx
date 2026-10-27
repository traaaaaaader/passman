import { useState } from "react";
import { api } from "../../lib/api";
import { changeMasterPasswordSchema, firstIssueMessage } from "../../lib/validation";
import { Button, Card, CardContent, CardHeader, CardTitle, TextField } from "../ui";

export function ChangeMasterPasswordCard() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSuccess(false);
    const result = changeMasterPasswordSchema.safeParse({
      oldPassword,
      newPassword,
      confirmPassword,
    });
    if (!result.success) {
      setError(firstIssueMessage(result.error));
      return;
    }
    setSaving(true);
    try {
      await api.changeMasterPassword(result.data.oldPassword, result.data.newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Сменить мастер-пароль</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label="Текущий пароль"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <TextField
            label="Новый пароль"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <TextField
            label="Повторите новый пароль"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          {success && <p className="text-primary text-sm">Мастер-пароль обновлён</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение…" : "Сменить пароль"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
