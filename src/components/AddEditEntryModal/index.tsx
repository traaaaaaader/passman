import { useEffect, useState } from "react";
import { api, type EntryInput, type EntrySummary, type Section } from "../../lib/api";
import { generatePassword } from "../../lib/generator";
import { flattenSectionTree } from "../../lib/sectionTree";
import { useSettings } from "../../lib/settings";
import { entryFormSchema, firstIssueMessage } from "../../lib/validation";
import { Modal } from "../Modal";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  TextField,
} from "../ui";
import { PasswordField } from "./PasswordField";

interface AddEditEntryModalProps {
  open: boolean;
  onClose: () => void;
  sections: Section[];
  entry?: EntrySummary;
  initialSectionId?: string;
  onSaved: () => void;
}

const DEFAULT_GENERATOR = {
  length: 20,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
};

const emptyInput = (sectionId: string): EntryInput => ({
  sectionId,
  name: "",
  password: "",
  description: "",
  link: "",
});

export function AddEditEntryModal({
  open,
  onClose,
  sections,
  entry,
  initialSectionId,
  onSaved,
}: AddEditEntryModalProps) {
  const { settings } = useSettings();
  const [input, setInput] = useState<EntryInput>(
    emptyInput(initialSectionId ?? sections[0]?.id ?? ""),
  );
  const [generatorOptions, setGeneratorOptions] = useState(
    settings?.generator ?? DEFAULT_GENERATOR,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const defaults = settings?.generator ?? generatorOptions;
    setGeneratorOptions(defaults);

    if (entry) {
      setLoading(true);
      api
        .getEntryPassword(entry.id)
        .then((password) =>
          setInput({
            sectionId: entry.sectionId,
            name: entry.name,
            password,
            description: entry.description,
            link: entry.link,
          }),
        )
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else {
      setInput({
        ...emptyInput(initialSectionId ?? sections[0]?.id ?? ""),
        password: generatePassword(defaults),
      });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- переинициализация формы только при открытии/смене записи, а не при каждом изменении настроек
  }, [open, entry, initialSectionId]);

  const submit = async () => {
    const result = entryFormSchema.safeParse(input);
    if (!result.success) {
      setError(firstIssueMessage(result.error));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (entry) {
        await api.updateEntry(entry.id, result.data);
      } else {
        await api.createEntry(result.data);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const sectionTree = flattenSectionTree(sections);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? "Изменить пароль" : "Новый пароль"}
      widthClassName="sm:max-w-lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="Название"
          placeholder="Например, Gmail"
          value={input.name}
          onChange={(e) => setInput({ ...input, name: e.target.value })}
          autoFocus
        />

        <div>
          <Label htmlFor="section" className="mb-1.5">
            Раздел
          </Label>
          <Select
            value={input.sectionId}
            onValueChange={(sectionId) => setInput({ ...input, sectionId })}
          >
            <SelectTrigger id="section" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sectionTree.map(({ section: s, depth }) => (
                <SelectItem
                  key={s.id}
                  value={s.id}
                  style={{ paddingLeft: 10 + depth * 14 }}
                >
                  {depth > 0 ? "— " : ""}
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PasswordField
          value={input.password}
          onChange={(password) => setInput({ ...input, password })}
          generatorOptions={generatorOptions}
          onGeneratorOptionsChange={setGeneratorOptions}
          initiallyShowGenerator={!entry}
        />

        <TextField
          label="Ссылка"
          placeholder="https://example.com"
          value={input.link}
          onChange={(e) => setInput({ ...input, link: e.target.value })}
        />

        <div>
          <Label htmlFor="description" className="mb-1.5">
            Описание
          </Label>
          <Textarea
            id="description"
            rows={2}
            value={input.description}
            onChange={(e) => setInput({ ...input, description: e.target.value })}
            className="resize-none"
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
