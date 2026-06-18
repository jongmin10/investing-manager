export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { collectRealtimeData } = await import("./lib/collector");
    try {
      const result = await collectRealtimeData();
      if (result.updated.length > 0) {
        console.log(`[startup] 지표 업데이트: ${result.updated.join(", ")}`);
      } else {
        console.log("[startup] 지표 이미 최신 상태");
      }
      if (result.failed.length > 0) {
        console.warn(`[startup] 수집 실패: ${result.failed.join(", ")}`);
      }
    } catch (err) {
      console.error("[startup] 지표 수집 오류:", err);
    }
  }
}
