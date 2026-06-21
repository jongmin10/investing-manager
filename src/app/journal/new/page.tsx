"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import JournalForm from "../_form";

export default function NewJournalPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  async function handleSubmit(values: Parameters<typeof JournalForm>[0]["onSubmit"] extends (v: infer V) => unknown ? V : never) {
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "저장 실패");
    }
    const { entry } = await res.json();
    router.push(`/journal/${entry.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/journal" className="hover:text-gray-600 transition-colors">투자 일기</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">새 일기</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">📔 새 일기 작성</h1>
      <JournalForm onSubmit={handleSubmit} submitLabel="일기 저장" />
    </div>
  );
}
