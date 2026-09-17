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

const adapter: MailAdapter = { source: "gmail", scan: vi.fn() };

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

it("offers in-app desktop setup and then enables Google sign-in without a secret input", async () => {
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
  expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument();
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
  await waitFor(() => expect(preferences.save).toHaveBeenCalledWith(expect.objectContaining({ selectedSource: "gmail", initialSyncCompleted: true, dailyActiveScanEnabled: true })));
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
