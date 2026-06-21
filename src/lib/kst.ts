// 한국 시간(KST, UTC+9) 기준 날짜 유틸.
// Vercel 서버는 UTC로 동작하므로, 한국 사용자 기준 "오늘"을 일관되게 계산하기 위해 사용한다.
// (cron이 07:00 KST에 돌 때 UTC 날짜로 스냅샷을 찍으면 isUpToDate가 조기에 풀리는 문제 방지)

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각(기본: 현재)을 KST 기준 "YYYY-MM-DD" 문자열로 반환 */
export function kstDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 달력 하루의 [시작, 끝]을 UTC Date로 반환 (DB 범위 쿼리용) */
export function kstDayRange(dateStr: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateStr}T00:00:00.000+09:00`),
    end:   new Date(`${dateStr}T23:59:59.999+09:00`),
  };
}
