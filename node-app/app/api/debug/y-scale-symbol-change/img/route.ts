import { NextResponse } from "next/server";
import fs from "fs";

const SCREENSHOT_DIR = "/app/screenshots";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("f");

  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const imgPath = `${SCREENSHOT_DIR}/${filename}`;

  if (!fs.existsSync(imgPath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(imgPath);
  const stat = fs.statSync(imgPath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
      "X-Last-Modified": stat.mtime.toISOString(),
    },
  });
}
