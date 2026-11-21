export type VaultCategory =
  | "academic"
  | "government"
  | "career"
  | "legal"
  | "personal";

export interface VaultDocument {
  id: string;
  title: string;
  originalFilename: string;
  originalFileName?: string;
  storageKey: string;
  fileSize: number;
  fileSizeBytes?: number;
  mimeType: string;
  fileType?: "pdf" | "image" | "document" | "archive" | "other";
  category: VaultCategory;
  tags: string[];
  notes?: string;
  uploadedAt: string;
  updatedAt: string;
  pinned: boolean;
}

export interface VaultStats {
  totalFiles: number;
  totalDocuments?: number;
  totalSizeBytes: number;
  categoryCounts: Record<VaultCategory, number>;
  byCategory?: Record<VaultCategory, number>;
}

export interface VaultStore {
  documents: VaultDocument[];
  updatedAt: string;
}
