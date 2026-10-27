import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// Схемы валидируют всё, что приходит через Tauri IPC из Rust-ядра: сам по
// себе TypeScript-тип ничего не проверяет в рантайме, а данные (особенно
// vault.json) в будущем могут прийти повреждёнными, из старой версии формата
// или — после появления P2P-синка — с другого устройства.

export const vaultStatusSchema = z.object({
  initialized: z.boolean(),
  unlocked: z.boolean(),
});
export type VaultStatus = z.infer<typeof vaultStatusSchema>;

export const rateLimitStatusSchema = z.object({
  isLocked: z.boolean(),
  lockoutRemainingMs: z.number(),
  remainingAttempts: z.number(),
});
export type RateLimitStatus = z.infer<typeof rateLimitStatusSchema>;

export const sectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.number(),
});
export type Section = z.infer<typeof sectionSchema>;

export const entrySummarySchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  name: z.string(),
  description: z.string(),
  link: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  passwordLength: z.number(),
});
export type EntrySummary = z.infer<typeof entrySummarySchema>;

export interface EntryInput {
  sectionId: string;
  name: string;
  password: string;
  description: string;
  link: string;
}

export const generatorDefaultsSchema = z.object({
  length: z.number().int().min(6).max(64),
  uppercase: z.boolean(),
  lowercase: z.boolean(),
  digits: z.boolean(),
  symbols: z.boolean(),
});
export type GeneratorDefaults = z.infer<typeof generatorDefaultsSchema>;

export const themeNameSchema = z.enum(["light", "dark"]);
export type ThemeName = z.infer<typeof themeNameSchema>;

export const settingsSchema = z.object({
  theme: themeNameSchema,
  generator: generatorDefaultsSchema,
  clipboardClearSeconds: z.number().int().min(5).max(600),
});
export type Settings = z.infer<typeof settingsSchema>;

export const pairedDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pairedAt: z.number(),
});
export type PairedDevice = z.infer<typeof pairedDeviceSchema>;

export const pairingCodeSchema = z.object({
  code: z.string(),
  expiresAt: z.number(),
});
export type PairingCode = z.infer<typeof pairingCodeSchema>;

export const DEFAULT_SECTION_ID = "general";

async function call<T>(
  schema: z.ZodType<T>,
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const raw = await invoke(command, args);
  return schema.parse(raw);
}

export const api = {
  vaultStatus: () => call(vaultStatusSchema, "vault_status"),
  rateLimitStatus: () => call(rateLimitStatusSchema, "rate_limit_status"),
  setupMasterPassword: (password: string) =>
    invoke<void>("setup_master_password", { password }),
  unlockVault: (password: string) => invoke<void>("unlock_vault", { password }),
  lockVault: () => invoke<void>("lock_vault"),
  changeMasterPassword: (oldPassword: string, newPassword: string) =>
    invoke<void>("change_master_password", { oldPassword, newPassword }),

  getSettings: () => call(settingsSchema, "get_settings"),
  updateSettings: (settings: Settings) =>
    call(settingsSchema, "update_settings", { settings }),

  listSections: () => call(z.array(sectionSchema), "list_sections"),
  createSection: (name: string, color: string, parentId: string | null = null) =>
    call(sectionSchema, "create_section", { name, color, parentId }),
  renameSection: (id: string, name: string) =>
    call(sectionSchema, "rename_section", { id, name }),
  deleteSection: (id: string) => invoke<void>("delete_section", { id }),

  listEntries: (sectionId?: string) =>
    call(z.array(entrySummarySchema), "list_entries", {
      sectionId: sectionId ?? null,
    }),
  getEntryPassword: (id: string) => call(z.string(), "get_entry_password", { id }),
  createEntry: (input: EntryInput) => call(entrySummarySchema, "create_entry", { input }),
  updateEntry: (id: string, input: EntryInput) =>
    call(entrySummarySchema, "update_entry", { id, input }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),

  createPairingCode: () => call(pairingCodeSchema, "create_pairing_code"),
  redeemPairingCode: (code: string, deviceName: string) =>
    call(pairedDeviceSchema, "redeem_pairing_code", { code, deviceName }),
  listPairedDevices: () => call(z.array(pairedDeviceSchema), "list_paired_devices"),
  removePairedDevice: (id: string) => invoke<void>("remove_paired_device", { id }),
};
