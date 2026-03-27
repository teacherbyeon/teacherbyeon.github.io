import { FormDocumentData, PROCESS_TYPE_OPTIONS } from '../types/forms';

interface EditorPanelProps {
  document: FormDocumentData;
  onChange: (updater: (prev: FormDocumentData) => FormDocumentData) => void;
  onPrint: () => void;
}

export function EditorPanel({ document, onChange, onPrint }: EditorPanelProps) {
  const isAbsenceTemplate = document.templateType !== 'attendance-opinion';

  return (
    <section className="editor-panel">
      <div className="panel-section">
        <h2>인쇄</h2>
        <button type="button" onClick={onPrint}>
          인쇄 / PDF 저장
        </button>
      </div>

      <div className="panel-section">
        <h2>학생 정보</h2>
        <div className="grid-2">
          <LabeledInput label="학년" value={document.studentInfo.grade} onChange={(v) => onChange((p) => ({ ...p, studentInfo: { ...p.studentInfo, grade: v } }))} />
          <LabeledInput label="반" value={document.studentInfo.classNumber} onChange={(v) => onChange((p) => ({ ...p, studentInfo: { ...p.studentInfo, classNumber: v } }))} />
          <LabeledInput label="번호" value={document.studentInfo.studentNumber} onChange={(v) => onChange((p) => ({ ...p, studentInfo: { ...p.studentInfo, studentNumber: v } }))} />
          <LabeledInput label="이름" value={document.studentInfo.name} onChange={(v) => onChange((p) => ({ ...p, studentInfo: { ...p.studentInfo, name: v } }))} />
        </div>
      </div>

      {isAbsenceTemplate ? (
        <div className="panel-section">
          <h2>결석 정보</h2>
          <div className="control-row">
            <label>결석사유 빠른선택</label>
            <div className="quick-buttons">
              {['질병', '가정사정', '기타'].map((item) => (
                <button key={item} type="button" onClick={() => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, reason: item } }))}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <LabeledInput label="결석사유" value={document.absenceInfo.reason} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, reason: v } }))} />
          <LabeledInput label="병명" value={document.absenceInfo.diseaseName} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, diseaseName: v } }))} />
          <LabeledInput label="상고" value={document.absenceInfo.appeal} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, appeal: v } }))} />
          <LabeledInput label="기타(구체적으로)" value={document.absenceInfo.otherDetail} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, otherDetail: v } }))} />

          <div className="grid-2">
            <LabeledInput type="date" label="시작일" value={document.absenceInfo.startDate} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, startDate: v } }))} />
            <LabeledInput label="시작요일" value={document.absenceInfo.startDayOfWeek} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, startDayOfWeek: v } }))} />
            <LabeledInput type="date" label="끝일" value={document.absenceInfo.endDate} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, endDate: v } }))} />
            <LabeledInput label="끝요일" value={document.absenceInfo.endDayOfWeek} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, endDayOfWeek: v } }))} />
            <LabeledInput label="일수" value={document.absenceInfo.days} onChange={(v) => onChange((p) => ({ ...p, absenceInfo: { ...p.absenceInfo, days: v } }))} />
          </div>
        </div>
      ) : (
        <div className="panel-section">
          <h2>인정/기타 처리 정보</h2>
          <div className="grid-2">
            <LabeledInput label="해당연도" value={document.attendanceInfo.year} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, year: v } }))} />
            <LabeledInput label="월" value={document.attendanceInfo.month} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, month: v } }))} />
            <LabeledInput label="일" value={document.attendanceInfo.day} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, day: v } }))} />
            <LabeledInput label="요일" value={document.attendanceInfo.dayOfWeek} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, dayOfWeek: v } }))} />
            <LabeledInput label="시작교시" value={document.attendanceInfo.startPeriod} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, startPeriod: v } }))} />
            <LabeledInput label="끝교시" value={document.attendanceInfo.endPeriod} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, endPeriod: v } }))} />
          </div>

          <div className="control-row">
            <label htmlFor="processType">처리종류</label>
            <select id="processType" value={document.attendanceInfo.processType} onChange={(e) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, processType: e.target.value as FormDocumentData['attendanceInfo']['processType'] } }))}>
              {PROCESS_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <LabeledInput label="사유" value={document.attendanceInfo.reason} onChange={(v) => onChange((p) => ({ ...p, attendanceInfo: { ...p.attendanceInfo, reason: v } }))} />
        </div>
      )}

      <div className="panel-section">
        <h2>서명/의견</h2>
        <div className="grid-2">
          <LabeledInput type="date" label="작성일" value={document.writingDate} onChange={(v) => onChange((p) => ({ ...p, writingDate: v }))} />
          <LabeledInput type="date" label="의견서작성일" value={document.opinionWritingDate} onChange={(v) => onChange((p) => ({ ...p, opinionWritingDate: v }))} />
          <LabeledInput label="보호자성명" value={document.guardianInfo.guardianName} onChange={(v) => onChange((p) => ({ ...p, guardianInfo: { ...p.guardianInfo, guardianName: v } }))} />
          <LabeledInput label="담임이름" value={document.homeroomTeacherName} onChange={(v) => onChange((p) => ({ ...p, homeroomTeacherName: v }))} />
        </div>
        <div className="control-row">
          <label htmlFor="homeroomOpinion">담임확인의견서</label>
          <textarea id="homeroomOpinion" value={document.homeroomOpinion} onChange={(e) => onChange((p) => ({ ...p, homeroomOpinion: e.target.value }))} rows={4} />
        </div>
      </div>

      <div className="panel-section">
        <h2>결재란 설정</h2>
        <label className="check-row">
          <input
            type="checkbox"
            checked={document.approvalConfig.includeVicePrincipal}
            onChange={(e) => onChange((p) => ({ ...p, approvalConfig: { ...p.approvalConfig, includeVicePrincipal: e.target.checked } }))}
          />
          교감 칸 포함
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={document.approvalConfig.useExecutiveDecision}
            onChange={(e) => onChange((p) => ({ ...p, approvalConfig: { ...p.approvalConfig, useExecutiveDecision: e.target.checked } }))}
          />
          전결 표기
        </label>
      </div>
    </section>
  );
}

interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
}

function LabeledInput({ label, value, onChange, type = 'text' }: LabeledInputProps) {
  return (
    <div className="control-row">
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
