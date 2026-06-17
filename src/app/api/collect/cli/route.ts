import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// OECD CLI 데이터를 실제 API에서 수집 (월 1회 갱신 권장)
export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "collect-cli.mjs");
    const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
      timeout: 60000,
      cwd: process.cwd(),
    });

    if (stderr && !stdout) {
      return NextResponse.json({ success: false, error: stderr }, { status: 500 });
    }

    revalidatePath("/");
    return NextResponse.json({ success: true, output: stdout });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
