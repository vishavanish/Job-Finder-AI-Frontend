/** QA2 §5: the skill-gap chips name each skill once. */
import { describe, expect, it } from "vitest";
import type { StreamedJob } from "../../lib/api/types";
import { skillGaps, splitSkills } from "./skillGaps";

const withGaps = (...missing: string[]) =>
  ({ match: { missing_required: missing } }) as StreamedJob;

describe("skill gaps", () => {
  it("splits combined skills and keeps words that only contain 'or'/'and'", () => {
    expect(splitSkills("PostgreSQL / MongoDB")).toEqual(["PostgreSQL", "MongoDB"]);
    expect(splitSkills("Kafka or Flink, Spark")).toEqual(["Kafka", "Flink", "Spark"]);
    expect(splitSkills("Oracle")).toEqual(["Oracle"]);
    expect(splitSkills("Android")).toEqual(["Android"]);
    expect(splitSkills("Data streaming (e.g., Kafka, Flink)")).toEqual([
      "Data streaming (e.g., Kafka, Flink)",
    ]);
  });

  it("counts a skill once per job, whatever its case or combination", () => {
    const gaps = skillGaps([
      withGaps("MongoDB", "PostgreSQL / MongoDB"),
      withGaps("mongodb", "Stripe"),
      withGaps("Elasticsearch"),
    ]);
    expect(gaps[0]).toEqual({ skill: "MongoDB", n: 2 });
    expect(gaps.map((g) => g.skill)).toEqual(["MongoDB", "Elasticsearch", "PostgreSQL", "Stripe"]);
  });
});
