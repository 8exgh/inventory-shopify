// Server component: the values are injected by the Docker build
// (GIT_COMMIT / BUILD_TIME build args set by the GitHub Action).
export function BuildInfoFooter() {
  const commit = process.env.GIT_COMMIT || 'dev';
  const buildTime = process.env.BUILD_TIME || '';

  const shortCommit = commit === 'unknown' || commit === 'dev' ? commit : commit.substring(0, 7);
  const builtAt = buildTime && buildTime !== 'unknown'
    ? buildTime.replace('T', ' ').replace('Z', ' UTC')
    : '';

  return (
    <footer className="py-3 text-center text-xs text-gray-400">
      build {shortCommit}
      {builtAt && <> &middot; {builtAt}</>}
    </footer>
  );
}
