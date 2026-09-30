import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import type { GmailConnectionStatus } from "../../domain/mail";
import { SettingsPage, type GmailSettingsClient } from "./SettingsPage";
import { defaultGmailPreferences, gmailPreferences, type GmailPreferencesStore } from "./gmailPreferences";
import { updateRepository } from "../updates/updateRepository";

const adapter: MailAdapter = { source: "gmail", scan: vi.fn() };

it("shows the saved interruption after returning to Settings with a resume action", async () => {
  await updateRepository.saveScanState("gmail", { cursor: "prior", error: "private raw failure", errorCode: "gmail-network-error",
    rechecking: true, progress: { processed: 125, total: 500 }, continuationToken: `${"a".repeat(32)}:125` });
  render(<MemoryRouter><SettingsPage client={client({ state: "connected", platformSupported: true })} preferences={preferenceStore({ initialSyncCompleted: true })} /></MemoryRouter>);
  expect(await screen.findByText(/lost its connection to Google/)).toHaveAttribute("role", "alert");
  expect(screen.getByRole("button", { name: "Resume Gmail scan" })).toBeEnabled();
  expect(screen.getByText(/Scan interrupted/)).toHaveTextContent("125 of 500");
  expect(screen.queryByText("private raw failure")).not.toBeInTheDocument();
});

it("lets connected users set daily scans before initial sync without starting a scan", async () => {
  const preferences = preferenceStore();
  const scan = vi.fn();
  render(<MemoryRouter><SettingsPage client={client({ state: "connected", platformSupported: true })} preferences={preferences} scan={scan} /></MemoryRouter>);
  const checkbox = await screen.findByRole("checkbox", { name: "Daily active-session scan" });
  expect(checkbox).toBeEnabled();
  await userEvent.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(await preferences.get()).toMatchObject({ dailyActiveScanEnabled: true, initialSyncCompleted: false });
  expect(scan).not.toHaveBeenCalled();
  expect(checkbox).toHaveAccessibleDescription(/first scan/i);
});

function client(status: GmailConnectionStatus): GmailSettingsClient {
  return {
    status: vi.fn().mockResolvedValue(status),
    configureDesktopClient: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth" }),
    startPopup: vi.fn().mockResolvedValue({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", popupId: "a".repeat(48) }),
    popupResult: vi.fn().mockResolvedValue("connected"),
    disconnect: vi.fn().mockResolvedValue({ revocationConfirmed: true }),
  };
}

function preferenceStore(overrides = {}): GmailPreferencesStore {
  let value = { ...defaultGmailPreferences, ...overrides };
  return { get: vi.fn(async () => value), save: vi.fn(async (next) => { value = next; }) };
}

afterEach(async () => { cleanup(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); await jobBuddyDb.delete(); await jobBuddyDb.open(); vi.restoreAllMocks(); });

it("offers in-app desktop setup with a masked secret field", async () => {
  const gmail = client({ state: "unconfigured", platformSupported: true, lastError: "missing-config" });
  vi.mocked(gmail.status).mockResolvedValueOnce({ state: "unconfigured", platformSupported: true }).mockResolvedValue({ state: "disconnected", platformSupported: true });
  render(<MemoryRouter><SettingsPage client={gmail} preferences={preferenceStore()} /></MemoryRouter>);

  expect(await screen.findByText("Gmail connector awaiting setup")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Set up Gmail" }));
  expect(screen.getByRole("link", { name: /Open Google Cloud/i })).toHaveAttribute("href", "https://console.cloud.google.com/auth/clients");
  await userEvent.type(screen.getByLabelText("Desktop client ID"), "123-test.apps.googleusercontent.com");
  await userEvent.click(screen.getByRole("button", { name: "Save client ID" }));
  expect(await screen.findByRole("button", { name: /^Connect Gmail$/ })).toBeEnabled();
  expect(gmail.configureDesktopClient).toHaveBeenCalledWith("123-test.apps.googleusercontent.com");
  expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument(); // form closes after saving
});

it("saves an optional Desktop client secret without retaining it in the form", async () => {
  const gmail = client({ state: "disconnected", platformSupported: true });
  render(<MemoryRouter><SettingsPage client={gmail} preferences={preferenceStore()} /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: "Change client ID" }));
  await userEvent.type(screen.getByLabelText("Desktop client ID"), "123-test.apps.googleusercontent.com");
  expect(screen.getByLabelText(/Desktop client secret/)).toHaveAttribute("type", "password");
  await userEvent.type(screen.getByLabelText(/Desktop client secret/), "fixture-secret");
  await userEvent.click(screen.getByRole("button", { name: "Save client ID" }));
  await waitFor(() => expect(screen.queryByLabelText(/Desktop client secret/)).not.toBeInTheDocument());
  expect(gmail.configureDesktopClient).toHaveBeenCalledWith("123-test.apps.googleusercontent.com", "fixture-secret");
  await userEvent.click(screen.getByRole("button", { name: "Change client ID" }));
  expect(screen.getByLabelText(/Desktop client secret/)).toHaveValue("");
});

it("connects in a popup and updates the existing dashboard before syncing", async () => {
  const popup = { opener: window, document: { title: "" }, location: { replace: vi.fn() }, close: vi.fn(), closed: false };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const gmail = client({ state: "disconnected", platformSupported: true });
  vi.mocked(gmail.status).mockResolvedValueOnce({ state: "disconnected", platformSupported: true }).mockResolvedValue({ state: "connected", accountEmail: "test@example.com", platformSupported: true });
  const scan = vi.fn().mockResolvedValue({ cursor: "new-cursor" });
  const preferences = preferenceStore();
  render(<MemoryRouter><SettingsPage client={gmail} preferences={preferences} scan={scan} mailAdapter={adapter} /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: /^Connect Gmail$/ }));
  await screen.findByText(/new updates are ready/i);
  expect(screen.getByText("test@example.com")).toBeVisible();
  expect(window.location.pathname).toBe("/");
  expect(popup.close).toHaveBeenCalled();
  expect(scan).toHaveBeenCalledOnce();
  expect(await preferences.get()).toMatchObject({ dailyActiveScanEnabled: true, initialSyncCompleted: true });
});

it("lets a disconnected user correct a saved client ID and closes the editor on success", async () => {
  const gmail = client({ state: "disconnected", platformSupported: true });
  render(<MemoryRouter><SettingsPage client={gmail} preferences={preferenceStore()} /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: "Change client ID" }));
  await userEvent.type(screen.getByLabelText("Desktop client ID"), "456-correct.apps.googleusercontent.com");
  await userEvent.click(screen.getByRole("button", { name: "Save client ID" }));
  await waitFor(() => expect(screen.queryByLabelText("Desktop client ID")).not.toBeInTheDocument());
  expect(gmail.configureDesktopClient).toHaveBeenCalledWith("456-correct.apps.googleusercontent.com");
  expect(screen.getByRole("button", { name: /^Connect Gmail$/ })).toBeEnabled();
});

it("offers retry when a popup is blocked without changing saved scan preferences", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  const preferences = preferenceStore();
  render(<MemoryRouter><SettingsPage client={client({ state: "disconnected", platformSupported: true })} preferences={preferences} /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: /^Connect Gmail$/ }));
  expect(await screen.findByText(/allow popups/i)).toHaveAttribute("role", "alert");
  expect(screen.getByRole("button", { name: /^Connect Gmail$/ })).toBeEnabled();
  expect(preferences.save).not.toHaveBeenCalled();
});

it("automatically performs the first scan only after a recent Connect action", async () => {
  sessionStorage.setItem("job-buddy-gmail-connect-intent", String(Date.now()));
  window.history.replaceState({}, "", "/settings?gmail=connected");
  const preferences = preferenceStore();
  const scan = vi.fn().mockResolvedValue({ cursor: "new-account-cursor" });
  render(<MemoryRouter><SettingsPage client={client({ state: "connected", platformSupported: true })} preferences={preferences} mailAdapter={adapter} scan={scan} /></MemoryRouter>);
  await screen.findByText(/new updates are ready in Updates/i);
  expect(scan).toHaveBeenCalledOnce();
  expect(scan).toHaveBeenCalledWith({ adapter, mode: "approval", initialSyncConfirmed: true });
  expect(await preferences.get()).toMatchObject({ selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true });
  expect(sessionStorage.getItem("job-buddy-gmail-connect-intent")).toBeNull();
  expect(window.location.search).toBe("");
});

it("leaves a failed post-consent scan retryable with automatic sync disabled", async () => {
  sessionStorage.setItem("job-buddy-gmail-connect-intent", String(Date.now()));
  window.history.replaceState({}, "", "/settings?gmail=connected");
  const preferences = preferenceStore({ initialSyncCompleted: true, dailyActiveScanEnabled: true });
  render(<MemoryRouter><SettingsPage client={client({ state: "connected", platformSupported: true })} preferences={preferences} mailAdapter={adapter} scan={async () => ({ cursor: null, error: "failed" })} /></MemoryRouter>);
  await screen.findByText(/first scan did not finish/i);
  expect(await preferences.get()).toMatchObject({ initialSyncCompleted: false, dailyActiveScanEnabled: false });
  expect(screen.getByRole("button", { name: /scan last 90 days/i })).toBeEnabled();
});

it("requires an explicit 90-day scan after connecting", async () => {
  const scan = vi.fn().mockResolvedValue({ cursor: "184100", lastSuccessfulScanAt: "2026-09-15T08:00:00.000Z" });
  const preferences = preferenceStore();
  render(<MemoryRouter><SettingsPage
    client={client({ state: "connected", accountEmail: "user@example.com", platformSupported: true })}
    mailAdapter={adapter}
    preferences={preferences}
    scan={scan}
  /></MemoryRouter>);

  expect(await screen.findByRole("button", { name: /scan last 90 days/i })).toBeVisible();
  expect(scan).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /scan last 90 days/i }));

  expect(scan).toHaveBeenCalledWith(expect.objectContaining({ adapter, mode: "approval", initialSyncConfirmed: true }));
  await waitFor(() => expect(preferences.save).toHaveBeenCalledWith(expect.objectContaining({ selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: false })));
});

it("keeps approval as default and requires confirmation before unrestricted automation", async () => {
  const preferences = preferenceStore({ initialSyncCompleted: true, selectedSource: "gmail" });
  const confirmAutomation = vi.fn().mockReturnValue(false);
  render(<MemoryRouter><SettingsPage
    client={client({ state: "connected", accountEmail: "user@example.com", platformSupported: true })}
    preferences={preferences}
    confirmAutomation={confirmAutomation}
  /></MemoryRouter>);

  const unrestricted = await screen.findByRole("radio", { name: /auto-apply safe updates/i });
  expect(screen.getByRole("radio", { name: /approval required/i })).toBeChecked();
  await userEvent.click(unrestricted);

  expect(confirmAutomation).toHaveBeenCalledTimes(1);
  expect(unrestricted).not.toBeChecked();
});

it("renders a useful unsupported-platform state", async () => {
  render(<MemoryRouter><SettingsPage client={client({ state: "disconnected", platformSupported: false, lastError: "platform-unsupported" })} preferences={preferenceStore()} /></MemoryRouter>);
  expect(await screen.findByText(/Windows is required for persistent Gmail access/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: /^connect gmail$/i })).not.toBeInTheDocument();
});

it("stores preferences as validated local metadata", async () => {
  await gmailPreferences.save({ selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true, automationMode: "approval" });
  expect(await gmailPreferences.get()).toEqual({ selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true, automationMode: "approval" });
});
