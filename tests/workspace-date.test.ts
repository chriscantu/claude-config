// tests/workspace-date.test.ts
// Every Date here is built from an explicit UTC timestamp, so results must
// not change with the host TZ. Run under TZ=Asia/Tokyo and
// TZ=America/Los_Angeles to prove it.
import { describe, expect, test } from "bun:test";
import { daysBetween, orgSlug, todayIso } from "../lib/workspace-date.ts";

describe("todayIso", () => {
  test("returns the UTC calendar date as YYYY-MM-DD", () => {
    expect(todayIso(new Date(Date.UTC(2026, 5, 17, 12, 0)))).toBe("2026-06-17");
  });

  test("23:30 local in UTC-7 is already the next day in UTC", () => {
    // 2026-06-17 23:30 in America/Los_Angeles (PDT, UTC-7) = 2026-06-18 06:30Z.
    expect(todayIso(new Date(Date.UTC(2026, 5, 18, 6, 30)))).toBe("2026-06-18");
  });

  test("00:30 local in UTC+9 is still the previous day in UTC", () => {
    // 2026-06-18 00:30 in Asia/Tokyo (UTC+9) = 2026-06-17 15:30Z.
    expect(todayIso(new Date(Date.UTC(2026, 5, 17, 15, 30)))).toBe("2026-06-17");
  });

  test("defaults to now", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("daysBetween", () => {
  test("same day is 0", () => {
    expect(daysBetween("2026-06-17", "2026-06-17")).toBe(0);
  });

  test("counts whole calendar days forward and backward", () => {
    expect(daysBetween("2026-06-17", "2026-07-01")).toBe(14);
    expect(daysBetween("2026-07-01", "2026-06-17")).toBe(-14);
  });

  test("spring-forward DST change (US 2026-03-08) is still one day per date", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  test("fall-back DST change (US 2026-11-01) is still one day per date", () => {
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  test("crosses a leap day", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  test("unparseable input yields NaN so callers can reject it", () => {
    expect(daysBetween("not-a-date", "2026-06-17")).toBeNaN();
  });
});

describe("orgSlug", () => {
  test("uses the last path segment and strips the onboard- prefix", () => {
    expect(orgSlug("/home/u/onboard-acme")).toBe("acme");
  });

  test("ignores trailing slashes", () => {
    expect(orgSlug("/home/u/onboard-acme/")).toBe("acme");
    expect(orgSlug("/home/u/onboard-acme//")).toBe("acme");
  });

  test("keeps a basename that has no onboard- prefix", () => {
    expect(orgSlug("/home/u/acme-initiative")).toBe("acme-initiative");
  });

  test("only strips onboard- at the start", () => {
    expect(orgSlug("/home/u/team-onboard-acme")).toBe("team-onboard-acme");
  });

  test("relative path with no directory", () => {
    expect(orgSlug("onboard-acme")).toBe("acme");
  });
});
