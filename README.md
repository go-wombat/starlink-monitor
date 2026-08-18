# Starlink Monitor

[![CI](https://github.com/go-wombat/starlink-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/go-wombat/starlink-monitor/actions/workflows/ci.yml)

Native GL.iNet SDK4 dashboard for a Starlink dish. The local endpoint defaults
to `192.168.100.1:9201` and its IPv4 address can be changed from Tools.

Built with [`gl-sdk4-plugin-kit`](https://github.com/go-wombat/gl-sdk4-plugin-kit).

![Starlink Monitor overview](docs/starlink-overview.jpg)

The plugin is deliberately on-demand:

- no init service or historian is installed;
- no telemetry is written to flash;
- the CGI proxy runs only while an authenticated admin page requests data;
- polling pauses while the page is hidden and stops when it is closed;
- charts use the dish's own 15-minute, one-second ring buffer.

The native `Starlink` submenu contains five focused views:

- **Overview** — live status plus the dish's own 15-minute throughput, latency,
  ping-success and power history;
- **Dish** — alignment instruments, model and firmware details, readiness and
  active terminal alerts;
- **Sky** — a large obstruction survey, sky coverage metrics and current pointing;
- **Network** — read-only GL.iNet client and link counters related to the local
  Starlink setup;
- **Tools** — a user-triggered browser speed test, one-shot local diagnostics,
  and the authenticated Dish endpoint setting.

Overview, Dish, and Sky update automatically only while their page is visible.
Tools never starts work by itself. Closing or hiding a page stops its timers and
aborts active requests; no history is maintained by the router.

History is refreshed every three seconds. Throughput, latency, and power axes
start from fixed practical baselines and may only grow to a rounded maximum
during the current page session; a lower subsequent sample never rescales the
chart. Outage bands use the event start time and cause as their stable identity,
are rendered in chronological order, and move left together with the rolling
15-minute window. Scaling, in-place native chart updates, and outage rendering
are provided by the shared `GlStableLineChart` adapter from
`gl-sdk4-plugin-kit`; the plugin contains no separate chart scaling engine.

## Build

```bash
git clone https://github.com/go-wombat/starlink-monitor.git
cd starlink-monitor
npm install
npm test
npm run check
npm run build
npm run package
```

The generated OpenWrt package is written to `dist/`. Install it with
`npm run router:install` after configuring the router connection used by the
SDK CLI.

Published `.ipk` packages and their `SHA256SUMS` file are available from
[GitHub Releases](https://github.com/go-wombat/starlink-monitor/releases). Each
`v*` tag is rebuilt, tested, packaged, checksummed, and published automatically.

The full-stack package depends on OpenWrt's `curl`, `gl-oui-rpc`, `ubus`,
`jsonfilter`, and `uci` packages. Its router-side CGI is a fixed read-only proxy
for the three protobuf requests used by the UI.

## Safety boundary

The proxy accepts only `status`, `history`, and `obstruction`. It does not accept
a target URL, request bytes, Starlink account credentials, or write commands.
Every request carries the current admin SID through the SDK 0.8 browser helper;
the packaged shell helper validates it with `gl-session` and requires the root
ACL group before reading the action or Dish address.
The endpoint setting is changed through an authenticated GL.iNet RPC module,
accepts only a validated unicast IPv4 address, and keeps the protocol, port, and
RPC path fixed. The CGI validates the stored address again before every request.
The setting is written only when Save or Reset is pressed; telemetry is never
persisted. Starlink's local API is unofficial and may change with firmware.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the Dishylink MIT
attribution.
