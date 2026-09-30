import { applicationStages, deriveApplicationState } from "../domain/stage";
import { sampleApplications } from "./sampleApplications";

it("covers every active stage and rejected across the three debut markets", () => {
  const represented = new Set(sampleApplications.map((application) => {
    const state = deriveApplicationState(application.stageEvents);
    return state.outcome ?? state.stage;
  }));

  expect(sampleApplications).toHaveLength(8);
  expect([...represented]).toEqual(expect.arrayContaining([...applicationStages, "rejected"]));
  expect(sampleApplications.map((application) => application.location.country)).toEqual(expect.arrayContaining(["Singapore", "Hong Kong", "United States"]));
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

it("supplies standard market, role family, industry, arrangement and priority columns", () => {
  for (const application of sampleApplications) {
    expect(application.market).toMatch(/^(SG|HK|US)$/);
    expect(application.roleFamily).toMatch(/^(finance|software|data|cybersecurity|cloud|IT)$/);
    expect(application.industry).toBeTruthy();
    expect(application.workArrangement).toBeTruthy();
    expect(application.priority).toBeTruthy();
  }
  expect(sampleApplications.find(a => a.role === "Data Engineer")?.roleFamily).toBe("data");
  expect(sampleApplications.find(a => a.role === "IT Support Analyst")?.roleFamily).toBe("IT");
});
