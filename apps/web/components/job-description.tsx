/** Render the stored plain-text description: "- " lines become bullets, the rest paragraphs. */
export function Description({ text }: { text: string }) {
  const blocks: { type: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^(?:[-*•·▪◦]|\d+[.)])\s+/.test(line);
    const clean = line.replace(/^(?:[-*•·▪◦]|\d+[.)])\s+/, "");
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "ul") last.lines.push(clean);
      else blocks.push({ type: "ul", lines: [clean] });
    } else blocks.push({ type: "p", lines: [line] });
  }
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 font-mono text-sm leading-6 text-body marker:text-subtle">
            {b.lines.map((l, k) => (
              <li key={k}>{l}</li>
            ))}
          </ul>
        ) : b.lines[0]!.length < 70 && !/[.!?]$/.test(b.lines[0]!) ? (
          <h3 key={i} className="mt-2 font-mono text-sm font-semibold text-heading">
            {b.lines[0]}
          </h3>
        ) : (
          <p key={i} className="font-mono text-sm leading-6 text-body">
            {b.lines[0]}
          </p>
        ),
      )}
    </div>
  );
}
