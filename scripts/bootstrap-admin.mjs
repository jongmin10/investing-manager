/**
 * 관리자(및 임의 사용자) 비밀번호 부트스트랩 (규격: docs/signup-auth-spec.md §6-B).
 *
 * 공유 비밀번호 → 개인 비밀번호 전환 시, 기존 passwordHash==null 계정(운영자 포함)은
 * 로그인이 불가해진다. 이 스크립트로 로그인 절차 전환 "이전에" 운영자 비밀번호를
 * 먼저 주입해 자기 잠금을 방지한다.
 *
 * 대상 계정이 없으면 생성하고, 있으면 passwordHash 를 설정/갱신한다.
 *
 * 사용법 (PowerShell):
 *   $env:ADMIN_BOOTSTRAP_EMAIL="you@example.com"
 *   $env:ADMIN_BOOTSTRAP_PASSWORD="8자이상비밀번호"
 *   node scripts/bootstrap-admin.mjs
 *
 * (Prisma가 .env 를 자동 로드하므로 DATABASE_URL 은 .env 값 사용.)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const COST = 10;
const prisma = new PrismaClient();

async function main() {
  const emailRaw = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!emailRaw || !password) {
    console.error("✗ ADMIN_BOOTSTRAP_EMAIL 과 ADMIN_BOOTSTRAP_PASSWORD 환경변수가 필요합니다.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("✗ 비밀번호는 최소 8자 이상이어야 합니다.");
    process.exit(1);
  }

  const email = emailRaw.trim().toLowerCase();
  const name = email.split("@")[0];
  const passwordHash = await bcrypt.hash(password, COST);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    console.log(`✓ 기존 계정(${email})의 비밀번호를 설정했습니다.`);
  } else {
    await prisma.user.create({ data: { email, name, passwordHash } });
    console.log(`✓ 신규 계정(${email})을 생성하고 비밀번호를 설정했습니다.`);
  }

  console.log("→ 이제 이 이메일/비밀번호로 로그인할 수 있습니다.");
  console.log("→ 관리자 권한은 별도로 Vercel env ADMIN_EMAILS 에 이 이메일이 포함되어야 합니다.");
}

main()
  .catch((e) => {
    console.error("✗ 부트스트랩 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
