# LoRaWAN Analyzer

Real-time LoRaWAN traffic analyzer for ChirpStack. Captures uplinks, downlinks, join requests, and TX acknowledgements via MQTT, stores everything in ClickHouse, and serves a web dashboard for monitoring and analysis.

![Dashboard](assets/dashboard.png)

![Live Feed](assets/live.png)

## Features

- **Dashboard** -- gateway tabs, operator/device tree, traffic charts, channel/SF distribution, duty cycle, device breakdown
- **Device detail view** -- per-device FCnt timeline, packet loss, RSSI/SNR trends, interval histogram, SF/frequency/gateway distributions
- **Live packet feed** -- real-time WebSocket stream with packet type, RSSI range, and ownership filters
- **Operator identification** -- built-in LoRa Alliance NetID database (175+ operators), plus custom prefix mappings
- **Visibility filtering** -- separate "my devices" from foreign traffic using DevAddr prefix rules
- **Join request tracking** -- grouped by JoinEUI with timeline and manufacturer lookup
- **Session tracking** -- correlates join requests with subsequent data uplinks
- **Airtime calculation** -- per-packet, based on Semtech SX127x datasheet formulas

## Setup

The analyzer connects directly to your ChirpStack installation's MQTT broker -- the same one that ChirpStack Gateway Bridge publishes to. No extra MQTT server needed.

### 1. Configure MQTT

```bash
cp config.toml.example config.toml
```

Edit `config.toml` and set `mqtt.server` to your ChirpStack MQTT broker:

```toml
[mqtt]
server = "tcp://your-chirpstack-mqtt:1883"
username = ""
password = ""
topic = "eu868/gateway/+/event/up"
format = "protobuf"
```

- **`server`** -- the MQTT broker that ChirpStack Gateway Bridge publishes to
- **`topic`** -- the region prefix (`eu868`, `us915`, `as923`, etc.) must match your Gateway Bridge config. The analyzer automatically derives downlink and ack topics from this.
- **`format`** -- `protobuf` for ChirpStack v4 (default), `json` for v3 or JSON marshaler

**Finding your MQTT broker address from Docker:**

| ChirpStack setup | `mqtt.server` value |
|---|---|
| On the same host, separate compose project | `tcp://host.docker.internal:1883` or `tcp://172.17.0.1:1883` |
| In the same Docker network | `tcp://<mosquitto-container-name>:1883` |
| Remote host | `tcp://chirpstack.example.com:1883` |

If unsure, check your ChirpStack `docker-compose.yml` for the mosquitto/EMQX service name, or your `chirpstack-gateway-bridge.toml` for the MQTT server address.

### 2. Start

```bash
docker compose up -d
```

This starts two containers:

| Container | Port | Description |
|---|---|---|
| `lorawan-analyzer` | `15337` | Web dashboard + API |
| `lorawan-clickhouse` | -- | ClickHouse database (internal only) |

Dashboard at [http://localhost:15337](http://localhost:15337). Packets appear as soon as gateways publish to the broker.

To check logs:

```bash
docker compose logs -f analyzer
```

### Custom Operators

Label your own networks. These override the built-in NetID database:

```toml
[[operators]]
prefix = "26000000/20"          # hex DevAddr prefix / bit length
name = "My Network"
known_devices = true            # marks as "my devices" for visibility filter
color = "#3b82f6"               # dashboard color

# multiple prefixes per operator
[[operators]]
prefix = ["26011234/32", "26015678/32"]
name = "My Sensors"
known_devices = true
```

Prefix format: `AABBCCDD/N` -- the upper N bits of the DevAddr are compared. `26000000/20` matches any DevAddr starting with `0x26000...`.

### Hide Rules

Suppress specific traffic from the UI:

```toml
[[hide_rules]]
type = "dev_addr"               # or "join_eui"
prefix = "26000000/20"
description = "Hide my sensors"
```

Both operators and hide rules can also be managed at runtime via the API (see below).

All other settings (`[clickhouse]`, `[api]`) have sensible defaults for Docker -- see [`config.toml.example`](config.toml.example) for details.

## API

Most endpoints accept `hours` (time window, default varies) and `gateway_id` (filter by gateway) query parameters. Endpoints returning device data also support `filter_mode` (`owned`/`foreign`/`all`) and `prefixes` (comma-separated `HEX/bits` list).

### Gateways

| Endpoint | Description |
|----------|-------------|
| `GET /api/gateways` | List all gateways with stats |
| `GET /api/gateways/:id` | Single gateway details |
| `GET /api/gateways/:id/tree` | Operator/device tree |
| `GET /api/gateways/:id/operators` | Operators seen on gateway |
| `GET /api/gateways/:id/devices` | Devices on gateway |
| `GET /api/gateways/:id/operators/:name/devices` | Devices for a specific operator |

### Devices

| Endpoint | Description |
|----------|-------------|
| `GET /api/devices/:devaddr` | Device activity / recent packets |
| `GET /api/devices/:devaddr/profile` | Summary stats (packet count, avg RSSI/SNR, airtime) |
| `GET /api/devices/:devaddr/fcnt-timeline` | Frame counter progression with gap detection |
| `GET /api/devices/:devaddr/intervals` | Packet interval histogram |
| `GET /api/devices/:devaddr/signal-trends` | RSSI/SNR over time |
| `GET /api/devices/:devaddr/distributions` | SF, frequency, gateway breakdown |
| `GET /api/devices/:devaddr/packet-loss` | Missed packets / loss rate |

### Joins

| Endpoint | Description |
|----------|-------------|
| `GET /api/joins` | Recent join requests |
| `GET /api/joins/by-eui` | Grouped by JoinEUI |
| `GET /api/joins/eui/:joinEui/timeline` | Timeline for a specific JoinEUI |

### Statistics

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats/summary` | Overview stats (packets, devices, airtime, duty cycle) |
| `GET /api/stats/operators` | Per-operator breakdown |
| `GET /api/stats/timeseries` | Time series data (accepts `interval`, `metric`, `group_by`) |
| `GET /api/stats/duty-cycle` | Duty cycle stats |
| `GET /api/stats/downlinks` | Downlink / TX ack stats |
| `GET /api/packets/recent` | Recent packets (accepts `packet_types`, `rssi_min`, `rssi_max`) |
| `GET /api/spectrum/:gw/channels` | Channel usage distribution |
| `GET /api/spectrum/:gw/spreading-factors` | SF distribution |

### Operators & Config

| Endpoint | Description |
|----------|-------------|
| `GET /api/operators` | List custom operators |
| `POST /api/operators` | Add operator (`{prefix, name, priority?}`) |
| `DELETE /api/operators/:id` | Remove operator |
| `GET /api/hide-rules` | List hide rules |
| `POST /api/hide-rules` | Add rule (`{type, prefix, description?}`) |
| `DELETE /api/hide-rules/:id` | Remove rule |
| `GET /api/config/my-devices` | Configured "my devices" prefixes |
| `GET /api/config/operator-colors` | Operator color map |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /api/live` | Live packet stream (all gateways) |
| `WS /api/live/:gatewayId` | Live stream for a specific gateway |

Query parameters: `types` (comma-separated: `data`, `join_request`, `downlink`, `tx_ack`), `rssi_min`, `rssi_max`, `filter_mode`, `prefixes`.

## Development

```bash
# Rebuild after backend/source changes
docker compose build --no-cache analyzer && docker compose up -d

# Restart after config changes
docker compose restart analyzer
```

Frontend files (`public/`) are volume-mounted -- changes apply on browser refresh.

## License

MIT
