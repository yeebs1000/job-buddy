import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyCandidateProfile, type CandidateProfile } from "../../domain/profile";
import { ProfilePage } from "./ProfilePage";
import type { ProfileClient, ProfileResponse } from "./profileClient";

describe("ProfilePage", () => {
  it("saves separate address components alongside the existing address lines", async () => {
    const client = fakeProfileClient();
    render(<ProfilePage client={client} />);
    await userEvent.type(await screen.findByLabelText("Block or house number"), "12A");
    await userEvent.type(screen.getByLabelText("Street name"), "Example Road");
    await userEvent.type(screen.getByLabelText("Level / unit number"), "#03-45");
    await userEvent.type(screen.getByLabelText("Building name"), "Example House");
    await userEvent.type(screen.getByLabelText("Address line 1"), "12A Example Road");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(client.replace).toHaveBeenCalledWith(expect.objectContaining({ contact: expect.objectContaining({
      houseNumber: "12A", streetName: "Example Road", unitNumber: "#03-45", buildingName: "Example House", addressLine1: "12A Example Road",
    }) }));
    expect(screen.getAllByText("Profile saved locally.").length).toBeGreaterThan(0);
  });
  it("blocks replacement after a failed load until the existing profile can be retrieved", async () => {
    const client = fakeProfileClient({ platformSupported: true, hasProfile: true, profile: { ...emptyCandidateProfile, identity: { givenName: "Existing" } } });
    vi.mocked(client.get).mockRejectedValueOnce(new Error("offline"));
    render(<ProfilePage client={client} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/i);
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import resume" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Retry loading profile" }));
    await waitFor(() => expect(screen.getByLabelText("First name")).toHaveValue("Existing"));
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    expect(client.replace).not.toHaveBeenCalled();
  });
  it("shows save results beside Save and clears stale success when editing", async () => {
    render(<ProfilePage client={fakeProfileClient()} />);
    await userEvent.type(await screen.findByLabelText("First name"), "Alex");
    const actions = screen.getByRole("button", { name: "Save profile" }).closest("footer")!;
    await userEvent.click(within(actions).getByRole("button", { name: "Save profile" }));
    expect(await within(actions).findByRole("status")).toHaveTextContent("Profile saved locally.");
    await userEvent.type(screen.getByLabelText("First name"), "a");
    expect(within(actions).queryByText("Profile saved locally.")).not.toBeInTheDocument();
  });

  it("names the invalid field at Save and retains the imported draft", async () => {
    render(<ProfilePage client={fakeProfileClient()} />);
    await userEvent.type(await screen.findByLabelText("Email"), "invalid-email");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    const actions = screen.getByRole("button", { name: "Save profile" }).closest("footer")!;
    expect(within(actions).getByRole("alert")).toHaveTextContent(/Email/);
    expect(screen.getByLabelText("Email")).toHaveValue("invalid-email");
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });
  it("requires an explicit selection for replacement and permits editing before applying", async () => {
    const client = fakeProfileClient({ platformSupported: true, hasProfile: true, profile: { ...structuredClone(emptyCandidateProfile), contact: { email: "keep@example.com" } } });
    const user = userEvent.setup();
    render(<ProfilePage client={client} />);
    await user.click(await screen.findByRole("button", { name: "Import resume" }));
    await user.type(screen.getByLabelText("Paste resume text"), "alex@example.com");
    await user.click(screen.getByRole("button", { name: "Review extracted details" }));
    const email = screen.getByLabelText(/Suggested Email/);
    await user.clear(email);
    await user.type(email, "edited@example.com");
    expect(screen.getByRole("button", { name: "Apply selected details" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Include Email" }));
    await user.click(screen.getByRole("button", { name: "Apply selected details" }));
    expect(screen.getByLabelText("Email")).toHaveValue("edited@example.com");
    expect(client.replace).not.toHaveBeenCalled();
  });

  it("keeps invalid suggestions in review without mutating the draft", async () => {
    const client = fakeProfileClient();
    const user = userEvent.setup();
    render(<ProfilePage client={client} />);
    await user.click(await screen.findByRole("button", { name: "Import resume" }));
    await user.type(screen.getByLabelText("Paste resume text"), "alex@example.com");
    await user.click(screen.getByRole("button", { name: "Review extracted details" }));
    await user.clear(screen.getByLabelText(/Suggested Email/));
    await user.type(screen.getByLabelText(/Suggested Email/), "invalid");
    await user.click(screen.getByRole("button", { name: "Apply selected details" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/must be valid/);
    await user.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(client.replace).not.toHaveBeenCalled();
  });

  it("reviews resume conflicts and does not persist until Save profile", async () => {
    const client = fakeProfileClient({ platformSupported: true, hasProfile: true, profile: { ...structuredClone(emptyCandidateProfile), contact: { email: "keep@example.com" } } });
    render(<ProfilePage client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Import resume" }));
    await userEvent.type(screen.getByLabelText("Paste resume text"), "Alex Chen\nalex@example.com\nSKILLS\nTypeScript, SQL");
    await userEvent.click(screen.getByRole("button", { name: "Review extracted details" }));
    expect(screen.getByText(/Existing value differs/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Include Email" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Apply selected details" }));
    expect(screen.getByLabelText("Email")).toHaveValue("keep@example.com");
    expect(screen.getByLabelText("Skills")).toHaveValue("TypeScript, SQL");
    expect(client.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(client.replace).toHaveBeenCalledOnce();
  });

  it("saves a partial profile and explains local encryption", async () => {
    const user = userEvent.setup();
    const client = fakeProfileClient();
    render(<ProfilePage client={client} />);

    await user.type(await screen.findByLabelText("First name"), "Alex");
    await user.type(screen.getByLabelText("Email"), "alex@example.com");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(client.replace).toHaveBeenCalledWith(expect.objectContaining({
      identity: expect.objectContaining({ givenName: "Alex" }),
      contact: expect.objectContaining({ email: "alex@example.com" }),
    }));
    expect(screen.getByText(/encrypted for your Windows account/i)).toBeVisible();
    expect(await screen.findByText("Profile saved locally.")).toBeVisible();
  });

  it("adds structured education and skills without demographic fields", async () => {
    const user = userEvent.setup();
    render(<ProfilePage client={fakeProfileClient()} />);

    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution 1"), "HKU");
    await user.type(screen.getByLabelText("Skills"), "TypeScript, React");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.queryByLabelText(/gender|ethnicity|disability|veteran/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Profile saved locally.")).toBeVisible();
  });

  it("shows an unsupported state without a plaintext fallback", async () => {
    render(<ProfilePage client={fakeProfileClient({ platformSupported: false, hasProfile: false, profile: emptyCandidateProfile })} />);

    expect(await screen.findByText(/Windows profile encryption is required/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  });

  it("deletes the local profile only after confirmation", async () => {
    const user = userEvent.setup();
    const client = fakeProfileClient({ platformSupported: true, hasProfile: true, profile: { ...emptyCandidateProfile, identity: { givenName: "Alex" } } });
    render(<ProfilePage client={client} confirmDelete={() => true} />);

    await user.click(await screen.findByRole("button", { name: "Delete local profile" }));

    expect(client.delete).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByLabelText("First name")).toHaveValue(""));
    expect(screen.getByText("Local profile deleted.")).toBeVisible();
  });
});

function fakeProfileClient(initial: ProfileResponse = {
  platformSupported: true,
  hasProfile: false,
  profile: emptyCandidateProfile,
}): ProfileClient & { replace: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } {
  let stored: CandidateProfile = structuredClone(initial.profile);
  return {
    get: vi.fn().mockResolvedValue(initial),
    replace: vi.fn(async (profile: CandidateProfile) => { stored = structuredClone(profile); return { profile: stored }; }),
    delete: vi.fn(async () => { stored = structuredClone(emptyCandidateProfile); }),
  };
}
