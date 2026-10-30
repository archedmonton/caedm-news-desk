import * as React from "react";

/**
 * Minimal Markdown renderer for our own docs (the user guide): headings, paragraphs, lists, tables, quotes,
 * rules, bold, italics, code and links. Output is React elements, so text is always escaped.
 */

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function safeHref(href: string) {
  return /^(https?:\/\/|\/|#|mailto:)/i.test(href) ? href : null;
}

function inline(text: string, key = "i"): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2]) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[4]) out.push(<em key={k}>{inline(m[4], k)}</em>);
    else if (m[6]) out.push(<code key={k}>{m[6]}</code>);
    else if (m[8]) {
      const href = safeHref(m[9]);
      out.push(
        href ? (
          <a key={k} href={href} {...(/^https?:/i.test(href) ? { target: "_blank", rel: "noreferrer" } : {})}>
            {inline(m[8], k)}
          </a>
        ) : (
          m[8]
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export type Heading = { level: number; text: string; id: string };

export function parseHeadings(md: string): Heading[] {
  return md
    .split(/\r?\n/)
    .map((l) => /^(#{2,3})\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ level: m[1].length, text: m[2].replace(/[*`]/g, ""), id: slug(m[2]) }));
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = `h${h[1].length}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(
        <Tag key={key} id={slug(h[2])}>
          {inline(h[2], key)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {cells(head).map((c, j) => (
                  <th key={j}>{inline(c, `${key}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {cells(r).map((c, j) => (
                    <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key}>{inline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    const list = /^(\s*)([-*]|\d+\.)\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
        // Indented continuation lines belong to the item above.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    const para: string[] = [lines[i++].trim()];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||---|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return <>{blocks}</>;
}
