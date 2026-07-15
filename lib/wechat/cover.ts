import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const coverWidth = 900;
const coverHeight = 383;

const bundledChineseFont = "NotoSerifCJKsc-Regular.otf";

export type GeneratedWechatCover = {
  path: string;
  cleanup: () => Promise<void>;
};

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Wechat cover date must use YYYY-MM-DD format");
  }

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error("Wechat cover date is invalid");
  }

  return { year, month, day };
}

function getBundledChineseFontFiles() {
  return [join(process.cwd(), "assets", "fonts", bundledChineseFont)];
}

function buildCoverSvg(dateLabel: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${coverWidth}" height="${coverHeight}" viewBox="0 0 ${coverWidth} ${coverHeight}">
      <rect width="${coverWidth}" height="${coverHeight}" fill="#f6f2ea"/>
      <rect x="28" y="28" width="844" height="327" rx="3" fill="#f6f2ea" stroke="#ded8cc" stroke-width="2"/>
      <text x="450" y="145" text-anchor="middle" fill="#000070" font-family="Noto Serif CJK SC" font-size="58" font-weight="700" letter-spacing="8">丁香知讯</text>
      <text x="450" y="237" text-anchor="middle" fill="#00008b" font-family="Times New Roman, Times, serif" font-size="74" font-weight="400" letter-spacing="5">${dateLabel}</text>
      <text x="450" y="302" text-anchor="middle" fill="#000070" font-family="Noto Serif CJK SC" font-size="28" font-weight="500" letter-spacing="10">通知汇总</text>
    </svg>
  `;
}

export async function generateWechatCover(date: string): Promise<GeneratedWechatCover> {
  const { year, month, day } = parseDate(date);
  const directory = await mkdtemp(join(tmpdir(), "hitnotice-wechat-cover-"));
  const outputPath = join(directory, `cover-${year}${month}${day}.png`);

  try {
    const renderer = new Resvg(buildCoverSvg(`${month}.${day}`), {
      fitTo: { mode: "original" },
      font: {
        fontFiles: getBundledChineseFontFiles(),
        loadSystemFonts: true,
        defaultFontFamily: "Noto Serif CJK SC",
        serifFamily: "Noto Serif CJK SC"
      },
      textRendering: 2
    });
    const rendered = renderer.render();
    if (rendered.width !== coverWidth || rendered.height !== coverHeight) {
      throw new Error("Generated Wechat cover has unexpected dimensions or format");
    }
    await writeFile(outputPath, rendered.asPng());
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    path: outputPath,
    cleanup: () => rm(directory, { recursive: true, force: true })
  };
}
