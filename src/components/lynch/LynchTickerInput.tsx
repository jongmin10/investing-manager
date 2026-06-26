"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LYNCH_MODELS, DEFAULT_LYNCH_MODEL } from "@/lib/lynch-models";

interface StockSuggestion {
  id: string;   // 6자리 종목코드
  name: string;
  market: string;
  sector: string | null;
}

interface Props {
  onSubmit: (ticker: string) => void;
  disabled?: boolean;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}

const TICKER_RE = /^\d{6}$/;

export default function LynchTickerInput({
  onSubmit,
  disabled = false,
  selectedModel = DEFAULT_LYNCH_MODEL.id,
  onModelChange,
}: Props) {
  const [value,        setValue]        = useState("");
  const [suggestions,  setSuggestions]  = useState<StockSuggestion[]>([]);
  const [universe,     setUniverse]     = useState<StockSuggestion[]>([]);
  const [open,         setOpen]         = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(-1);
  const [error,        setError]        = useState<string | null>(null);
  const [warning,      setWarning]      = useState<string | null>(null);
  const [universeLoaded, setUniverseLoaded] = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 마운트 시 universe 1회 fetch
  useEffect(() => {
    fetch("/api/screener?market=ALL&sortBy=high52wRatio&limit=200")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.items) {
          setUniverse(
            (data.items as StockSuggestion[]).map((s) => ({
              id: s.id,
              name: s.name,
              market: s.market,
              sector: s.sector,
            }))
          );
          setUniverseLoaded(true);
        }
      })
      .catch(() => setUniverseLoaded(true));
  }, []);

  // 자동완성 필터 (2글자+ 전방일치, 최대 8개)
  const updateSuggestions = useCallback(
    (input: string) => {
      if (input.length < 2 || !universeLoaded) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      const q = input.toLowerCase();
      const filtered = universe
        .filter(
          (s) =>
            s.id.startsWith(q) ||
            s.name.toLowerCase().startsWith(q) ||
            s.name.toLowerCase().includes(q)
        )
        .slice(0, 8);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
      setActiveIdx(-1);
    },
    [universe, universeLoaded]
  );

  function validate(ticker: string): { ok: boolean; error?: string; warning?: string } {
    if (!TICKER_RE.test(ticker)) {
      return { ok: false, error: "6자리 숫자 코드를 입력하세요 (예: 005930)" };
    }
    const inUniverse = universe.some((s) => s.id === ticker);
    if (!inUniverse && universeLoaded) {
      return { ok: true, warning: "수집 유니버스(코스피·코스닥 상위 200)에 없는 종목입니다. 데이터 부족 가능성이 있습니다." };
    }
    return { ok: true };
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setValue(raw);
    setError(null);
    setWarning(null);
    updateSuggestions(raw);
  }

  function handleSelect(stock: StockSuggestion) {
    setValue(stock.id);
    setOpen(false);
    setError(null);
    setWarning(null);
    inputRef.current?.focus();
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const ticker = value.trim();
    const v = validate(ticker);
    if (!v.ok) {
      setError(v.error ?? null);
      return;
    }
    if (v.warning) setWarning(v.warning);
    else setWarning(null);
    setOpen(false);
    onSubmit(ticker);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "Enter") handleSubmit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        handleSelect(suggestions[activeIdx]);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // 활성 항목 스크롤 유지
  useEffect(() => {
    if (activeIdx >= 0 && listboxRef.current) {
      const item = listboxRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  const listboxId = "lynch-ticker-listbox";
  const activeDescId = activeIdx >= 0 ? `lynch-option-${activeIdx}` : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div ref={containerRef} className="relative">
        {/* 모델 선택 */}
        {onModelChange && (
          <div className="flex items-center gap-2 mb-2">
            <label
              htmlFor="lynch-model-select"
              className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0"
            >
              분석 모델
            </label>
            <select
              id="lynch-model-select"
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={disabled}
              className="flex-1 sm:flex-none sm:w-auto px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="피터 린치 분석에 사용할 AI 모델 선택"
            >
              {LYNCH_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          {/* 종목코드 입력 */}
          <div className="flex-1 relative">
            <label htmlFor="lynch-ticker" className="sr-only">
              한국 종목코드 6자리 입력
            </label>
            <input
              id="lynch-ticker"
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={20}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => value.length >= 2 && updateSuggestions(value)}
              disabled={disabled}
              placeholder="종목코드·회사명 입력 (예: 005930, 삼성전자)"
              aria-label="한국 종목코드 6자리 또는 회사명"
              aria-invalid={!!error}
              aria-describedby={error ? "lynch-ticker-error" : warning ? "lynch-ticker-warning" : undefined}
              aria-autocomplete="list"
              aria-controls={open ? listboxId : undefined}
              aria-activedescendant={activeDescId}
              className={`w-full px-4 py-3 rounded-xl border text-sm font-mono placeholder:font-sans placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                error
                  ? "border-red-300 focus:ring-red-200 bg-red-50"
                  : "border-gray-200 focus:ring-blue-200 bg-white"
              }`}
            />

            {/* 자동완성 드롭다운 */}
            {open && (
              <ul
                id={listboxId}
                ref={listboxRef}
                role="listbox"
                aria-label="종목 자동완성"
                className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-64"
              >
                {suggestions.map((stock, i) => (
                  <li
                    key={stock.id}
                    id={`lynch-option-${i}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(stock); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                      i === activeIdx
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    } ${i > 0 ? "border-t border-gray-50" : ""}`}
                  >
                    <span>
                      <span className="font-mono font-semibold mr-2">{stock.id}</span>
                      <span>{stock.name}</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        stock.market === "KOSPI"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {stock.market}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 분석 버튼 */}
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            aria-label="피터 린치 분석 시작"
          >
            🐢 분석
          </button>
        </div>

        {/* 인라인 에러 */}
        {error && (
          <p
            id="lynch-ticker-error"
            role="alert"
            className="mt-1.5 text-xs text-red-600 flex items-center gap-1"
          >
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}

        {/* 경고 배지 (유니버스 미등재) */}
        {warning && !error && (
          <p
            id="lynch-ticker-warning"
            role="status"
            className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg"
          >
            ⚠ {warning}
          </p>
        )}
      </div>
    </form>
  );
}
