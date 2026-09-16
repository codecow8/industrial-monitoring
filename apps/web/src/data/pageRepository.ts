import {
  clonePageSchema,
  createSeedPageSchema,
  isPageSchema,
  type PageSchema,
} from "@industrial/schema";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type PublishedPage = {
  pageId: string;
  version: number;
  schema: PageSchema;
  publishedAt: string;
};

function parsePublishedPage(value: unknown): PublishedPage {
  if (
    typeof value !== "object" || value === null ||
    !("pageId" in value) || typeof value.pageId !== "string" ||
    !("version" in value) || typeof value.version !== "number" ||
    !("publishedAt" in value) || typeof value.publishedAt !== "string" ||
    !("schema" in value) || !isPageSchema(value.schema)
  ) {
    throw new Error("后端返回了不符合合同的发布版本");
  }
  return {
    pageId: value.pageId,
    version: value.version,
    schema: clonePageSchema(value.schema),
    publishedAt: value.publishedAt,
  };
}

export async function loadPageSchema(pageId: string): Promise<PageSchema> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/draft`);
  if (response.status === 204) return createSeedPageSchema(pageId);
  if (!response.ok) throw new Error(`加载草稿失败（${response.status}）`);

  const value: unknown = await response.json();
  if (!isPageSchema(value)) throw new Error("后端返回了不符合合同的 PageSchema");
  return clonePageSchema(value);
}

export async function savePageSchema(schema: PageSchema): Promise<PageSchema> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(schema.id)}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail ?? `保存草稿失败（${response.status}）`);
  }

  const value: unknown = await response.json();
  if (!isPageSchema(value)) throw new Error("后端返回了不符合合同的 PageSchema");
  return clonePageSchema(value);
}

export async function publishPage(pageId: string): Promise<PublishedPage> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/publish`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(`发布页面失败（${response.status}）`);
  return parsePublishedPage(await response.json());
}

export async function loadPublishedPage(pageId: string): Promise<PublishedPage | null> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/published`);
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`加载发布版本失败（${response.status}）`);
  return parsePublishedPage(await response.json());
}
