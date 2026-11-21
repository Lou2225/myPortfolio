import fs from "fs/promises";
import path from "path";
import { VaultCategory, VaultDocument, VaultStats, VaultStore } from "@/types/vault";
import {
  resolveLocalDataDir,
  StorageReadError,
  StorageWriteError,
} from "@/lib/storageCore";

function getLocalVaultStorePath(): string {
  return path.join(resolveLocalDataDir(), "vault-documents.json");
}

export function getLocalVaultStorageDir(): string {
  return path.join(resolveLocalDataDir(), "vault");
}

const EMPTY_VAULT_STORE: VaultStore = {
  documents: [],
  updatedAt: new Date(0).toISOString(),
};

export async function readVaultStore(): Promise<VaultStore> {
  const filePath = getLocalVaultStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.documents)) {
      return {
        documents: parsed.documents,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
    return EMPTY_VAULT_STORE;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return EMPTY_VAULT_STORE;
    }
    throw new StorageReadError(
      `Failed to read vault documents registry: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function mutateVaultStore(
  mutator: (store: VaultStore) => VaultStore | Promise<VaultStore>
): Promise<VaultStore> {
  const dir = resolveLocalDataDir();
  await fs.mkdir(dir, { recursive: true });
  const storePath = getLocalVaultStorePath();

  const current = await readVaultStore();
  const next = await mutator(current);
  next.updatedAt = new Date().toISOString();

  const tempPath = `${storePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(next, null, 2), "utf-8");
    await fs.rename(tempPath, storePath);
    return next;
  } catch (err) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw new StorageWriteError(
      `Failed to persist vault documents registry: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function listVaultDocuments(options?: {
  category?: VaultCategory | "all";
  search?: string;
}): Promise<VaultDocument[]> {
  const store = await readVaultStore();
  let list = [...store.documents];

  if (options?.category && options.category !== "all") {
    list = list.filter((doc) => doc.category === options.category);
  }

  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    list = list.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.originalFilename.toLowerCase().includes(q) ||
        doc.tags.some((t) => t.toLowerCase().includes(q)) ||
        (doc.notes && doc.notes.toLowerCase().includes(q))
    );
  }

  // Pinned items first, then descending by upload date
  return list.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
}

export async function getVaultDocumentById(id: string): Promise<VaultDocument | null> {
  const store = await readVaultStore();
  return store.documents.find((doc) => doc.id === id) || null;
}

export async function saveVaultDocument(doc: VaultDocument): Promise<VaultDocument> {
  await mutateVaultStore((store) => {
    const existingIdx = store.documents.findIndex((d) => d.id === doc.id);
    const documents = [...store.documents];
    if (existingIdx !== -1) {
      documents[existingIdx] = doc;
    } else {
      documents.unshift(doc);
    }
    return { ...store, documents };
  });
  return doc;
}

export async function updateVaultDocument(
  id: string,
  updates: Partial<Omit<VaultDocument, "id" | "storageKey" | "fileSize" | "mimeType">>
): Promise<VaultDocument | null> {
  let updatedDoc: VaultDocument | null = null;
  await mutateVaultStore((store) => {
    const existingIdx = store.documents.findIndex((d) => d.id === id);
    if (existingIdx === -1) return store;
    const existing = store.documents[existingIdx];
    const nextDoc: VaultDocument = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    updatedDoc = nextDoc;
    const documents = [...store.documents];
    documents[existingIdx] = nextDoc;
    return { ...store, documents };
  });
  return updatedDoc;
}

export async function deleteVaultDocument(id: string): Promise<VaultDocument | null> {
  let deletedDoc: VaultDocument | null = null;
  await mutateVaultStore((store) => {
    const existing = store.documents.find((d) => d.id === id);
    if (!existing) return store;
    deletedDoc = existing;
    return {
      ...store,
      documents: store.documents.filter((d) => d.id !== id),
    };
  });
  return deletedDoc;
}

export async function getVaultStats(): Promise<VaultStats> {
  const store = await readVaultStore();
  const categoryCounts: Record<VaultCategory, number> = {
    academic: 0,
    government: 0,
    career: 0,
    legal: 0,
    personal: 0,
  };

  let totalSizeBytes = 0;
  for (const doc of store.documents) {
    totalSizeBytes += doc.fileSize;
    if (doc.category in categoryCounts) {
      categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
    }
  }

  return {
    totalFiles: store.documents.length,
    totalDocuments: store.documents.length,
    totalSizeBytes,
    categoryCounts,
    byCategory: categoryCounts,
  };
}
