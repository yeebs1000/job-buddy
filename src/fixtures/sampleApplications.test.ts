import { applicationStages, deriveApplicationState } from "../domain/stage";
import { sampleApplications } from "./sampleApplications";

it("covers every active stage and rejected with deterministic SG/HK applications", () => {
  const represented = new Set(sampleApplications.map((application) => {
    const state = deriveApplicationState(application.stageEvents);
    return state.outcome ?? state.stage;
  }));

  expect(sampleApplications).toHaveLength(8);
  expect([...represented]).toEqual(expect.arrayContaining([...applicationStages, "rejected"]));
  expect(sampleApplications.map((application) => application.location.country)).toEqual(expect.arrayContaining(["Singapore", "Hong Kong"]));
});

it("keeps accepted fixture histories internally stage-consistent", () => {
  for (const application of sampleApplications) {
    const accepted = application.stageEvents
      .filter((event) => event.accepted)
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.id.localeCompare(right.id));

    accepted.forEach((event, index) => {
      if (event.fromStage) {
        expect(deriveApplicationState(accepted.slice(0, index)).stage).toBe(event.fromStage);
      }
    });
  }
});
