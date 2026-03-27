import { DocumentListItem, TEMPLATE_LABELS, TemplateType } from '../types/forms';

interface FormSelectorProps {
  documents: DocumentListItem[];
  activeDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onCreateDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onTemplateTypeChange: (templateType: TemplateType) => void;
  currentTemplateType: TemplateType;
}

export function FormSelector({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
  onTemplateTypeChange,
  currentTemplateType,
}: FormSelectorProps) {
  return (
    <section className="panel-section">
      <h2>문서 관리</h2>
      <div className="control-row">
        <label htmlFor="templateType">서식 종류</label>
        <select
          id="templateType"
          value={currentTemplateType}
          onChange={(e) => onTemplateTypeChange(e.target.value as TemplateType)}
        >
          {Object.entries(TEMPLATE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar">
        <button type="button" onClick={onCreateDocument}>
          새 문서
        </button>
      </div>

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className={doc.id === activeDocumentId ? 'active' : ''}>
            <button type="button" onClick={() => onSelectDocument(doc.id)} className="doc-item-button">
              <strong>{doc.title}</strong>
              <span>{TEMPLATE_LABELS[doc.templateType]}</span>
              <small>{new Date(doc.updatedAt).toLocaleString('ko-KR')}</small>
            </button>
            <button type="button" className="danger" onClick={() => onDeleteDocument(doc.id)}>
              삭제
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
