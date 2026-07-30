# PR test builds

Throwaway artifacts for testing a pull request on a real Jellyfin server **before** it is
merged and before a real release exists. Everything in this directory is temporary and
should be deleted before merging upstream.

## Why this exists

Normally a build reaches a Jellyfin server through the tag-driven pipeline
(`release.yml` / `release-test.yml`): an annotated tag produces a GitHub release and a
manifest entry on `main`. That pipeline needs **GitHub Actions to be enabled**, which
GitHub disables by default on forks, and it needs a tag — neither of which is available
while a PR is still open on a fresh fork.

So the manifest here is hand-built and self-contained: the plugin zip is committed
alongside it and served straight from `raw.githubusercontent.com` on the PR branch. No
release, no tag, no Actions run required.

## Installing on a test server

Add this URL under **Dashboard → Plugins → Repositories → Add**:

```
https://raw.githubusercontent.com/remisharrock/Jellyfin-Transcode-Downloader/refs/heads/copilot/video-codec-selection-implementation/repo/pr-builds/manifest.json
```

Then install **Transcode Downloader** from the catalog (pick version `1.0.26.1`) and
restart Jellyfin. The **File Transformation** plugin (>= v2.2.1.0) must already be
installed — see the main [README](../../README.md).

The plugin GUID is identical to the released plugin, so this cleanly replaces an existing
install and reverts by reinstalling a version from the production manifest.

## Publishing a new PR build

The checksum pins the exact bytes of the committed zip, so the manifest and the zip must
always be regenerated together, with a new version number (versions are immutable — a
server that has already seen `1.0.26.1` will not re-download it):

```
VERSION=1.0.26.2
dotnet publish src/JellyfinTranscodeDownloader.csproj -c Release -o publish/ -p:Version=$VERSION
cp logo.png publish/
(cd publish && zip -r -X "../repo/pr-builds/jellyfin-transcode-downloader_$VERSION.zip" \
   Jellyfin.Plugin.TranscodeDownloader.dll logo.png)
md5sum "repo/pr-builds/jellyfin-transcode-downloader_$VERSION.zip"
```

Then add a matching entry to `manifest.json` with that `version`, `sourceUrl` and
`checksum`, and delete the superseded zip.

## Removing this before merge

Delete the whole `repo/pr-builds/` directory. Once GitHub Actions is enabled on the fork
(**Actions** tab → *I understand my workflows, go ahead and enable them*), use the normal
pipeline instead:

```
git tag -a test/v1.0.26.2 -m "What changed"
git push origin test/v1.0.26.2
```

which publishes a real pre-release and appends to `repo/manifest-testing.json`.
