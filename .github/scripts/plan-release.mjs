const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error(`${label} is not a valid semantic version: ${value}`);
  }

  return {
    value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    stable: match[4] === undefined
  };
}

function compareVersions(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function nextPatch(version) {
  return `${version.major}.${version.minor}.${version.patch + 1}`;
}

export function planRelease({
  packageVersion,
  publishedVersions,
  hasReservationCommit,
  hasReleaseTag,
  headIsReservation
}) {
  const current = parseVersion(packageVersion, "package version");
  if (!current.stable) {
    throw new Error(`package version must be stable: ${packageVersion}`);
  }
  if (!Array.isArray(publishedVersions) || publishedVersions.length === 0) {
    throw new Error("npm returned no published versions");
  }

  const published = publishedVersions.map((version, index) =>
    parseVersion(version, `published version at index ${index}`)
  );
  const stablePublished = published.filter((version) => version.stable);
  if (stablePublished.length === 0) {
    throw new Error("npm returned no stable published versions");
  }

  const highestPublished = stablePublished.reduce((highest, version) =>
    compareVersions(version, highest) > 0 ? version : highest
  );
  const currentIsPublished = published.some((version) => version.value === packageVersion);

  if (!currentIsPublished) {
    const expectedReservation = nextPatch(highestPublished);
    if (packageVersion !== expectedReservation) {
      throw new Error(
        `unpublished package version ${packageVersion} is not the next patch after ${highestPublished.value}`
      );
    }
    if (!hasReservationCommit) {
      throw new Error(`unpublished package version ${packageVersion} has no release commit on main`);
    }

    return {
      mode: "resume",
      version: packageVersion,
      needsTag: !hasReleaseTag,
      shouldPublish: true
    };
  }

  if (headIsReservation) {
    if (!hasReservationCommit) {
      throw new Error(`HEAD claims release ${packageVersion} without a matching release commit`);
    }
    return {
      mode: "complete",
      version: packageVersion,
      needsTag: !hasReleaseTag,
      shouldPublish: false
    };
  }

  return {
    mode: "allocate",
    version: nextPatch(highestPublished),
    needsTag: true,
    shouldPublish: true
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(process.env.RELEASE_STATE_JSON ?? "");
  const plan = planRelease(input);
  process.stdout.write([
    `RELEASE_MODE=${plan.mode}`,
    `RELEASE_VERSION=${plan.version}`,
    `RELEASE_NEEDS_TAG=${plan.needsTag}`,
    `RELEASE_SHOULD_PUBLISH=${plan.shouldPublish}`,
    ""
  ].join("\n"));
}
