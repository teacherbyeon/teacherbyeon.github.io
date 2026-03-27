import { FormDocumentData } from '../../types/forms';
import { formatDateKorean } from '../../utils/date';
import { ApprovalTable } from './AbsenceReportTemplate';

const BLANK = '________________';
const val = (v: string, fallback = BLANK) => (v?.trim() ? v : fallback);

interface Props { data: FormDocumentData }

export function OtherAbsenceReportTemplate({ data }: Props) {
  return (
    <article className="doc-page">
      <p className="doc-form-tag">&lt;서식 1-2&gt;</p>
      <h1 className="doc-title">(기 타) 결 석 신 고 서</h1>
      <ApprovalTable includeVicePrincipal={data.approvalConfig.includeVicePrincipal} useExecutiveDecision={data.approvalConfig.useExecutiveDecision} />

      <p className="doc-student-line">{val(data.studentInfo.grade, '__')}학년&nbsp;&nbsp; {val(data.studentInfo.classNumber, '__')}반&nbsp;&nbsp; {val(data.studentInfo.studentNumber, '__')}번 &nbsp;&nbsp; 이름 : {val(data.studentInfo.name)}</p>
      <p className="doc-paragraph">위 학생은 다음과 같은 사유로 결석하였기에(하기에) 결석신고서를 제출합니다.</p>

      <ol className="doc-list-numbered">
        <li>
          결석사유 : {val(data.absenceInfo.reason)}
          <div>가. 병 명 : {val(data.absenceInfo.diseaseName)}</div>
          <div>나. 상 고 : {val(data.absenceInfo.appeal)}</div>
          <div>다. 기 타(구체적으로) : {val(data.absenceInfo.otherDetail)}</div>
        </li>
        <li>
          결석 일자 : {val(data.absenceInfo.startDate)}({val(data.absenceInfo.startDayOfWeek, '__')}요일) ~ {val(data.absenceInfo.endDate)}({val(data.absenceInfo.endDayOfWeek, '__')}요일), ({val(data.absenceInfo.days, '__')}일수)일간
        </li>
      </ol>

      <p className="doc-center">{formatDateKorean(data.writingDate)}</p>
      <p className="doc-sign-line">학&nbsp;&nbsp;생 : {val(data.studentInfo.name)} &nbsp;&nbsp; (인)</p>
      <p className="doc-sign-line">학부모 : {val(data.guardianInfo.guardianName)} &nbsp;&nbsp; (인)</p>
      <p className="doc-school-name">광려중학교장 귀하</p>
      <h2 className="doc-subtitle">담임확인의견서</h2>
      <div className="doc-opinion-box">{val(data.homeroomOpinion, ' ')}</div>
      <p className="doc-bottom-line">{formatDateKorean(data.opinionWritingDate)} &nbsp;&nbsp;&nbsp;&nbsp; 담임 : {val(data.homeroomTeacherName)} (인)</p>
      <p className="doc-note">※ 결석신고서는 결석한 날로부터 5일 이내에 제출하여야 유효함.</p>
    </article>
  );
}
