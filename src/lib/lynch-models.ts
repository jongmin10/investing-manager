// 피터 린치 종목분석 — LLM 모델 선택 단일 출처(allowlist).
// 프론트(드롭다운)·백엔드(검증·호출) 양쪽이 이 상수를 import 한다. 임의 변경 시
// docs/peter-lynch-feature-spec.md §5 의 모델 계약도 함께 갱신할 것.
//
// 각 항목:
//  - id        : 내부 키 / API 파라미터로 받는 값 (안정적, 변경 금지). 프론트·DB가 공유.
//  - slug      : OpenRouter /chat/completions 의 model 파라미터로 전달하는 실제 slug.
//                (OpenRouter 모델 페이지에서 검증 완료 — 2026-06 기준)
//  - label     : 사용자 표시용 한글 라벨 (드롭다운).
//  - isDefault : 기본 선택 모델 플래그. 정확히 하나만 true.

export interface LynchModelOption {
  id: string;
  slug: string;
  label: string;
  isDefault: boolean;
}

export const LYNCH_MODELS: readonly LynchModelOption[] = [
  {
    id: "claude-haiku-4-5",
    slug: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5 (빠름·기본)",
    isDefault: true,
  },
  // Sonnet 4.6 은 OpenRouter 잔액 부족(402)으로 일시 제외(2026-06).
  // 단가가 높아 max_tokens=2500 선예약 비용을 현재 크레딧이 감당 못함.
  // 크레딧 충전 후 아래 항목을 되살리면 드롭다운·백엔드에 다시 노출된다:
  //   { id: "claude-sonnet-4-6", slug: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 (정밀)", isDefault: false },
  {
    id: "gemini-2-5-flash",
    slug: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    isDefault: false,
  },
] as const;

// 기본 모델 — allowlist 의 isDefault 항목 (없으면 첫 항목으로 폴백).
export const DEFAULT_LYNCH_MODEL: LynchModelOption =
  LYNCH_MODELS.find((m) => m.isDefault) ?? LYNCH_MODELS[0];

// id 로 모델 옵션 조회. id 가 없거나(undefined/null) allowlist 에 없으면 기본 모델로 폴백.
// 반환은 항상 유효한 LynchModelOption — 호출부는 별도 검증 불필요.
export function resolveLynchModel(id: string | null | undefined): LynchModelOption {
  if (!id) return DEFAULT_LYNCH_MODEL;
  return LYNCH_MODELS.find((m) => m.id === id) ?? DEFAULT_LYNCH_MODEL;
}

// 주어진 id 가 allowlist 에 존재하는 유효 id 인지.
export function isValidLynchModelId(id: string | null | undefined): boolean {
  return !!id && LYNCH_MODELS.some((m) => m.id === id);
}
