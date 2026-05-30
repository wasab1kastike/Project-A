import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CONTENT_DIR = join(process.cwd(), "src/content/wiki");

/**
 * Simple markdown-to-HTML converter. Handles headings, lists, tables,
 * code blocks, bold, italic, links, paragraphs, and thematic breaks.
 */
function markdownToHtml(md: string): string {
  let html = md;

  // Code blocks (fenced) — must run before inline code
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_: string, lang: string, code: string) => {
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<pre><code class="language-${lang}">${escaped}</code></pre>`;
    },
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings (must run before bold/italic)
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Thematic break
  html = html.replace(/^---$/gm, "<hr />");

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Tables — convert pipe tables to HTML
  html = html.replace(
    /^\|(.+)\|\n\|[-| :]+\|\n((?:^\|.+\|\n?)*)/gm,
    (_match: string, headerRow: string, bodyRows: string) => {
      const headers = headerRow
        .split("|")
        .map((h) => h.trim())
        .filter(Boolean);
      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row) =>
          row
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean),
        );

      const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      return `<table>${thead}${tbody}</table>`;
    },
  );

  // Unordered lists — group adjacent `- ` lines
  html = html.replace(/((?:^- .+\n?)+)/gm, (_match: string, list: string) => {
    const items = list
      .trim()
      .split("\n")
      .map((line) => `<li>${line.replace(/^- /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists — group adjacent `1. ` lines
  html = html.replace(
    /((?:^\d+\. .+\n?)+)/gm,
    (_match: string, list: string) => {
      const items = list
        .trim()
        .split("\n")
        .map((line) => `<li>${line.replace(/^\d+\. /, "")}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    },
  );

  // Paragraphs — wrap remaining text blocks
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs and stray newlines
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/\n/g, " ");

  return html;
}

export async function getWikiPage(
  slug: string,
): Promise<{ content: string } | null> {
  try {
    const filePath = join(CONTENT_DIR, `${slug}.md`);
    const raw = await readFile(filePath, "utf-8");
    const html = markdownToHtml(raw);
    return { content: html };
  } catch {
    return null;
  }
}
