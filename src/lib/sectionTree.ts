import type { Section } from "./api";

export interface SectionTreeNode {
  section: Section;
  depth: number;
}

/**
 * Разворачивает плоский список разделов в порядок обхода дерева в глубину
 * (родитель, затем все его потомки), с указанием глубины вложенности —
 * удобно для рендера плоского `<select>` с отступами.
 */
export function flattenSectionTree(sections: Section[]): SectionTreeNode[] {
  const childrenByParent = new Map<string | null, Section[]>();
  for (const section of sections) {
    const key = section.parentId;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(section);
    childrenByParent.set(key, siblings);
  }

  const result: SectionTreeNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const section of childrenByParent.get(parentId) ?? []) {
      result.push({ section, depth });
      visit(section.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

/** Id переданного раздела и всех его потомков на любом уровне вложенности. */
export function collectSectionAndDescendantIds(
  sections: Section[],
  rootId: string,
): string[] {
  const childrenByParent = new Map<string, Section[]>();
  for (const section of sections) {
    if (!section.parentId) continue;
    const siblings = childrenByParent.get(section.parentId) ?? [];
    siblings.push(section);
    childrenByParent.set(section.parentId, siblings);
  }

  const ids: string[] = [rootId];
  const visit = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      ids.push(child.id);
      visit(child.id);
    }
  };
  visit(rootId);
  return ids;
}
