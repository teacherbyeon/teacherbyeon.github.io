import { createSampleDocument } from '../data/defaultSamples';
import { FormDocumentData } from '../types/forms';

const STORAGE_KEY = 'school-attendance-documents-v1';
const ACTIVE_DOC_KEY = 'school-attendance-active-document-id-v1';

interface StoredShape {
  documents: FormDocumentData[];
}

export const storageKeys = {
  documents: STORAGE_KEY,
  activeId: ACTIVE_DOC_KEY,
};

export const loadDocuments = (): FormDocumentData[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const sample = createSampleDocument();
    saveDocuments([sample]);
    saveActiveDocumentId(sample.id);
    return [sample];
  }

  try {
    const parsed = JSON.parse(raw) as StoredShape;
    if (!parsed.documents?.length) {
      const sample = createSampleDocument();
      saveDocuments([sample]);
      saveActiveDocumentId(sample.id);
      return [sample];
    }
    return parsed.documents;
  } catch {
    const sample = createSampleDocument();
    saveDocuments([sample]);
    saveActiveDocumentId(sample.id);
    return [sample];
  }
};

export const saveDocuments = (documents: FormDocumentData[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ documents }));
};

export const loadActiveDocumentId = (): string | null => localStorage.getItem(ACTIVE_DOC_KEY);

export const saveActiveDocumentId = (id: string): void => {
  localStorage.setItem(ACTIVE_DOC_KEY, id);
};
