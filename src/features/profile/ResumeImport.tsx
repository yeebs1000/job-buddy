import { useEffect, useRef, useState } from "react";
import type { CandidateProfile } from "../../domain/profile";
import { applyResumeSuggestions, parseResumeText, suggestionConflict, type ResumeDraft, type ResumeSuggestion } from "./resumeParser";
import { readResumeFile } from "./resumeText";

const labels: Record<string, string> = {
  givenName: "First name", familyName: "Last name", email: "Email", phoneCountryCode: "Country code", phoneNational: "Phone number",
  city: "City", linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio", institution: "Institution", degree: "Degree",
  fieldOfStudy: "Field of study", startMonth: "Start month", endMonth: "End month", grade: "Grade", employer: "Employer",
  title: "Title", location: "Location", current: "Current role", summary: "Summary", url: "URL", items: "Skills (comma-separated)",
};
const collectionSections = ["education", "experience", "projects"] as const;

export function ResumeImport({ profile, onApply, onClose }: {
  profile: CandidateProfile; onApply: (profile: CandidateProfile) => void; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replacements, setReplacements] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewing = draft !== null;
  useEffect(() => () => { operation.current?.abort(); }, []);
  useEffect(() => { heading.current?.focus(); }, [reviewing]);

  function review(value: string) {
    const result = parseResumeText(value);
    setSelected(new Set(result.suggestions.filter((item) => !suggestionConflict(profile, item)).map((item) => item.id)));
    setDraft(result);
    setReplacements(new Set());
    setText("");
    setError("");
  }

  async function upload(file: File) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try { const value = await readResumeFile(file, controller.signal); if (!controller.signal.aborted) review(value); }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not read this file. Try pasting text."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function edit(item: ResumeSuggestion, key: string, value: string) {
    const updated = { ...item, values: { ...item.values, [key]: value } };
    setDraft((current) => current && ({ ...current, suggestions: current.suggestions.map((entry) => entry.id === item.id ? updated : entry) }));
    if (suggestionConflict(profile, updated)) setSelected((current) => { const next = new Set(current); next.delete(item.id); return next; });
    setError("");
  }

  function apply() {
    try {
      const chosen = draft!.suggestions.filter((item) => selected.has(item.id));
      const base = structuredClone(profile);
      for (const section of collectionSections) {
        const entries = chosen.filter((item) => item.section === section);
        if (!replacements.has(section) || !entries.length) continue;
        if (entries.some((item) => !Object.entries(item.values).some(([key, value]) => ["institution", "degree", "employer", "title", "summary", "url"].includes(key) && value.trim()))) {
          throw new Error("Keep at least one identifying detail in each replacement entry, or uncheck it.");
        }
        base[section] = [];
      }
      const next = applyResumeSuggestions(base, chosen, true);
      onApply(next);
    } catch (error) { setError(error instanceof Error ? error.message : "Review your selected details before applying."); }
  }

  return <section className="profile-section resume-import" aria-labelledby="resume-import-title" aria-busy={busy}>
    <header><div><h2 id="resume-import-title" tabIndex={-1} ref={heading}>{draft ? "Review extracted details" : "Import your resume"}</h2>
      <p>{draft ? "Edit or uncheck anything below. Selecting a conflicting item explicitly replaces its existing values." : "A head start, kept private. Your file is read in this browser, not uploaded to a server or AI service."}</p></div>
      <button type="button" className="button button--secondary" onClick={onClose}>Cancel import</button>
    </header>
    {error && <p role="alert" className="profile-page__message profile-page__message--error">{error}</p>}
    {!draft ? <div className="resume-import__input">
      <label className="profile-field"><span>Choose resume file</span><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file);
      }} /></label>
      <p className="profile-section__note">Text-based PDF or DOCX · Up to 5 MB · PDF up to 20 pages. Scans and images are not supported.</p>
      <label className="profile-field"><span>Paste resume text</span><textarea rows={7} maxLength={100_000} disabled={busy} value={text} onChange={(event) => setText(event.currentTarget.value)} placeholder="Paste your contact details, education, experience, projects and skills…" /></label>
      <div className="resume-import__actions"><button type="button" className="button button--primary" disabled={busy || !text.trim()} onClick={() => {
        try { review(text); } catch (error) { setError(error instanceof Error ? error.message : "Could not parse text."); }
      }}>Review extracted details</button><span role="status">{busy ? "Reading locally…" : "Nothing is saved automatically."}</span></div>
    </div> : <>
      {draft.warnings.map((warning) => <p key={warning} className="resume-import__notice">{warning}</p>)}
      {collectionSections.some((section) => profile[section].length && draft.suggestions.some((item) => item.section === section)) && <div className="resume-import__replacement">
        <h3>Correct a previous import</h3>
        <p>By default, existing entries stay. Check a section to replace all its existing entries with only the selected suggestions below. Other sections stay unchanged. Save profile is still required.</p>
        {collectionSections.filter((section) => profile[section].length && draft.suggestions.some((item) => item.section === section)).map((section) => <label className="profile-field profile-field--checkbox" key={section}>
          <input type="checkbox" checked={replacements.has(section)} disabled={!draft.suggestions.some((item) => item.section === section && selected.has(item.id))} onChange={(event) => {
            const checked = event.currentTarget.checked;
            setReplacements((current) => { const next = new Set(current); if (checked) next.add(section); else next.delete(section); return next; });
          }} /> Replace existing {section} entries ({profile[section].length})
        </label>)}
      </div>}
      <div className="resume-import__suggestions">
        {draft.suggestions.map((item, index) => {
          const conflict = suggestionConflict(profile, item);
          const existing = profile[item.section] as unknown as Record<string, unknown>;
          return <article className="resume-import__suggestion" key={item.id}>
            <div className="resume-import__row"><label className="profile-field profile-field--checkbox"><input type="checkbox" aria-label={`Include ${item.label}`} checked={selected.has(item.id)} onChange={(event) => {
              const checked = event.currentTarget.checked;
              setSelected((current) => { const next = new Set(current); if (checked) next.add(item.id); else next.delete(item.id); return next; });
            }} /><strong>{item.label}</strong></label><span className="resume-import__badge">{conflict ? "Existing value differs" : item.needsReview ? "Check interpretation" : "Extracted from text"}</span></div>
            {conflict && <p className="resume-import__conflict">Existing: {Object.keys(item.values).filter((key) => existing[key]).map((key) => `${labels[key]}: ${existing[key]}`).join(" · ")}. Leave unchecked to keep these values.</p>}
            <div className="profile-grid">{Object.entries(item.values).map(([key, value]) => <label className={`profile-field ${key === "summary" || key === "items" ? "profile-field--wide" : ""}`} key={key}>
              <span>{labels[key]}</span>{key === "current" ? <select aria-label={`Suggested ${labels[key]} ${index + 1}`} value={value} onChange={(event) => edit(item, key, event.currentTarget.value)}><option value="true">Yes</option><option value="false">No</option></select>
                : key === "startMonth" || key === "endMonth" ? <input type="month" aria-label={`Suggested ${labels[key]} ${index + 1}`} value={value} onChange={(event) => edit(item, key, event.currentTarget.value)} />
                : <textarea aria-label={`Suggested ${labels[key]} ${index + 1}`} rows={key === "summary" ? 3 : 1} value={value} onChange={(event) => edit(item, key, event.currentTarget.value)} />}
            </label>)}</div>
            <details className="resume-import__source"><summary>View source text</summary><pre>{item.source}</pre></details>
          </article>;
        })}
      </div>
      <div className="resume-import__actions"><button type="button" className="button button--primary" disabled={!selected.size} onClick={apply}>Apply selected details</button>
        <button type="button" className="button button--secondary" onClick={() => { setDraft(null); setSelected(new Set()); setError(""); }}>Choose another resume</button>
        <span>{selected.size} selected · Save profile is still required.</span></div>
    </>}
    <p className="profile-section__note">Authorization, sponsorship, salary expectations and demographic answers are never inferred. Review summaries for information you do not want saved. Original files and source text are not retained after import.</p>
  </section>;
}
