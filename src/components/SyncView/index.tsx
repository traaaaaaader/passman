import { Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type PairedDevice } from "../../lib/api";
import { CreatePairingCodeCard } from "./CreatePairingCodeCard";
import { JoinByCodeCard } from "./JoinByCodeCard";
import { PairedDevicesCard } from "./PairedDevicesCard";

export function SyncView() {
  const [devices, setDevices] = useState<PairedDevice[]>([]);

  const refreshDevices = useCallback(() => {
    void api
      .listPairedDevices()
      .then(setDevices)
      .catch((error: unknown) =>
        console.error("Не удалось загрузить устройства:", error),
      );
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-foreground flex items-center gap-2 text-xl font-semibold">
          <Share2 size={20} className="text-primary" />
          Синхронизация устройств
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Пэйринг устройств по коду без облака — те же данные на телефоне и на компьютере.
        </p>
      </div>

      <div className="border-primary/30 bg-accent text-accent-foreground rounded-lg border px-4 py-3 text-sm">
        Это предварительный интерфейс. Реальная передача данных по P2P-сети пока не
        реализована — коды и устройства ниже не синхронизируют пароли между приложениями.
      </div>

      <CreatePairingCodeCard />
      <JoinByCodeCard onJoined={refreshDevices} />
      <PairedDevicesCard devices={devices} onRemoved={refreshDevices} />
    </div>
  );
}
