import { ScheduleChoiceRequest, ScheduleConfirmRequest } from "@tadayo/contracts";
const bodies: unknown[] = [undefined, null, 1, "x", [], {}, { x: 1 }, { expected_version: "1", weekdays: [1], member: 2 },
  { expected_version: 1, weekdays: ["sunday"] }, { expected_version: -1, weekdays: "monday", a: { b: 1 } },
  { expected_version: 1, weekdays: ["monday", "monday"], __proto__: { z: 1 } }, { weekdays: [["monday"]] }];
const firsts = new Set<string>();
for (const schema of [ScheduleChoiceRequest, ScheduleConfirmRequest]) for (const body of bodies) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) for (const issue of parsed.error.issues) firsts.add(`${typeof issue.path[0]}:${String(issue.path[0])}:${issue.code}`);
}
console.log([...firsts].sort().join("\n"));
