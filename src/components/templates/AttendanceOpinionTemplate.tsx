import { FormDocumentData } from '../../types/forms';
import { formatDateKorean } from '../../utils/date';
import { ApprovalTable } from './AbsenceReportTemplate';

const BLANK = '________________';
const val = (v: string, fallback = BLANK) => (v?.trim() ? v : fallback);

interface Props { data: FormDocumentData }

export function AttendanceOpinionTemplate({ data }: Props) {
  return (
    <article className="doc-page">
      <p className="doc-form-tag">&lt;서식 2&gt;</p>
      <h1 className="doc-title">인정/기타 (지각,조퇴,결과)확인 담임의견서</h1>
      <ApprovalTable includeVicePrincipal={false} useExecutiveDecision={data.approvalConfig.useExecutiveDecision} />

      <p className="doc-student-line">{val(data.studentInfo.grade, '__')}학년&nbsp;&nbsp; {val(data.studentInfo.classNumber, '__')}반&nbsp;&nbsp; {val(data.studentInfo.studentNumber, '__')}번 &nbsp;&nbsp; 이름 : {val(data.studentInfo.name)}</p>

      <p className="doc-paragraph large-gap">
        위 학생은 {val(data.attendanceInfo.year, '____')}년 {val(data.attendanceInfo.month, '__')}월 {val(data.attendanceInfo.day, '__')}일({val(data.attendanceInfo.dayOfWeek, '__')})
        {val(data.attendanceInfo.startPeriod, '__')}교시부터 {val(data.attendanceInfo.endPeriod, '__')}교시까지 아래와 같은 사유로
        인하여 ({data.attendanceInfo.processType}, 조퇴, 결과)처리 하였음을 확인합니다.
      </p>

      <h2 className="doc-subtitle">담임확인의견서</h2>
      <div className="doc-opinion-box tall">{val(data.homeroomOpinion, ' ')}</div>
      <p className="doc-bottom-line">{formatDateKorean(data.opinionWritingDate)} &nbsp;&nbsp;&nbsp;&nbsp; 담임 : {val(data.homeroomTeacherName)} (인)</p>
      <p className="doc-school-name bottom">광려중학교장 귀하</p>
    </article>
  );
}
