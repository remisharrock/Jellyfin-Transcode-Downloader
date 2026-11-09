# Stop the transcode when its download ends

Jellyfin does not always delete a progressive transcode's temporary file after FFmpeg exits.
Each plugin download therefore gets a synthetic `PlaySessionId` and `DeviceId`, and the client
sends `DELETE /Videos/ActiveEncodings` when the transfer finishes, fails, is cancelled, or the
page is closed. The unique pair prevents a new download from reusing an old transcode file.

The stop request uses the standard `Authorization: MediaBrowser` header instead of a query token.
For Android browser handoffs, the page has no completion signal, so it records only the server
and session identifiers in local storage and sends the stop on a later plugin load after six
hours. That delay avoids terminating a browser download that is still in progress.
