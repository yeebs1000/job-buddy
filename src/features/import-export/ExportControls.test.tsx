import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { ExportControls } from "./ExportControls";
import { parseTracker } from "./parseTracker";
import * as exports from "./exportTracker";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("downloads the selected format and filtered/all scope as actual round-trippable bytes", async () => {
  const blobs: Blob[] = [], names: string[] = [];
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: (blob: Blob) => { blobs.push(blob); return "blob:test"; }, revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
  const user = userEvent.setup(); render(<ExportControls applications={sampleApplications} filtered={[sampleApplications[0]]} />);
  expect(screen.getByRole("combobox", { name: "Export format" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Export scope" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Export scope"), "filtered");
  await user.selectOptions(screen.getByLabelText("Export format"), "csv");
  await user.click(screen.getByRole("button", { name: "Download tracker" }));
  expect(names[0]).toMatch(/filtered.*\.csv$/);
  const filtered = await parseTracker(new File([blobs[0]], names[0]));
  expect(filtered.rows).toHaveLength(1); expect(filtered.rows[0].normalized.company).toBe("Aurora Ledger Pte Ltd");
  await user.selectOptions(screen.getByLabelText("Export scope"), "all");
  await user.selectOptions(screen.getByLabelText("Export format"), "xlsx");
  await user.click(screen.getByRole("button", { name: "Download tracker" }));
  await waitFor(() => expect(names[1]).toMatch(/all.*\.xlsx$/));
  expect((await parseTracker(new File([blobs[1]], names[1]))).rows).toHaveLength(sampleApplications.length);
});

it("disables duplicate clicks during an async export and reports a rejected download", async () => {
  let rejectDownload!: (error: Error) => void;
  vi.spyOn(exports, "downloadTracker").mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectDownload = reject; }));
  const user = userEvent.setup(); render(<ExportControls applications={sampleApplications} filtered={sampleApplications} />);
  await user.click(screen.getByRole("button", { name: "Download tracker" }));
  expect(screen.getByRole("button", { name: /Preparing download/ })).toBeDisabled();
  rejectDownload(new Error("Unavailable module"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not generate this download");
  expect(screen.getByRole("button", { name: "Download tracker" })).toBeEnabled();
});
