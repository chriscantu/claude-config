import { expect, test } from "bun:test";
import { type NewestListing, recordListing } from "./plugin-listing.ts";

test("a plugin turned off later keeps the size from the last listing that named it", () => {
  const newest: NewestListing = new Map();
  const engineering = "- engineering:review: Review code";
  recordListing(newest, "2026-11-24T18:00:00Z", [engineering, "- superpowers:tdd: old"]);
  recordListing(newest, "2026-11-24T20:00:00Z", ["- superpowers:tdd: newer text"]);
  expect(newest.get("engineering")).toEqual({ ts: "2026-11-24T18:00:00Z", chars: engineering.length });
  expect(newest.get("superpowers")!.ts).toBe("2026-11-24T20:00:00Z");
});

test("an older listing seen later does not replace a newer one", () => {
  const newest: NewestListing = new Map();
  recordListing(newest, "2026-11-24T20:00:00Z", ["- superpowers:a: x", "- superpowers:b: y"]);
  recordListing(newest, "2026-11-24T18:00:00Z", ["- superpowers:a: x"]);
  expect(newest.get("superpowers")!.chars).toBe("- superpowers:a: x".length + "- superpowers:b: y".length);
});
