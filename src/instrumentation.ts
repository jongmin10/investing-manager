export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 비동기로 실행 — 첫 요청 지연 방지
    import("./lib/collector").then(({ collectRealtimeData }) =>
      collectRealtimeData()
        .then((result) => {
          if (result.updated.length > 0)
            console.log(`[startup] 지표 업데이트: ${result.updated.join(", ")}`);
        })
        .catch((err) => console.error("[startup] 지표 수집 오류:", err))
    );
  }
}
