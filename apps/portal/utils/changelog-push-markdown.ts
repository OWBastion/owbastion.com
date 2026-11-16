// QQBot splits a body above 2000 characters into several messages. A push stays below that limit,
// so players get one message and open the full changelog through the link.
const BODY_LIMIT = 1500;

type Input = { version: string; title: string; markdown: string; siteUrl: string; limit?: number };

/** Builds the Markdown that QQBot sends: version heading, whole H2 sections that fit, and the changelog link. */
export function composeChangelogPush({ version, title, markdown, siteUrl, limit = BODY_LIMIT }: Input): string {
  const heading = `# ${version} ${title}`;
  const link = `[查看完整更新日志](${new URL(`/changelog/${version}`, siteUrl)})`;
  const budget = limit - heading.length - link.length - 20;

  const kept: string[] = [];
  let used = 0;
  let truncated = false;
  for (const section of markdown.trim().split(/^(?=## )/m).map((part) => part.trim()).filter(Boolean)) {
    if (used + section.length > budget) { truncated = true; break; }
    kept.push(section);
    used += section.length;
  }
  // The first section alone is too long: keep its leading lines.
  if (!kept.length && markdown.trim()) {
    const lines: string[] = [];
    let size = 0;
    for (const line of markdown.trim().split("\n")) {
      if (size + line.length + 1 > budget) break;
      lines.push(line);
      size += line.length + 1;
    }
    kept.push(lines.join("\n").trim());
  }
  return [heading, ...kept, truncated ? `内容较长，仅列出开头。${link}` : link].join("\n\n");
}
