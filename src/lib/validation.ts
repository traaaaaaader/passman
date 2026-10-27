import { z } from "zod";

export const masterPasswordSchema = z
  .string()
  .min(8, "Пароль должен быть не короче 8 символов");

export const setupMasterPasswordSchema = z
  .object({
    password: masterPasswordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Пароли не совпадают",
    path: ["confirm"],
  });

export const changeMasterPasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "Укажите текущий пароль"),
    newPassword: masterPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Новые пароли не совпадают",
    path: ["confirmPassword"],
  });

export const sectionNameSchema = z
  .string()
  .trim()
  .min(1, "Название раздела не может быть пустым")
  .max(60, "Слишком длинное название раздела");

export const entryFormSchema = z.object({
  sectionId: z.string().min(1, "Выберите раздел"),
  name: z.string().trim().min(1, "Укажите название записи").max(120),
  password: z.string().min(1, "Укажите или сгенерируйте пароль"),
  description: z.string().max(500),
  link: z.string().max(300),
});

// Тот же алфавит, что и в Rust-ядре (без 0/O, 1/I/L — чтобы не путать
// похожие символы при переписывании кода вручную).
const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const PAIRING_CODE_LENGTH = 12;
export const PAIRING_CODE_GROUP_SIZE = 4;

export const pairingCodeInputSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
  .refine(
    (value) =>
      value.length === PAIRING_CODE_LENGTH &&
      Array.from(value).every((char) => PAIRING_CODE_ALPHABET.includes(char)),
    `Код должен состоять из ${PAIRING_CODE_LENGTH} символов (буквы и цифры, без 0/O/1/I/L)`,
  );

export const deviceNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите имя устройства")
  .max(60, "Слишком длинное имя устройства");

/** Достаёт первое читаемое сообщение об ошибке из результата safeParse. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Некорректные данные";
}
