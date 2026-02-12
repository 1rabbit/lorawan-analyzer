# ChirpStack Toolkit

Unified ChirpStack management platform: real-time LoRaWAN traffic analysis + device import/export/bulk operations. Built with TypeScript, Fastify, ClickHouse.

Result of merging **lorawan-analyzer** (traffic analysis) with **Chirpstack_import_web** (device management) into a single application.

## Features

### Traffic Analysis
- **Dashboard** -- gateway tabs, operator/device tree, traffic charts, channel/SF distribution, duty cycle
- **Device detail** -- per-device FCnt timeline, packet loss, RSSI/SNR trends, interval histogram
- **Live packet feed** -- real-time WebSocket stream with filters
- **Operator identification** -- built-in LoRa Alliance NetID database (175+ operators) + custom mappings
- **Visibility filtering** -- separate "my devices" from foreign traffic
- **Join request tracking** -- grouped by JoinEUI with timeline
- **Airtime calculation** -- per-packet, Semtech SX127x formula

### Device Management (management.html)
- **Import** -- CSV/XLSX file upload, column auto-mapping, validation, preview, undo
- **Export** -- download devices as CSV/XLSX with filters (device profile, activity, tags)
- **Bulk delete** -- select devices, confirmation by count, batch deletion
- **Migration** -- move devices between applications (with keys)
- **Change Device Profile** -- bulk update device profiles
- **Update tags** -- upload CSV/XLSX to merge or replace device tags
- **Cross-app search** -- find a device across all applications by DevEUI
- **Import profiles** -- define required tags for import validation
- **ChirpStack proxy** -- multi-server proxy with saved server bookmarks

## Setup

### 1. Configure

```bash
cp config.toml.example config.toml
```

Edit `config.toml` to set your MQTT broker (for traffic analysis):

```toml
[mqtt]
server = "tcp://your-chirpstack-mqtt:1883"
topic = "eu868/gateway/+/event/up"
format = "protobuf"
```

The management page works without MQTT -- it connects directly to ChirpStack via the built-in proxy.

### 2. Start

```bash
docker compose up -d
```

| Container | Port | Description |
|---|---|---|
| `analyzer` | `15337` | Web dashboard + API |
| `clickhouse` | -- | ClickHouse database (internal) |

- Dashboard: [http://localhost:15337](http://localhost:15337)
- Management: [http://localhost:15337/management.html](http://localhost:15337/management.html)

To check logs:

```bash
docker compose logs -f analyzer
```

### Custom Operators

Label your own networks (overrides built-in NetID database):

```toml
[[operators]]
prefix = "26000000/20"
name = "My Network"
known_devices = true
color = "#3b82f6"
```

### Hide Rules

Suppress specific traffic from the UI:

```toml
[[hide_rules]]
type = "dev_addr"
prefix = "26000000/20"
description = "Hide my sensors"
```

## API

### Traffic Analysis

| Endpoint | Description |
|----------|-------------|
| `GET /api/gateways` | List gateways with stats |
| `GET /api/gateways/:id/tree` | Operator/device tree |
| `GET /api/devices/:devaddr/packets` | Packet history |
| `GET /api/stats/summary` | Dashboard summary |
| `GET /api/stats/timeseries` | Traffic time-series |
| `WS /api/live` | Live packet feed |

### Device Management

| Endpoint | Description |
|----------|-------------|
| `GET /api/import-profiles` | List import profiles |
| `POST /api/import-profiles` | Create import profile |
| `GET /api/chirpstack-servers` | List saved servers |
| `POST /api/chirpstack-servers` | Save server bookmark |
| `POST /api/import/parse-csv` | Parse uploaded CSV/XLSX |
| `POST /api/import/validate` | Validate import data |
| `POST /api/import/execute` | Execute device import |
| `POST /api/import/undo` | Undo last import |
| `GET /api/export/devices` | Export devices (CSV/XLSX) |
| `GET /api/templates/csv` | Download CSV template |
| `POST /api/bulk/delete` | Bulk delete devices |
| `POST /api/bulk/migrate` | Migrate devices between apps |
| `POST /api/bulk/change-profile` | Bulk change device profile |
| `POST /api/bulk/update-tags` | Bulk update tags from file |

### ChirpStack Proxy

| Endpoint | Description |
|----------|-------------|
| `GET\|POST\|PUT\|DELETE /proxy/*` | Forward to ChirpStack server |

Target server via `X-ChirpStack-URL` header or `?server=` query param. Auth via `Grpc-Metadata-Authorization: Bearer <token>`.

## Multiplex Setup

Aggregate traffic from multiple ChirpStack instances:

```bash
docker compose --profile multiplex up -d
```

This adds a Mosquitto broker on port `15338`. Bridge your ChirpStack instances to it.

## Development

```bash
npm install
npm run dev          # Watch mode (tsx)
npm run build        # Production build (esbuild)
npm start            # Run production build
```

Frontend files (`public/`) are volume-mounted in Docker -- changes apply on browser refresh.

```bash
docker compose build --no-cache analyzer && docker compose up -d
```

## License

MIT
