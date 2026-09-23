export const DEFAULT_FONT_FAMILY = "Courier";

export const WEB_SAFE_FONT_FAMILIES = [
  "Arial",
  "Arial Black",
  "Comic Sans MS",
  "Courier",
  "Courier New",
  "Georgia",
  "Impact",
  "Lucida Console",
  "Palatino Linotype",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "serif",
  "sans-serif",
  "monospace",
] as const;

export type WebSafeFontFamily = typeof WEB_SAFE_FONT_FAMILIES[number];

export function resolveWebSafeFontFamily(family: string): WebSafeFontFamily {
  const normalized = family.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  const match = WEB_SAFE_FONT_FAMILIES.find((candidate) => candidate.toLowerCase() === normalized);
  return match ?? DEFAULT_FONT_FAMILY;
}