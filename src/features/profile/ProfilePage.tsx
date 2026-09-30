import { useEffect, useMemo, useRef, useState } from "react";
import {
  candidateProfileSchema,
  emptyCandidateProfile,
  type CandidateProfile,
} from "../../domain/profile";
import { profileClient, type ProfileClient } from "./profileClient";
import { ResumeImport } from "./ResumeImport";
import { isWebMode } from "../../app/runtimeMode";
import "./profile.css";

interface ProfilePageProps {
  client?: ProfileClient;
  confirmDelete?: () => boolean;
}

type Education = CandidateProfile["education"][number];
type Experience = CandidateProfile["experience"][number];
type Project = CandidateProfile["projects"][number];
type StandardAnswer = CandidateProfile["standardAnswers"][number];

export function ProfilePage({
  client = profileClient,
  confirmDelete = () => window.confirm("Delete the encrypted local profile? Applications and Gmail data will remain."),
}: ProfilePageProps = {}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [supported, setSupported] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const importButton = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLFieldSetElement>(null);
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    client.get().then((response) => {
      if (!active) return;
      setProfile(response.profile);
      setSupported(response.platformSupported);
      setHasProfile(response.hasProfile);
      setLoadFailed(false);
    }).catch(() => {
      if (!active) return;
      setProfile(structuredClone(emptyCandidateProfile));
      setLoadFailed(true);
    });
    return () => { active = false; };
  }, [client, loadAttempt]);

  const completeness = useMemo(() => profile ? countProfileValues(profile) : 0, [profile]);

  function setIdentity(field: keyof CandidateProfile["identity"], value: string) {
    setProfile((current) => current && ({ ...current, identity: { ...current.identity, [field]: value } }));
  }

  function setContact(field: keyof CandidateProfile["contact"], value: string) {
    setProfile((current) => current && ({ ...current, contact: { ...current.contact, [field]: value } }));
  }

  function setLink(field: keyof CandidateProfile["links"], value: string) {
    setProfile((current) => current && ({ ...current, links: { ...current.links, [field]: value } }));
  }

  function updateEducation(index: number, field: keyof Education, value: string) {
    setProfile((current) => current && ({ ...current, education: current.education.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateExperience(index: number, field: keyof Experience, value: string | boolean) {
    setProfile((current) => current && ({ ...current, experience: current.experience.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateProject(index: number, field: keyof Project, value: string) {
    setProfile((current) => current && ({ ...current, projects: current.projects.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function updateStandardAnswer(index: number, field: keyof StandardAnswer, value: string) {
    setProfile((current) => current && ({ ...current, standardAnswers: current.standardAnswers.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  async function save() {
    if (!profile || !supported || loadFailed) return;
    setMessage(null);
    const parsed = candidateProfileSchema.safeParse({ ...profile, updatedAt: new Date().toISOString() });
    if (!parsed.success) {
      const labels = [...new Set(parsed.error.issues.map(issue => profileFieldLabel(issue.path)))];
      setMessage({ tone: "error", text: `Could not save. Check ${labels.join(", ")}. Use a valid email, HTTPS links, positive whole-number salary, and complete reusable answers. Your draft is unchanged.` });
      const label = Array.from(editor.current?.querySelectorAll("label") ?? []).find(item => item.querySelector("span")?.textContent === labels[0]);
      label?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea, select")?.focus();
      return;
    }
    setBusy(true);
    try {
      const result = await client.replace(parsed.data);
      setProfile(result.profile);
      setHasProfile(true);
      setMessage({ tone: "status", text: "Profile saved locally." });
    } catch {
      setMessage({ tone: "error", text: "Profile could not be saved. No plaintext fallback was created." });
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile() {
    if (!hasProfile || !confirmDelete()) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.delete();
      setProfile(structuredClone(emptyCandidateProfile));
      setHasProfile(false);
      setMessage({ tone: "status", text: "Local profile deleted." });
    } catch {
      setMessage({ tone: "error", text: "Profile could not be deleted." });
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <div className="profile-page" aria-busy="true"><ProfileHeader completeness={null} /><p>Loading encrypted profile…</p></div>;

  return <div className="profile-page">
    <ProfileHeader completeness={completeness} />

    {isWebMode && <p className="profile-page__message">Saved only in this browser, not uploaded. Clearing site data removes your profile. Anyone using this unlocked browser can open it; browser-held encryption does not protect against malicious site scripts.</p>}
    {!supported && <p className="profile-page__message profile-page__message--error" role="alert">{isWebMode ? "Secure browser storage is unavailable. Use an up-to-date browser over HTTPS. Your profile will not be saved as plaintext." : "Windows profile encryption is required. Job Buddy will not store this profile as plaintext."}</p>}
    {loadFailed && <div className="profile-page__message profile-page__message--error" role="alert"><p>Profile could not be loaded. Your saved profile has not been replaced. {isWebMode ? "Retry loading before editing. If your browser storage is damaged, keep this workspace and restore a backup in a separate fresh browser profile." : "Start the local companion, then retry loading before editing."}</p><button type="button" className="button button--secondary" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry loading profile</button></div>}

    {importOpen ? <ResumeImport profile={profile} onClose={() => { setImportOpen(false); requestAnimationFrame(() => importButton.current?.focus()); }} onApply={(next) => {
      setProfile(next); setImportOpen(false);
      setMessage({ tone: "status", text: "Resume details added to your draft. Review the profile below, then Save profile to keep them." });
      requestAnimationFrame(() => importButton.current?.focus());
    }} /> : <section className="profile-section resume-import__intro"><div><h2>Start with your resume</h2><p>Import a PDF, DOCX or pasted text. Review each suggestion before adding it to your profile.</p></div><button ref={importButton} type="button" className="button button--primary" disabled={busy || loadFailed} onClick={() => { setMessage(null); setImportOpen(true); }}>Import resume</button></section>}

    <fieldset ref={editor} className="profile-page__editor" disabled={busy || importOpen || loadFailed} aria-label="Profile details" onChangeCapture={() => setMessage(null)}>

    <ProfileSection title="Identity and contact" description="The ordinary details Buddy can safely reuse.">
      <Field label="First name" value={profile.identity.givenName} onChange={(value) => setIdentity("givenName", value)} />
      <Field label="Last name" value={profile.identity.familyName} onChange={(value) => setIdentity("familyName", value)} />
      <Field label="Preferred name" value={profile.identity.preferredName} onChange={(value) => setIdentity("preferredName", value)} />
      <Field label="Email" type="email" value={profile.contact.email} onChange={(value) => setContact("email", value)} />
      <Field label="Phone country code" type="tel" value={profile.contact.phoneCountryCode} onChange={(value) => setContact("phoneCountryCode", value)} />
      <Field label="Phone number" type="tel" value={profile.contact.phoneNational} onChange={(value) => setContact("phoneNational", value)} />
      <Field label="Address line 1" value={profile.contact.addressLine1} onChange={(value) => setContact("addressLine1", value)} />
      <Field label="Address line 2" value={profile.contact.addressLine2} onChange={(value) => setContact("addressLine2", value)} />
      <Field label="City" value={profile.contact.city} onChange={(value) => setContact("city", value)} />
      <Field label="State or region" value={profile.contact.region} onChange={(value) => setContact("region", value)} />
      <Field label="Postal code" value={profile.contact.postalCode} onChange={(value) => setContact("postalCode", value)} />
      <Field label="Country" value={profile.contact.country} onChange={(value) => setContact("country", value)} />
    </ProfileSection>

    <ProfileSection title="Separate address fields" description="For forms that ask for each part separately, including Oracle's Singapore address form. Enter these explicitly; Buddy does not guess them from Address line 1 or 2. Existing application answers still require your approval to replace.">
      <Field label="Block or house number" value={profile.contact.houseNumber} onChange={(value) => setContact("houseNumber", value)} />
      <Field label="Street name" value={profile.contact.streetName} onChange={(value) => setContact("streetName", value)} />
      <Field label="Level / unit number" value={profile.contact.unitNumber} onChange={(value) => setContact("unitNumber", value)} />
      <Field label="Building name" value={profile.contact.buildingName} onChange={(value) => setContact("buildingName", value)} />
    </ProfileSection>

    <ProfileSection title="Professional links" description="HTTPS links only.">
      <Field label="LinkedIn URL" type="url" value={profile.links.linkedin} onChange={(value) => setLink("linkedin", value)} />
      <Field label="GitHub URL" type="url" value={profile.links.github} onChange={(value) => setLink("github", value)} />
      <Field label="Portfolio URL" type="url" value={profile.links.portfolio} onChange={(value) => setLink("portfolio", value)} />
    </ProfileSection>

    <CollectionSection title="Education" addLabel="Add education" canAdd={profile.education.length < 5} onAdd={() => setProfile({ ...profile, education: [...profile.education, {}] })}>
      {profile.education.map((item, index) => <CollectionCard key={index} title={`Education ${index + 1}`} onRemove={() => setProfile({ ...profile, education: profile.education.filter((_, itemIndex) => itemIndex !== index) })}>
        <Field label={`Institution ${index + 1}`} value={item.institution} onChange={(value) => updateEducation(index, "institution", value)} />
        <Field label={`Degree ${index + 1}`} value={item.degree} onChange={(value) => updateEducation(index, "degree", value)} />
        <Field label={`Field of study ${index + 1}`} value={item.fieldOfStudy} onChange={(value) => updateEducation(index, "fieldOfStudy", value)} />
        <Field label={`Education start month ${index + 1}`} type="month" value={item.startMonth} onChange={(value) => updateEducation(index, "startMonth", value)} />
        <Field label={`Education end month ${index + 1}`} type="month" value={item.endMonth} onChange={(value) => updateEducation(index, "endMonth", value)} />
      </CollectionCard>)}
    </CollectionSection>

    <CollectionSection title="Experience" addLabel="Add experience" canAdd={profile.experience.length < 10} onAdd={() => setProfile({ ...profile, experience: [...profile.experience, {}] })}>
      {profile.experience.map((item, index) => <CollectionCard key={index} title={`Experience ${index + 1}`} onRemove={() => setProfile({ ...profile, experience: profile.experience.filter((_, itemIndex) => itemIndex !== index) })}>
        <Field label={`Employer ${index + 1}`} value={item.employer} onChange={(value) => updateExperience(index, "employer", value)} />
        <Field label={`Job title ${index + 1}`} value={item.title} onChange={(value) => updateExperience(index, "title", value)} />
        <Field label={`Work location ${index + 1}`} value={item.location} onChange={(value) => updateExperience(index, "location", value)} />
        <Field label={`Experience start month ${index + 1}`} type="month" value={item.startMonth} onChange={(value) => updateExperience(index, "startMonth", value)} />
        <Field label={`Experience end month ${index + 1}`} type="month" value={item.endMonth} onChange={(value) => updateExperience(index, "endMonth", value)} />
        <label className="profile-field profile-field--checkbox"><input type="checkbox" checked={item.current ?? false} onChange={(event) => updateExperience(index, "current", event.currentTarget.checked)} /> Current role</label>
        <TextArea label={`Experience summary ${index + 1}`} value={item.summary} onChange={(value) => updateExperience(index, "summary", value)} />
      </CollectionCard>)}
    </CollectionSection>

    <CollectionSection title="Projects" addLabel="Add project" canAdd={profile.projects.length < 10} onAdd={() => setProfile({ ...profile, projects: [...profile.projects, {}] })}>
      {profile.projects.map((item, index) => <CollectionCard key={index} title={`Project ${index + 1}`} onRemove={() => setProfile({ ...profile, projects: profile.projects.filter((_, itemIndex) => itemIndex !== index) })}>
        <Field label={`Project title ${index + 1}`} value={item.title} onChange={(value) => updateProject(index, "title", value)} />
        <Field label={`Project URL ${index + 1}`} type="url" value={item.url} onChange={(value) => updateProject(index, "url", value)} />
        <TextArea label={`Project summary ${index + 1}`} value={item.summary} onChange={(value) => updateProject(index, "summary", value)} />
      </CollectionCard>)}
      <label className="profile-field profile-field--wide"><span>Skills</span><input value={profile.skills.join(", ")} onChange={(event) => setProfile({ ...profile, skills: event.currentTarget.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="TypeScript, React, SQL" /></label>
    </CollectionSection>

    <ProfileSection title="Application preferences" description="Buddy always asks before using salary, availability, relocation, or authorization answers.">
      <Field label="Singapore work authorization" value={profile.preferences.sgAuthorization} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, sgAuthorization: value } })} />
      <Field label="Hong Kong work authorization" value={profile.preferences.hkAuthorization} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, hkAuthorization: value } })} />
      <Field label="United States work authorization" value={profile.preferences.usAuthorization} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, usAuthorization: value } })} />
      <Field label="Need sponsorship now or in future — Singapore" value={profile.preferences.sgSponsorship} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, sgSponsorship: value } })} />
      <Field label="Need sponsorship now or in future — Hong Kong" value={profile.preferences.hkSponsorship} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, hkSponsorship: value } })} />
      <Field label="Need sponsorship now or in future — United States" value={profile.preferences.usSponsorship} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, usSponsorship: value } })} />
      <Field label="Availability date" type="date" value={profile.preferences.availabilityDate} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, availabilityDate: value } })} />
      <Field label="Notice period" value={profile.preferences.noticePeriod} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, noticePeriod: value } })} />
      <Field label="Relocation preference" value={profile.preferences.relocation} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, relocation: value } })} />
      <label className="profile-field"><span>Work arrangement</span><select value={profile.preferences.workArrangement ?? ""} onChange={(event) => setProfile({ ...profile, preferences: { ...profile.preferences, workArrangement: event.currentTarget.value as CandidateProfile["preferences"]["workArrangement"] || undefined } })}><option value="">Not set</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
      <NumberField label="Singapore salary expectation (SGD annual)" value={profile.preferences.salarySGDAnnual} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, salarySGDAnnual: value } })} />
      <NumberField label="Hong Kong salary expectation (HKD annual)" value={profile.preferences.salaryHKDAnnual} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, salaryHKDAnnual: value } })} />
      <NumberField label="United States salary expectation (USD annual)" value={profile.preferences.salaryUSDAnnual} onChange={(value) => setProfile({ ...profile, preferences: { ...profile.preferences, salaryUSDAnnual: value } })} />
    </ProfileSection>

    <CollectionSection title="Reusable factual answers" addLabel="Add reusable answer" canAdd={profile.standardAnswers.length < 50} onAdd={() => setProfile({ ...profile, standardAnswers: [...profile.standardAnswers, { question: "", answer: "" }] })}>
      <p className="profile-section__note">Custom answers always require review. Buddy never writes or invents them.</p>
      {profile.standardAnswers.map((item, index) => <CollectionCard key={index} title={`Answer ${index + 1}`} onRemove={() => setProfile({ ...profile, standardAnswers: profile.standardAnswers.filter((_, itemIndex) => itemIndex !== index) })}>
        <Field label={`Question ${index + 1}`} value={item.question} onChange={(value) => updateStandardAnswer(index, "question", value)} />
        <TextArea label={`Answer ${index + 1}`} value={item.answer} onChange={(value) => updateStandardAnswer(index, "answer", value)} />
      </CollectionCard>)}
    </CollectionSection>

    <footer className="profile-page__actions">
      {message && <div className={`profile-page__message profile-page__message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}
      <button className="button button--primary" disabled={!supported || busy} onClick={() => void save()} type="button">{busy ? "Saving…" : "Save profile"}</button>
      <button className="button button--secondary" disabled={!hasProfile || busy} onClick={() => void deleteProfile()} type="button">Delete local profile</button>
      <p>Passwords, OTPs, payment information, demographic answers, signatures, and uploaded files are never stored here.</p>
    </footer>
    </fieldset>
  </div>;
}

function profileFieldLabel(path: PropertyKey[]): string {
  const field = String(path.at(-1) ?? "profile");
  const names: Record<string, string> = { givenName: "First name", familyName: "Last name", email: "Email", linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio", salarySGDAnnual: "Singapore salary expectation (SGD annual)", salaryHKDAnnual: "Hong Kong salary expectation (HKD annual)", salaryUSDAnnual: "United States salary expectation (USD annual)" };
  if (typeof path[1] === "number") {
    const section = String(path[0]);
    const labels: Record<string, string> = { institution: "Institution", degree: "Degree", fieldOfStudy: "Field of study", employer: "Employer", title: section === "projects" ? "Project title" : "Job title", url: "Project URL", summary: section === "projects" ? "Project summary" : "Experience summary", question: "Question", answer: "Answer" };
    return `${labels[field] ?? field} ${path[1] + 1}`;
  }
  return names[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase());
}

function ProfileHeader({ completeness }: { completeness: number | null }) {
  return <header className="profile-page__header">
    <div><h1>Profile</h1><p>{isWebMode ? "Reusable facts for faster applications. Saved on this browser with a browser-held encryption key." : "Reusable facts for faster applications. Saved data is encrypted for your Windows account."}</p></div>
    <span>{completeness === null ? "Loading…" : `${completeness} completed fields`}</span>
  </header>;
}

function ProfileSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="profile-section"><header><div><h2>{title}</h2><p>{description}</p></div></header><div className="profile-grid">{children}</div></section>;
}

function CollectionSection({ title, addLabel, canAdd, onAdd, children }: { title: string; addLabel: string; canAdd: boolean; onAdd: () => void; children: React.ReactNode }) {
  return <section className="profile-section"><header><h2>{title}</h2><button className="button button--secondary" disabled={!canAdd} onClick={onAdd} type="button">{addLabel}</button></header><div className="profile-collection">{children}</div></section>;
}

function CollectionCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) {
  return <fieldset className="profile-collection__card"><legend>{title}</legend><button className="profile-collection__remove" onClick={onRemove} type="button">Remove {title.toLowerCase()}</button><div className="profile-grid">{children}</div></fieldset>;
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value?: string; onChange: (value: string) => void }) {
  return <label className="profile-field"><span>{label}</span><input type={type} value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return <label className="profile-field profile-field--wide"><span>{label}</span><textarea rows={4} value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return <label className="profile-field"><span>{label}</span><input min="1" step="1" type="number" value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label>;
}

function countProfileValues(profile: CandidateProfile): number {
  let count = 0;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === "object") { Object.values(value).forEach(visit); return; }
    if (typeof value === "string" && value.trim()) count += 1;
    if (typeof value === "number" || value === true) count += 1;
  };
  visit({ ...profile, version: undefined, updatedAt: undefined });
  return count;
}
