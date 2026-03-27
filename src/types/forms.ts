export type TemplateType = 'absence-1-1' | 'absence-1-2' | 'attendance-opinion';

export interface StudentInfo {
  grade: string;
  classNumber: string;
  studentNumber: string;
  name: string;
}

export interface GuardianInfo {
  guardianName: string;
}

export interface AbsenceInfo {
  reason: string;
  diseaseName: string;
  appeal: string;
  otherDetail: string;
  startDate: string;
  startDayOfWeek: string;
  endDate: string;
  endDayOfWeek: string;
  days: string;
}

export interface AttendanceInfo {
  year: string;
  month: string;
  day: string;
  dayOfWeek: string;
  startPeriod: string;
  endPeriod: string;
  processType: '지각' | '조퇴' | '결과';
  reason: string;
}

export interface ApprovalConfig {
  includeVicePrincipal: boolean;
  useExecutiveDecision: boolean;
}

export interface FormDocumentData {
  id: string;
  title: string;
  templateType: TemplateType;
  createdAt: string;
  updatedAt: string;
  studentInfo: StudentInfo;
  guardianInfo: GuardianInfo;
  absenceInfo: AbsenceInfo;
  attendanceInfo: AttendanceInfo;
  writingDate: string;
  opinionWritingDate: string;
  homeroomTeacherName: string;
  homeroomOpinion: string;
  approvalConfig: ApprovalConfig;
}

export interface DocumentListItem {
  id: string;
  title: string;
  templateType: TemplateType;
  updatedAt: string;
}

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  'absence-1-1': '서식 1-1 결석신고서',
  'absence-1-2': '서식 1-2 (기타) 결석신고서',
  'attendance-opinion': '서식 2 인정/기타 확인 담임의견서',
};

export const PROCESS_TYPE_OPTIONS: AttendanceInfo['processType'][] = ['지각', '조퇴', '결과'];
