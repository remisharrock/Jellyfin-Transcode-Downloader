# Hand Android app downloads to the system browser

The Jellyfin Android app embeds jellyfin-web in a WebView that discards the plugin's
`Blob`-based `<a download>` action. When the Android app bridges and Android user agent are both
present, the plugin opens the transcoded stream URL with `NativeShell.openUrl` instead.

The external browser owns the transfer, so the plugin cannot show progress, cancel it, or
control the filename; Jellyfin saves it as `stream.mp4`. The picker explains this before the
user selects a quality. The transcode cleanup is deferred to a later page load because the app
does not report when the browser finishes.
