/**
 * /api/film/parse-file — 把 multipart/form-data 上传的剧本/小说文件解析成纯文本。
 *
 * 支持后缀：.txt / .md / .docx / .pdf
 *  - txt/md：直接读 UTF-8 文本
 *  - docx：用 mammoth 抽取 raw text
 *  - pdf：用 pdf-parse v2 (PDFParse class) 抽取文本
 *
 * 历史踩坑：
 *   早期直接用 pdfjs-dist v6 → 在 Next.js 16 + Turbopack 下 fake worker 解析
 *   `import.meta.url` 指向 .next 编译产物，找不到 pdf.worker.mjs。
 *   即便手动设了 GlobalWorkerOptions.workerSrc 也会在 Turbopack 静态分析阶段
 *   把 worker 路径当成 app-route chunk 重写。
 *   现改用 pdf-parse@2，并在 next.config.ts 把 pdf-parse / pdfjs-dist 都列入
 *   serverExternalPackages，让 Node ESM 在运行时按 node_modules 真实路径解析，
 *   规避 Turbopack 的 import 重写。
 *
 * 文本超 20000 字时截断并返回 truncated=true，避免后续 LLM 上下文爆炸。
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXT_LEN = 20000;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const filename = (file.name || "").toLowerCase();
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";

    let raw = "";
    if (ext === ".txt" || ext === ".md") {
      raw = await file.text();
    } else if (ext === ".docx") {
      raw = await parseDocx(file);
    } else if (ext === ".pdf") {
      raw = await parsePdf(file);
    } else {
      return NextResponse.json(
        { error: `不支持的文件格式：${ext || "(无后缀)"}，仅支持 .txt / .md / .docx / .pdf` },
        { status: 400 },
      );
    }

    const normalized = normalize(raw);
    const truncated = normalized.length > MAX_TEXT_LEN;
    const text = truncated ? normalized.slice(0, MAX_TEXT_LEN) : normalized;

    return NextResponse.json({
      text,
      truncated,
      originalLength: normalized.length,
      filename: file.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `解析失败：${message}` }, { status: 500 });
  }
}

/* ── docx ── */
async function parseDocx(file: File): Promise<string> {
  // mammoth 是 CJS（`export = mammoth`），动态 import 在 Node ESM 下会被包成 { default }；
  // 加上回退取 mod 自身，兼容打包链路把它扁平化的情况。
  const mod = await import("mammoth");
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

/* ── pdf (pdf-parse v2) ── */
async function parsePdf(file: File): Promise<string> {
  // pdf-parse@2 暴露 PDFParse 类。Node 环境下走内置 pdfjs（serverExternalPackages
  // 标记后真实路径解析），逐页 getText 已经在内部完成。
  const mod = await import("pdf-parse");
  const PDFParseCtor =
    (mod as unknown as { PDFParse?: typeof import("pdf-parse").PDFParse }).PDFParse ??
    (mod as unknown as { default?: { PDFParse?: typeof import("pdf-parse").PDFParse } }).default
      ?.PDFParse;
  if (!PDFParseCtor) {
    throw new Error("pdf-parse: PDFParse class not found in module exports");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const parser = new PDFParseCtor({ data });
  try {
    const result = await parser.getText();
    // result.text 已经是按页拼接好的字符串。
    return result.text || "";
  } finally {
    await parser.destroy();
  }
}

function normalize(s: string): string {
  // 统一换行（\r\n / \r → \n）并压减连续空行。
  const unified = s.split(/\r\n?/).join("\n");
  return unified.replace(/\n{3,}/g, "\n\n").trim();
}
