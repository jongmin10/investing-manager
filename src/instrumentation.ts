export async function register() {
  // 기동 시 자동수집은 Supabase 풀(Transaction 모드)을 점유해 부팅 직후 1~2분간
  // 로그인 등 다른 쿼리를 60초 타임아웃(ECHECKOUTTIMEOUT)으로 막는다. 로컬 개발에선
  // DISABLE_STARTUP_COLLECTION=true 로 꺼서 로그인을 안정화한다(운영은 미설정 → 동작 유지).
  if (process.env.DISABLE_STARTUP_COLLECTION === "true") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 경제지표 수집 (비동기 — 첫 요청 블로킹 방지)
    import("./lib/collector").then(({ collectRealtimeData }) =>
      collectRealtimeData()
        .then((result) => {
          if (result.updated.length > 0)
            console.log(`[startup] 지표 업데이트: ${result.updated.join(", ")}`);
        })
        .catch((err) => console.error("[startup] 지표 수집 오류:", err))
    );

    // 종목 스크리너 + 재무 데이터 자동 수집 (데이터 없을 때만)
    import("./lib/prisma").then(async ({ prisma }) => {
      try {
        const snapshotCount = await prisma.stockSnapshot.count();

        if (snapshotCount === 0) {
          console.log("[startup] 스크리너 스냅샷 없음 — 주가 수집 시작");
          const { collectAllStocks } = await import("./lib/stock-collector");
          const result = await collectAllStocks();
          console.log(`[startup] 주가 수집 완료: ${result.updated}개 업데이트`);
        } else {
          console.log(`[startup] 스크리너 스냅샷 ${snapshotCount}개 확인`);
        }

        // DART 재무 데이터 확인 (DART_API_KEY 있을 때만)
        if (process.env.DART_API_KEY) {
          const financialCount = await prisma.stockFinancial.count();
          if (financialCount === 0) {
            console.log("[startup] 재무 데이터 없음 — DART 수집 시작");
            const { collectAllFinancials } = await import("./lib/dart-collector");
            const result = await collectAllFinancials();
            console.log(`[startup] 재무 수집 완료: ${result.updated}개 업데이트`);
          } else {
            console.log(`[startup] 재무 데이터 ${financialCount}개 확인`);
          }
        }
      } catch (err) {
        console.error("[startup] 스크리너 자동 수집 오류:", err);
      }
    });
  }
}
