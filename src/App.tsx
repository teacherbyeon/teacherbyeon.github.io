import { useEffect, useMemo, useState } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { FormSelector } from './components/FormSelector';
import { DocumentPreview } from './components/DocumentPreview';
import { createSampleDocument } from './data/defaultSamples';
import { FormDocumentData, TemplateType } from './types/forms';
import { getDayOfWeekKo, getInclusiveDayCount, splitDateParts } from './utils/date';
import { loadActiveDocumentId, loadDocuments, saveActiveDocumentId, saveDocuments } from './utils/storage';

function App() {
  const [documents, setDocuments] = useState<FormDocumentData[]>(() => loadDocuments());
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => loadActiveDocumentId());

  useEffect(() => {
    if (!activeDocumentId && documents[0]) {
      setActiveDocumentId(documents[0].id);
    }
  }, [activeDocumentId, documents]);

  const activeDocument = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? documents[0],
    [documents, activeDocumentId],
  );

  useEffect(() => {
    saveDocuments(documents);
  }, [documents]);

  useEffect(() => {
    if (activeDocumentId) saveActiveDocumentId(activeDocumentId);
  }, [activeDocumentId]);

  const updateActiveDocument = (updater: (prev: FormDocumentData) => FormDocumentData) => {
    if (!activeDocument) return;

    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id !== activeDocument.id) return doc;

        const updated = updater(doc);
        const startDay = getDayOfWeekKo(updated.absenceInfo.startDate);
        const endDay = getDayOfWeekKo(updated.absenceInfo.endDate);
        const dayCount = getInclusiveDayCount(updated.absenceInfo.startDate, updated.absenceInfo.endDate);
        const dateParts = splitDateParts(updated.writingDate);

        return {
          ...updated,
          updatedAt: new Date().toISOString(),
          absenceInfo: {
            ...updated.absenceInfo,
            startDayOfWeek: startDay !== '__' ? startDay : updated.absenceInfo.startDayOfWeek,
            endDayOfWeek: endDay !== '__' ? endDay : updated.absenceInfo.endDayOfWeek,
            days: dayCount > 0 ? String(dayCount) : updated.absenceInfo.days,
          },
          attendanceInfo: {
            ...updated.attendanceInfo,
            year: dateParts.year || updated.attendanceInfo.year,
            month: dateParts.month || updated.attendanceInfo.month,
            day: dateParts.day || updated.attendanceInfo.day,
            dayOfWeek: getDayOfWeekKo(updated.writingDate) !== '__' ? getDayOfWeekKo(updated.writingDate) : updated.attendanceInfo.dayOfWeek,
          },
        };
      }),
    );
  };

  const handleCreate = () => {
    const doc = createSampleDocument();
    setDocuments((prev) => [doc, ...prev]);
    setActiveDocumentId(doc.id);
  };

  const handleDelete = (id: string) => {
    setDocuments((prev) => {
      const next = prev.filter((doc) => doc.id !== id);
      if (!next.length) {
        const sample = createSampleDocument();
        setActiveDocumentId(sample.id);
        return [sample];
      }
      if (id === activeDocumentId) setActiveDocumentId(next[0].id);
      return next;
    });
  };

  const handleTemplateChange = (templateType: TemplateType) => {
    updateActiveDocument((prev) => ({
      ...prev,
      templateType,
      title: `${templateType === 'attendance-opinion' ? '담임의견서' : '결석신고서'} - ${prev.studentInfo.name || '미기입'}`,
      approvalConfig: {
        ...prev.approvalConfig,
        includeVicePrincipal: templateType === 'absence-1-2' ? prev.approvalConfig.includeVicePrincipal : false,
      },
    }));
  };

  if (!activeDocument) return null;

  return (
    <div className="app-layout">
      <aside className="left-panel print-hidden">
        <h1>출결 서식 작성 시스템 (MVP)</h1>
        <FormSelector
          documents={documents.map((doc) => ({ id: doc.id, title: doc.title, templateType: doc.templateType, updatedAt: doc.updatedAt }))}
          activeDocumentId={activeDocument.id}
          onSelectDocument={setActiveDocumentId}
          onCreateDocument={handleCreate}
          onDeleteDocument={handleDelete}
          onTemplateTypeChange={handleTemplateChange}
          currentTemplateType={activeDocument.templateType}
        />
        <EditorPanel document={activeDocument} onChange={updateActiveDocument} onPrint={() => window.print()} />
      </aside>

      <main className="right-preview">
        <DocumentPreview document={activeDocument} />
      </main>
    </div>
  );
}

export default App;
