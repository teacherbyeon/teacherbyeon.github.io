import { FormDocumentData } from '../types/forms';
import { formatDateIso, getDayOfWeekKo, getInclusiveDayCount } from '../utils/date';

const today = new Date();
const start = formatDateIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
const end = formatDateIso(today);

export const createSampleDocument = (): FormDocumentData => ({
  id: crypto.randomUUID(),
  title: '샘플 - 2학년 3반 김광려 결석신고서',
  templateType: 'absence-1-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  studentInfo: {
    grade: '2',
    classNumber: '3',
    studentNumber: '17',
    name: '김광려',
  },
  guardianInfo: {
    guardianName: '박보호',
  },
  absenceInfo: {
    reason: '질병으로 인한 결석',
    diseaseName: '독감',
    appeal: '병원 진료 및 처방에 따라 가정 안정',
    otherDetail: '해당 없음',
    startDate: start,
    startDayOfWeek: getDayOfWeekKo(start),
    endDate: end,
    endDayOfWeek: getDayOfWeekKo(end),
    days: String(getInclusiveDayCount(start, end)),
  },
  attendanceInfo: {
    year: String(today.getFullYear()),
    month: String(today.getMonth() + 1),
    day: String(today.getDate()),
    dayOfWeek: getDayOfWeekKo(formatDateIso(today)),
    startPeriod: '2',
    endPeriod: '4',
    processType: '지각',
    reason: '병원 진료 후 등교',
  },
  writingDate: formatDateIso(today),
  opinionWritingDate: formatDateIso(today),
  homeroomTeacherName: '이담임',
  homeroomOpinion: '상기 내용은 보호자 확인 및 학생 상담 내용을 바탕으로 사실에 부합함을 확인합니다.',
  approvalConfig: {
    includeVicePrincipal: false,
    useExecutiveDecision: true,
  },
});
