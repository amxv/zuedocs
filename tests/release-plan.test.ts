import { describe, expect, test } from "bun:test";

import { planRelease } from "../.github/scripts/plan-release.mjs";

const publishedThrough022 = ["0.1.19", "0.1.20", "0.1.21", "0.1.22"];

describe("release planning", () => {
  test("allocates above every immutable npm version", () => {
    expect(planRelease({
      packageVersion: "0.1.21",
      publishedVersions: publishedThrough022,
      hasReservationCommit: true,
      hasReleaseTag: false,
      headIsReservation: false
    })).toEqual({ mode: "allocate", version: "0.1.23", needsTag: true, shouldPublish: true });
  });

  test("resumes a tagged Git reservation that npm does not contain", () => {
    expect(planRelease({
      packageVersion: "0.1.23",
      publishedVersions: publishedThrough022,
      hasReservationCommit: true,
      hasReleaseTag: true,
      headIsReservation: true
    })).toEqual({ mode: "resume", version: "0.1.23", needsTag: false, shouldPublish: true });
  });

  test("repairs a missing tag before resuming an unpublished reservation", () => {
    expect(planRelease({
      packageVersion: "0.1.23",
      publishedVersions: publishedThrough022,
      hasReservationCommit: true,
      hasReleaseTag: false,
      headIsReservation: true
    })).toEqual({ mode: "resume", version: "0.1.23", needsTag: true, shouldPublish: true });
  });

  test("treats an already-published release commit as complete", () => {
    expect(planRelease({
      packageVersion: "0.1.22",
      publishedVersions: publishedThrough022,
      hasReservationCommit: true,
      hasReleaseTag: true,
      headIsReservation: true
    })).toEqual({ mode: "complete", version: "0.1.22", needsTag: false, shouldPublish: false });
  });

  test("allocates a new patch when main has content after the published release", () => {
    expect(planRelease({
      packageVersion: "0.1.22",
      publishedVersions: publishedThrough022,
      hasReservationCommit: true,
      hasReleaseTag: true,
      headIsReservation: false
    })).toEqual({ mode: "allocate", version: "0.1.23", needsTag: true, shouldPublish: true });
  });

  test("fails closed for an unreserved unpublished package version", () => {
    expect(() => planRelease({
      packageVersion: "0.1.23",
      publishedVersions: publishedThrough022,
      hasReservationCommit: false,
      hasReleaseTag: false,
      headIsReservation: false
    })).toThrow("has no release commit on main");
  });

  test("fails closed when a reservation skips an immutable patch", () => {
    expect(() => planRelease({
      packageVersion: "0.1.24",
      publishedVersions: publishedThrough022,
      hasReservationCommit: true,
      hasReleaseTag: true,
      headIsReservation: true
    })).toThrow("is not the next patch after 0.1.22");
  });

  test("fails closed for empty or malformed registry metadata", () => {
    expect(() => planRelease({
      packageVersion: "0.1.22",
      publishedVersions: [],
      hasReservationCommit: false,
      hasReleaseTag: false,
      headIsReservation: false
    })).toThrow("npm returned no published versions");
    expect(() => planRelease({
      packageVersion: "0.1.22",
      publishedVersions: ["not-a-version"],
      hasReservationCommit: false,
      hasReleaseTag: false,
      headIsReservation: false
    })).toThrow("is not a valid semantic version");
  });
});
