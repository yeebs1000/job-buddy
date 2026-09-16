import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyCandidateProfile, type CandidateProfile } from "../../domain/profile";
import { ProfilePage } from "./ProfilePage";
import type { ProfileClient, ProfileResponse } from "./profileClient";

describe("ProfilePage", () => {
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
