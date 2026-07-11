#!/usr/bin/env bash
set -euo pipefail

package_name="$(node -p "require('./package.json').name")"
package_version="$(node -p "require('./package.json').version")"
published_versions="$(npm view "$package_name" versions --json)"
release_message="chore: release v${package_version} [skip ci] [skip release]"
reservation_commit="$(git log origin/main --format=%H --fixed-strings --grep="$release_message" | head -n 1)"

has_reservation=false
head_is_reservation=false
if [[ -n "$reservation_commit" ]]; then
  reserved_version="$(git show "${reservation_commit}:package.json" | node -e "let data=''; process.stdin.on('data', chunk => data += chunk).on('end', () => console.log(JSON.parse(data).version))")"
  [[ "$reserved_version" == "$package_version" ]] || { echo "Release commit package version mismatch" >&2; exit 1; }
  git merge-base --is-ancestor "$reservation_commit" origin/main
  has_reservation=true
  [[ "$(git rev-parse HEAD)" == "$reservation_commit" ]] && head_is_reservation=true
fi

release_tag="v${package_version}"
has_tag=false
if git show-ref --verify --quiet "refs/tags/${release_tag}"; then
  tag_commit="$(git rev-parse "refs/tags/${release_tag}^{commit}")"
  tag_version="$(git show "${release_tag}:package.json" | node -e "let data=''; process.stdin.on('data', chunk => data += chunk).on('end', () => console.log(JSON.parse(data).version))")"
  [[ "$tag_version" == "$package_version" ]] || { echo "Release tag package version mismatch" >&2; exit 1; }
  git merge-base --is-ancestor "$tag_commit" origin/main
  [[ -z "$reservation_commit" || "$tag_commit" == "$reservation_commit" ]] || { echo "Release tag does not identify the release commit" >&2; exit 1; }
  has_tag=true
fi

release_state="$(node -e 'const [packageVersion,publishedVersions,hasReservationCommit,hasReleaseTag,headIsReservation]=process.argv.slice(1); process.stdout.write(JSON.stringify({packageVersion,publishedVersions:JSON.parse(publishedVersions),hasReservationCommit:hasReservationCommit==="true",hasReleaseTag:hasReleaseTag==="true",headIsReservation:headIsReservation==="true"}))' "$package_version" "$published_versions" "$has_reservation" "$has_tag" "$head_is_reservation")"
while IFS='=' read -r key value; do
  [[ -n "$key" ]] && export "$key=$value"
done < <(RELEASE_STATE_JSON="$release_state" node .github/scripts/plan-release.mjs)

if [[ "$RELEASE_MODE" == "allocate" ]]; then
  release_tag="v${RELEASE_VERSION}"
  ! git show-ref --verify --quiet "refs/tags/${release_tag}" || { echo "Candidate tag ${release_tag} already exists" >&2; exit 1; }
  npm version "$RELEASE_VERSION" --no-git-tag-version
  git add package.json
  git commit -m "chore: release v${RELEASE_VERSION} [skip ci] [skip release]"
  reservation_commit="$(git rev-parse HEAD)"
  git push origin HEAD:main
  git fetch origin main
  [[ "$(git rev-parse origin/main)" == "$reservation_commit" ]] || { echo "Release commit is not durable on main" >&2; exit 1; }
fi

if [[ "$RELEASE_NEEDS_TAG" == "true" ]]; then
  [[ -n "$reservation_commit" ]] || { echo "Cannot tag without a release commit" >&2; exit 1; }
  release_tag="v${RELEASE_VERSION}"
  git tag "$release_tag" "$reservation_commit"
  git push origin "refs/tags/${release_tag}"
fi

git fetch origin main --tags
tag_commit="$(git rev-parse "refs/tags/v${RELEASE_VERSION}^{commit}")"
[[ "$tag_commit" == "$reservation_commit" ]] || { echo "Release tag does not identify the persisted release commit" >&2; exit 1; }
git merge-base --is-ancestor "$tag_commit" origin/main
tag_version="$(git show "v${RELEASE_VERSION}:package.json" | node -e "let data=''; process.stdin.on('data', chunk => data += chunk).on('end', () => console.log(JSON.parse(data).version))")"
[[ "$tag_version" == "$RELEASE_VERSION" ]] || { echo "Tagged package version mismatch" >&2; exit 1; }

{
  echo "RELEASE_VERSION=$RELEASE_VERSION"
  echo "RELEASE_TAG=v${RELEASE_VERSION}"
  echo "RELEASE_COMMIT=$reservation_commit"
  echo "RELEASE_SHOULD_PUBLISH=$RELEASE_SHOULD_PUBLISH"
} >> "$GITHUB_ENV"
