import { describe, expect, test } from "bun:test";
import { parseStructure, type Person, applySplit, type SplitTeamSpec, computeMetrics } from "./scenario-scorer.ts";

const FIXTURE = `# Org structure — orgfix-acme
<!-- org-design:structure -->
| Person | Role (M/IC) | Team | Reports to | Critical systems owned | On-call rotation | Key skills |
|--------|-------------|------|------------|------------------------|------------------|-----------|
| Dana   | M  | Platform | | | | leadership |
| Sam    | M  | Payments | Dana | | | leadership |
| Jordan | IC | Payments | Sam | billing-service | payments-primary | Kafka, Go |
| Riley  | IC | Payments | Sam | | payments-primary | Go |
<!-- /org-design:structure -->`;

describe("parseStructure", () => {
  test("reads fenced rows into Person[], splitting list columns on comma", () => {
    const rows = parseStructure(FIXTURE);
    expect(rows.length).toBe(4);
    const jordan = rows.find((r) => r.person === "Jordan")!;
    expect(jordan.role).toBe("IC");
    expect(jordan.team).toBe("Payments");
    expect(jordan.reportsTo).toBe("Sam");
    expect(jordan.systems).toEqual(["billing-service"]);
    expect(jordan.skills).toEqual(["Kafka", "Go"]);
    const dana = rows.find((r) => r.person === "Dana")!;
    expect(dana.reportsTo).toBe("");
    expect(dana.systems).toEqual([]);
  });

  test("skips blank-person rows and the header/separator", () => {
    const withBlank = FIXTURE.replace("| Riley", "|        |    |          | |  | | |\n| Riley");
    expect(parseStructure(withBlank).length).toBe(4);
  });

  test("throws on missing structure fence (usage error)", () => {
    expect(() => parseStructure("no fence here")).toThrow(/structure fence/i);
  });
});

const acme = (): Person[] => parseStructure(FIXTURE);
const SPLIT: SplitTeamSpec = {
  type: "split-team",
  targetTeam: "Payments",
  into: [
    { name: "Payments-Core", lead: "Jordan", members: ["Jordan"] },
    { name: "Payments-Infra", lead: "Riley", members: ["Riley"] },
  ],
};

describe("applySplit", () => {
  test("reassigns members to new teams and points them at their new lead", () => {
    const after = applySplit(acme(), SPLIT);
    const jordan = after.find((r) => r.person === "Jordan")!;
    const riley = after.find((r) => r.person === "Riley")!;
    expect(jordan.team).toBe("Payments-Core");
    expect(riley.team).toBe("Payments-Infra");
    // a lead reports to the targetTeam's former manager (Sam) by default
    expect(jordan.reportsTo).toBe("Sam");
    expect(riley.reportsTo).toBe("Sam");
  });

  test("non-lead members report to their new team lead", () => {
    const spec: SplitTeamSpec = {
      type: "split-team", targetTeam: "Payments",
      into: [
        { name: "Payments-Core", lead: "Jordan", members: ["Jordan", "Riley"] },
        { name: "Payments-Infra", lead: "Sam", members: ["Sam"] },
      ],
    };
    const after = applySplit(acme(), spec);
    expect(after.find((r) => r.person === "Riley")!.reportsTo).toBe("Jordan");
  });

  test("newReporting overrides the default lead manager", () => {
    const after = applySplit(acme(), { ...SPLIT, newReporting: { "Payments-Core": "Dana" } });
    expect(after.find((r) => r.person === "Jordan")!.reportsTo).toBe("Dana");
  });

  test("throws when a member is not in the target team (spec usage error)", () => {
    const bad: SplitTeamSpec = {
      type: "split-team", targetTeam: "Payments",
      into: [{ name: "X", lead: "Alex", members: ["Alex"] }],
    };
    expect(() => applySplit(acme(), bad)).toThrow(/not in target team/i);
  });
});

describe("computeMetrics", () => {
  test("span counts direct reports per manager", () => {
    const m = computeMetrics(acme());
    expect(m.span["Dana"]).toBe(1);  // only Sam reports to Dana in this 4-row fixture
    expect(m.span["Sam"]).toBe(2);   // Jordan + Riley
  });

  test("system-SPOF = systems owned by exactly one person", () => {
    const m = computeMetrics(acme());
    expect(m.spof).toContain("billing-service"); // only Jordan owns it
  });

  test("oncall counts rotations per person", () => {
    const m = computeMetrics(acme());
    expect(m.oncall["Jordan"]).toBe(1);
  });

  test("ratio counts M vs IC per team", () => {
    const m = computeMetrics(acme());
    expect(m.ratio["Payments"]).toEqual({ m: 1, ic: 2 });
  });
});
