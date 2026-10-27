import { useState } from "react";
import { api } from "../../lib/api";
import {
  deviceNameSchema,
  firstIssueMessage,
  pairingCodeInputSchema,
} from "../../lib/validation";
import { Button, Card, CardContent, CardHeader, CardTitle, TextField } from "../ui";

export function JoinByCodeCard({ onJoined }: { onJoined: () => void }) {
  const [incomingCode, setIncomingCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const join = async () => {
    setError(null);
    const code = pairingCodeInputSchema.safeParse(incomingCode);
    if (!code.success) {
      setError(firstIssueMessage(code.error));
      return;
    }
    const name = deviceNameSchema.safeParse(deviceName);
    if (!name.success) {
      setError(firstIssueMessage(name.error));
      return;
    }
    setJoining(true);
    try {
      await api.redeemPairingCode(code.data, name.data);
      setIncomingCode("");
      setDeviceName("");
      onJoined();
    } catch (e) {
      setError(String(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Подключиться по коду</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <TextField
            label="Код с другого устройства"
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            maxLength={16}
            inputClassName="font-mono uppercase"
            value={incomingCode}
            onChange={(e) => setIncomingCode(e.target.value)}
          />
          <TextField
            label="Название этого устройства"
            placeholder="Например, Ноутбук"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" variant="secondary" disabled={joining}>
            {joining ? "Подключение…" : "Подключиться"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
