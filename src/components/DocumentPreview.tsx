import { FormDocumentData } from '../types/forms';
import { AbsenceReportTemplate } from './templates/AbsenceReportTemplate';
import { AttendanceOpinionTemplate } from './templates/AttendanceOpinionTemplate';
import { OtherAbsenceReportTemplate } from './templates/OtherAbsenceReportTemplate';

interface DocumentPreviewProps {
  document: FormDocumentData;
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  return (
    <section className="preview-area">
      {document.templateType === 'absence-1-1' && <AbsenceReportTemplate data={document} />}
      {document.templateType === 'absence-1-2' && <OtherAbsenceReportTemplate data={document} />}
      {document.templateType === 'attendance-opinion' && <AttendanceOpinionTemplate data={document} />}
    </section>
  );
}
