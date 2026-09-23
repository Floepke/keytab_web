import { resolveWebSafeFontFamily } from "./model/fonts";

export interface PdfPageSource {
  svg: SVGSVGElement;
  widthMm: number;
  heightMm: number;
}

const PRESENTATION_PROPERTIES = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
  "stroke-linecap", "stroke-linejoin", "font-family", "font-size", "font-weight", "font-style",
  "text-anchor", "dominant-baseline", "opacity",
] as const;
const EXPORT_PIXELS_PER_SVG_PIXEL = 4;

function isNotationElement(element: SVGElement): boolean {
  return element.matches(".score-title, .score-composer, .score-footer, .page-number, .barline, .measure-line, .end-barline, .grid-line, .stave-line, .midi-ledger, .time-signature, .measure-number, .note-stem, .note-stop, .continuation-dot, .beam, .note-outline, .black-notehead")
    || element.closest(".time-signature, .score-note, .beam") !== null;
}

function shouldExportAsBlack(element: SVGElement, property: string, value: string): boolean {
  return isNotationElement(element)
    && (property === "fill" || property === "stroke")
    && value !== "none"
    && !(property === "fill" && element.matches(".white-notehead"));
}

function shouldExportAsWhite(element: SVGElement, property: string): boolean {
  return property === "fill"
    && (element.matches(".white-notehead")
      || (element.matches("rect") && element.closest(".svg-layer-page_background") !== null));
}

async function textImage(text: SVGTextElement, sourceText: SVGTextElement): Promise<SVGImageElement> {
  const box = sourceText.getBBox();
  const padding = 2;
  const x = box.x - padding;
  const y = box.y - padding;
  const width = box.width + padding * 2;
  const height = box.height + padding * 2;
  const textSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  textSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  textSvg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  textSvg.setAttribute("width", String(Math.ceil(width * EXPORT_PIXELS_PER_SVG_PIXEL)));
  textSvg.setAttribute("height", String(Math.ceil(height * EXPORT_PIXELS_PER_SVG_PIXEL)));
  textSvg.append(text.cloneNode(true));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(textSvg)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not render score text for PDF export."));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * EXPORT_PIXELS_PER_SVG_PIXEL);
    canvas.height = Math.ceil(height * EXPORT_PIXELS_PER_SVG_PIXEL);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create PDF text canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const replacement = document.createElementNS("http://www.w3.org/2000/svg", "image");
    replacement.setAttribute("x", String(x));
    replacement.setAttribute("y", String(y));
    replacement.setAttribute("width", String(width));
    replacement.setAttribute("height", String(height));
    replacement.setAttribute("preserveAspectRatio", "none");
    replacement.setAttribute("href", canvas.toDataURL("image/png"));
    return replacement;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportSvg(source: SVGSVGElement): Promise<SVGSVGElement> {
  const copy = source.cloneNode(true) as SVGSVGElement;

  const sourceElements = [source, ...source.querySelectorAll<SVGElement>("*")];
  const copyElements = [copy, ...copy.querySelectorAll<SVGElement>("*")];
  sourceElements.forEach((element, index) => {
    const target = copyElements[index];
    if (!target) return;
    const styles = getComputedStyle(element);
    const resolved = PRESENTATION_PROPERTIES
      .map((property) => {
        const value = property === "font-family" ? resolveWebSafeFontFamily(styles.getPropertyValue(property)) : styles.getPropertyValue(property);
        const exportValue = shouldExportAsWhite(element, property) ? "#ffffff" : shouldExportAsBlack(element, property, value) ? "#000000" : value;
        return `${property}:${exportValue}`;
      })
      .join(";");
    target.setAttribute("style", `${target.getAttribute("style") ?? ""};${resolved}`);
  });
  copy.querySelectorAll("[data-export='exclude']").forEach((element) => element.remove());
  const sourceText = [...source.querySelectorAll<SVGTextElement>("text")].filter((element) => !element.closest("[data-export='exclude']"));
  const copyText = [...copy.querySelectorAll<SVGTextElement>("text")];
  for (const [index, text] of copyText.entries()) {
    const original = sourceText[index];
    if (!original) continue;
    text.replaceWith(await textImage(text, original));
  }
  copy.removeAttribute("class");
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return copy;
}

export async function exportScorePdf(pages: readonly PdfPageSource[], filename: string): Promise<void> {
  if (!pages.length) throw new Error("No score pages to export.");
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");
  const first = pages[0];
  const pdf = new jsPDF({ unit: "mm", format: [first.widthMm, first.heightMm], compress: true });

  for (const [index, page] of pages.entries()) {
    if (index > 0) pdf.addPage([page.widthMm, page.heightMm]);
    const svg = await exportSvg(page.svg);
    await pdf.svg(svg, { x: 0, y: 0, width: page.widthMm, height: page.heightMm });
  }
  pdf.save(filename);
}