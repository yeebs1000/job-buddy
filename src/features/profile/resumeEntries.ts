const bullet = /^[•●▪◦*-]\s*/;
const school = /university|college|polytechnic|institute|school|\b(?:HKU|NUS|NTU|MIT|UCLA|HKUST|CUHK|SMU)\b/i;
const qualification = /bachelor|master|doctor|diploma|\b(?:BSc|BEng|BA|BS|BBA|MSc|MEng|MBA|MFin|PhD)\b/i;
const role = /\b(?:engineer|manager|intern|analyst|executive|director|president|consultant|developer|specialist|officer|associate|designer|coordinator|researcher|assistant|accountant|lead|CEO|CTO|CFO)\b/i;
const monthPattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const datePattern = `(?:${monthPattern}\\.?\\s+\\d{4}|\\d{4}-(?:0[1-9]|1[0-2])|(?:19|20)\\d{2})`;
const rangePattern = new RegExp(`\\b${datePattern}\\s*(?:[-–—]|\\bto\\b)\\s*(?:Expected\\s+)?(?:${datePattern}|Present|Current)\\b`, "i");
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
const looksRole = (value: string) => !bullet.test(value) && value.length <= 200 && role.test(value) && !/[.!?]$/.test(value);

function range(line: string) { return bullet.test(line) ? null : rangePattern.exec(line); }
function period(value: string): Record<string, string> {
  const tokens = value.match(new RegExp(`${monthPattern}\\.?\\s+\\d{4}|\\d{4}-(?:0[1-9]|1[0-2])|\\b(?:Present|Current)\\b`, "gi")) ?? [];
  const [first, last] = tokens;
  if (!first || !last || /present|current/i.test(first)) return {};
  const convert = (token: string) => /^\d{4}-\d{2}$/.test(token) ? token : `${token.match(/\d{4}/)![0]}-${String(months.indexOf(token.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}`;
  return { startMonth: convert(first), ...(/present|current/i.test(last) ? { current: "true" } : { endMonth: convert(last) }) };
}

function joinDescription(lines: string[]): string {
  const result: string[] = [];
  for (const line of lines.filter(Boolean)) {
    if (bullet.test(line) || !result.length) result.push(tidy(line));
    else result[result.length - 1] += ` ${tidy(line)}`;
  }
  return result.join("\n").slice(0, 2000);
}

export function parseResumeEntries(kind: "education" | "experience" | "projects", lines: string[]): { values: Record<string, string>; source: string; expected: boolean }[] {
  const blocks: string[][] = [];
  const bulletProjects = kind === "projects" && bullet.test(lines.find(Boolean) ?? "");
  let block: string[] = [];
  let blank = false;
  const finish = () => { if (block.length) blocks.push(block); block = []; };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) { blank = true; continue; }
    const date = range(line);
    const prefix = date ? line.slice(0, date.index).trim() : "";
    const next: string[] = [];
    for (let lookahead = index + 1; lookahead < lines.length && next.length < 2; lookahead++) {
      if (lines[lookahead]) next.push(lines[lookahead]);
    }
    const dateAhead = next.some((value) => { const match = range(value); return match && !value.slice(0, match.index).trim(); });
    const starts = kind === "education" ? !bullet.test(line) && school.test(line) && !qualification.test(line)
      : kind === "projects" ? bulletProjects ? bullet.test(line) : blank && !bullet.test(line)
      : !bullet.test(line) && (Boolean(prefix) || looksRole(line) && /\s+\|\s+|\s+at\s+/i.test(line) || blank && dateAhead && block.some((value) => range(value)));
    if (block.length && starts) finish();
    block.push(line);
    blank = false;
  }
  finish();
  const results: { values: Record<string, string>; source: string; expected: boolean }[] = [];
  for (const parts of blocks) {
    const source = parts.join("\n");
    const firstRange = parts.map((line) => range(line)).find(Boolean);
    const dates = period(firstRange?.[0] ?? "");
    // Remove only the date substring, never the organisation sharing its line.
    const content = parts.map((line, index) => {
      const match = range(line);
      return match && (index === 0 || line.trim() === match[0]) ? line.replace(match[0], "").trim() : line;
    }).filter(Boolean);
    const first = content[0];
    if (!first) continue;
    let values: Record<string, string>;
    if (kind === "education") {
      const institution = content.find((line) => school.test(line) && !bullet.test(line));
      const degreeLine = content.find((line) => qualification.test(line) && !bullet.test(line));
      if (!institution && !degreeLine) continue;
      let degree = degreeLine;
      let fieldOfStudy: string | undefined;
      const split = degreeLine?.match(/^(.*?)\s*(?:[—–]\s*Speciali[sz]ing in\s+|,\s*)(.+)$/i);
      if (split) { degree = split[1]; fieldOfStudy = split[2]; }
      const { current: _current, ...educationDates } = dates;
      values = { ...(institution ? { institution: tidy(institution) } : {}), ...(degree ? { degree: tidy(degree) } : {}), ...(fieldOfStudy ? { fieldOfStudy: tidy(fieldOfStudy) } : {}), ...educationDates };
    } else if (kind === "experience") {
      if (bullet.test(first)) continue;
      const separated = first.split(/\s+\|\s+|\s+at\s+/i);
      let title: string;
      let employer: string | undefined;
      let used = 1;
      if (separated.length === 2 && looksRole(separated[0])) { [title, employer] = separated; }
      else if (range(parts[0]) && looksRole(first) && content[1] && !looksRole(content[1]) && !bullet.test(content[1])) {
        title = first; employer = content[1]; used = 2;
      }
      else if (range(parts[0]) || content[1] && looksRole(content[1]) && !looksRole(first)) {
        employer = first;
        if (!content[1] || bullet.test(content[1])) continue;
        title = content[1]; used = 2;
      } else {
        if (!looksRole(first)) continue;
        title = first;
        if (content[1] && !bullet.test(content[1]) && !/[.!?]$/.test(content[1]) && content[1].length < 120) { employer = content[1]; used = 2; }
      }
      const columns = title.split(/\t+| {3,}/);
      values = { title: tidy(columns[0]), ...(employer ? { employer: tidy(employer) } : {}), ...(columns[1] ? { location: tidy(columns.slice(1).join(" ")) } : {}), ...dates };
      const summary = joinDescription(content.slice(used));
      if (summary) values.summary = summary;
    } else {
      const isBullet = bullet.test(first);
      const full = joinDescription(content).replace(bullet, "");
      const title = isBullet ? full.split(/\s+[—–]\s+/)[0].slice(0, 200) : tidy(first);
      const url = content.find((line) => /^https:\/\/\S+$/.test(line));
      values = { title, ...(url ? { url } : {}), summary: isBullet ? full : joinDescription(content.slice(1).filter((line) => line !== url)) };
    }
    results.push({ values, source, expected: kind === "education" && /Expected/i.test(firstRange?.[0] ?? "") });
  }
  return results;
}
