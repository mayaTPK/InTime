# InTime

InTime is an offline-first time-zone converter. Enter a date and time, choose
the source and destination time zones, and see the converted time. The
destination defaults to your device's time zone and is saved on your device.

## Run it

Open `index.html` directly in a modern browser. The app has no external
dependencies or network requests. To enable the installable app and its
service-worker cache, serve this folder from a local or hosted web server over
`localhost` or HTTPS, then open it once while online. The cached app shell is
available on later visits without a network connection.

## Time-zone coverage

The selectors list the IANA time zones supported by the browser's built-in
`Intl` time-zone database. They show time-zone abbreviations, full names, UTC
offsets, and broad regions—not city names. Conversion applies the browser's
time-zone rules for the selected date, including daylight-saving changes. If a
local time happens twice when clocks move back, choose which occurrence to use;
nonexistent times during a clock change are reported instead of silently
converted.

All conversion happens locally in your browser. The app does not use a server,
account, analytics, or external API.
