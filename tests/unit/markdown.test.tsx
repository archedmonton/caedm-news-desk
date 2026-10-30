import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseHeadings } from "@/lib/markdown";
import { BRIEF_TIMES, briefScheduleLabel, formatClock } from "@/lib/notify/brief-schedule";

const html = (md: string) => renderToStaticMarkup(<Markdown source={md} />);

describe("user guide markdown", () => {
  it("renders headings with anchors, lists, tables and inline formatting", () => {
    const out = html("## Your brief\n\n- **Time:** any half hour\n- Days\n\n| A | B |\n|---|---|\n| `x` | [guide](/guide) |\n\nPlain *text*.");
    expect(out).toContain('<h2 id="your-brief">Your brief</h2>');
    expect(out).toContain("<li><strong>Time:</strong> any half hour</li>");
    expect(out).toContain("<td><code>x</code></td>");
    expect(out).toContain('<a href="/guide">guide</a>');
    expect(out).toContain("<p>Plain <em>text</em>.</p>");
  });

  it("joins indented continuation lines into the list item", () => {
    expect(html("1. First line\n   continues here.\n2. Second")).toContain("<li>First line continues here.</li>");
  });

  it("escapes HTML and refuses unsafe links", () => {
    const out = html('<script>alert(1)</script> and [bad](javascript:alert(1))');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("javascript:");
  });

  it("never loops on lines that look like syntax but aren't", () => {
    expect(html("---not a rule\n#not-a-heading")).toContain("<p>---not a rule #not-a-heading</p>");
  });

  it("lists level-2 and level-3 headings for the contents", () => {
    expect(parseHeadings("# Title\n## One\n### Two\n#### Three")).toEqual([
      { level: 2, text: "One", id: "one" },
      { level: 3, text: "Two", id: "two" },
    ]);
  });
});

describe("personal brief schedule", () => {
  it("offers every half hour from 5 am to 9 pm", () => {
    expect(BRIEF_TIMES[0]).toBe("05:00");
    expect(BRIEF_TIMES.at(-1)).toBe("21:00");
    expect(BRIEF_TIMES).toContain("07:30");
  });

  it("describes the schedule in plain words", () => {
    expect(formatClock("07:30")).toMatch(/^7:30\sa\.?m\.?$/);
    expect(briefScheduleLabel({ digestTime: null, digestDays: "weekdays" }, "08:00")).toMatch(/^Weekdays at 8:00\sa\.?m\.?$/);
  });
});
