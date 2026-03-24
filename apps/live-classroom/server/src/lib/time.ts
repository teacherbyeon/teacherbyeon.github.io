export function parseDbTimestampToMs(value: string | null | undefined): number {
  if (!value) return 0;

  // SQLite CURRENT_TIMESTAMP => 'YYYY-MM-DD HH:MM:SS' (UTC, timezone 미포함)
  // JS Date 파서는 timezone 정보가 없으면 로컬 시간으로 해석할 수 있어 오차가 발생한다.
  // 따라서 UTC 강제 파싱 포맷으로 변환한다.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z').getTime();
  }

  return new Date(value).getTime();
}
