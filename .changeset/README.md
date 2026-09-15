# Changesets

Run `bun changeset` and follow the prompt whenever a PR changes user-facing
behavior. It writes a markdown file in this directory describing the change
and its semver bump; `.github/workflows/version.yml` consumes those files to
open/update a "Version Packages" PR that bumps `package.json` and
`CHANGELOG.md`. `log-cli` is private (`"private": true`) so this is
version/changelog tracking only — nothing is published to a registry. See
https://github.com/changesets/changesets for the underlying tool.
