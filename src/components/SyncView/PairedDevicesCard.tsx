import { Trash2 } from "lucide-react";
import { api, type PairedDevice } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../ui";

interface PairedDevicesCardProps {
  devices: PairedDevice[];
  onRemoved: () => void;
}

export function PairedDevicesCard({ devices, onRemoved }: PairedDevicesCardProps) {
  const removeDevice = async (id: string) => {
    try {
      await api.removePairedDevice(id);
      onRemoved();
    } catch (error) {
      console.error("Не удалось удалить устройство:", error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Связанные устройства</CardTitle>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">Пока нет связанных устройств</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((device) => (
              <li
                key={device.id}
                className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
                    {device.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Подключено {new Date(device.pairedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => void removeDevice(device.id)}
                  title="Удалить устройство"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex-shrink-0 rounded-md p-1.5"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
