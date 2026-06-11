import { documentSections } from "./catalog";
import coverageSurfaces from "./coverage.json";

export type DocumentCoverageSurface = {
  id: string;
  title: string;
  paths: string[];
  requiredDocumentIds: string[];
};

export type DocumentCoverageResult = {
  ok: boolean;
  missing: Array<{ surface: string; documentId: string }>;
};

export const documentCoverageSurfaces = coverageSurfaces satisfies DocumentCoverageSurface[];

export function auditDocumentCoverage(): DocumentCoverageResult {
  const documentIds = new Set(documentSections.flatMap((section) => section.entries.map((entry) => entry.id)));
  const missing = documentCoverageSurfaces.flatMap((surface) =>
    surface.requiredDocumentIds
      .filter((documentId) => !documentIds.has(documentId))
      .map((documentId) => ({ surface: surface.id, documentId }))
  );

  return {
    ok: missing.length === 0,
    missing
  };
}
