# Fork gus0711 - Device & Gateway Metadata Enrichment

## Problematique

L'analyzer original ecoute uniquement les topics **Gateway Bridge** de ChirpStack (`eu868/gateway/+/event/up`). Ces messages ne contiennent que la trame radio brute (PHY payload) avec :
- **DevAddr** (4 octets) comme seul identifiant device
- Pas de nom de device, pas de DevEUI pour les trames data
- Pas de nom de gateway

Les devices apparaissent donc uniquement sous forme d'adresses hex (ex: `017710AA`) sans contexte humain.

## Solution implementee

Double enrichissement via :
1. **MQTT Application Topics** - Subscription aux topics `application/+/device/+/event/+` de ChirpStack pour recuperer automatiquement les metadata devices
2. **ChirpStack REST API** (optionnel) - Polling periodique pour recuperer les noms de gateways

---

## Architecture

```
ChirpStack MQTT Broker
  |
  |-- eu868/gateway/+/event/up          (existant - trames radio)
  |     |
  |     v
  |   parser/*.ts -> ParsedPacket -> ClickHouse (packets)
  |
  |-- application/+/device/+/event/+    (NOUVEAU - metadata devices)
        |
        v
      handleApplicationMessage() -> DeviceMetadataCache -> ClickHouse (device_metadata)
                                         |
                                         v
                                   API enrichment -> Frontend (noms devices)

ChirpStack REST API (optionnel)
  |
  v
GatewaySync (polling 5min) -> upsertGateway(id, name) -> Frontend (noms gateways)
```

## Modifications detaillees

### Backend

#### `src/types.ts`
- Ajout interface `DeviceMetadata` : dev_addr, dev_eui, device_name, application_name, device_profile_name, last_seen
- Ajout interface `ChirpStackApiConfig` : url, api_key
- Extension `MqttConfig` : champ optionnel `application_topic`
- Extension `Config` : champ optionnel `chirpstack_api`
- Extension `LivePacket` : champ optionnel `device_name`
- Extension `DeviceProfile` : champs optionnels device_name, dev_eui, application_name, device_profile_name
- Extension `TreeDevice` : champ optionnel `device_name`

#### `src/db/migrations.ts`
- Nouvelle table `device_metadata` :
  ```sql
  CREATE TABLE device_metadata (
    dev_addr String,
    dev_eui String,
    device_name String,
    application_name String,
    device_profile_name String,
    last_seen DateTime64(3)
  ) ENGINE = ReplacingMergeTree(last_seen) ORDER BY dev_addr
  ```
- ReplacingMergeTree assure que seule la derniere version par dev_addr est conservee

#### `src/db/queries.ts`
- `upsertDeviceMetadata(metadata)` : Insert dans device_metadata (ReplacingMergeTree gere la deduplication)
- `getAllDeviceMetadata()` : SELECT avec FINAL pour charger le cache au demarrage

#### `src/metadata/cache.ts` (NOUVEAU)
- Classe `DeviceMetadataCache` avec double index en memoire :
  - `byDevAddr: Map<string, DeviceMetadata>` - lookup principal
  - `byDevEui: Map<string, DeviceMetadata>` - lookup secondaire
- `loadFromDatabase()` : Chargement initial depuis ClickHouse
- `upsert(metadata)` : Mise a jour cache + persistance DB
- `getByDevAddr()` / `getByDevEui()` : Lookups O(1)
- `getAll()` : Pour l'endpoint API frontend

#### `src/metadata/gateway-sync.ts` (NOUVEAU)
- Classe `GatewaySync` : polling optionnel de l'API REST ChirpStack
- Requete `GET /api/gateways?limit=100&offset=N` toutes les 5 minutes
- Pagination automatique si >100 gateways
- Callback vers `upsertGateway(gatewayId, name)` pour persister les noms
- Active uniquement si `[chirpstack_api]` est configure dans config.toml

#### `src/mqtt/consumer.ts`
- Nouveau type `MetadataHandler` et tableau `metadataHandlers`
- Export `onDeviceMetadata(handler)` pour enregistrer des handlers metadata
- Dans `connectMqtt()` : subscription additionnelle a `application_topic` si configure
- Detection automatique dans `handleMessage()` : les topics commencant par `application/` sont routes vers `handleApplicationMessage()`
- `handleApplicationMessage(topic, message)` :
  - Parse JSON (format par defaut de l'integration MQTT ChirpStack v4)
  - Extrait `data.deviceInfo` : deviceName, devEui, applicationName, deviceProfileName
  - Extrait `data.devAddr` pour le mapping
  - Emet un `DeviceMetadata` vers tous les handlers enregistres

#### `src/config.ts`
- Parsing du champ `application_topic` dans la section `[mqtt]`
- Parsing de la section optionnelle `[chirpstack_api]`

#### `src/index.ts`
- Import des nouveaux modules : `DeviceMetadataCache`, `GatewaySync`, `onDeviceMetadata`
- Sequence d'init etendue :
  1. Creation du `DeviceMetadataCache` + chargement depuis DB
  2. Enregistrement du handler `onDeviceMetadata` qui alimente le cache
  3. Si `chirpstack_api` configure : demarrage du `GatewaySync`
  4. Passage du `metadataCache` a `startApi()`
- Arret propre du `GatewaySync` dans `shutdown()`

#### `src/api/index.ts`
- Stockage du `metadataCache` en variable module
- Export `getMetadataCache()` pour les autres modules API
- Nouvelle route `GET /api/metadata/devices` : retourne tous les devices connus avec leurs metadata

#### `src/api/devices.ts`
- Route `/api/devices/:devaddr/profile` : enrichissement du profil avec device_name, dev_eui, application_name, device_profile_name depuis le cache

#### `src/api/gateways.ts`
- Route `/api/gateways/:id/devices` : ajout de `device_name` sur chaque device
- Route `/api/gateways/:id/operators/:operator/devices` : idem

#### `src/websocket/live.ts`
- Import de `getMetadataCache`
- Dans `convertToLivePacket()` : lookup du device_name par dev_addr et ajout au LivePacket broadcast

### Frontend

#### `public/dashboard.js`
- Nouvelle variable d'etat `deviceMetadataMap` (dev_addr -> metadata)
- Nouvelle fonction `loadDeviceMetadata()` : fetch `/api/metadata/devices`, construit la map
- Appel au chargement initial (dans `DOMContentLoaded`)
- **Gateway tabs** : affiche `gw.name` si disponible, sinon `gw.gateway_id` (avec tooltip = gateway_id)
- **Device list** : affiche le nom du device sous le DevAddr (text-xs, tronque si trop long, avec tooltip complet)
- **Recherche** : inclut device_name et dev_eui dans le texte searchable

#### `public/device.html`
- Ajout dans le header :
  - `<span id="device-name">` : nom du device (apres le DevAddr)
  - Ligne metadata : DevEUI (`#device-deveui`), Application (`#device-app`), Profile (`#device-profile-type`)

#### `public/device.js`
- Apres chargement du profil : peuplement des elements HTML metadata si disponibles (device_name, dev_eui, application_name, device_profile_name)

#### `public/packet-feed.js`
- Tooltip (`title`) sur les adresses des uplinks et downlinks affichant le device_name quand disponible

#### `public/live.js`
- Gateway tabs : affiche le nom si disponible (meme pattern que dashboard)

### Configuration

#### `config.toml.example`
- Nouveau champ documente dans `[mqtt]` : `application_topic`
- Nouvelle section documentee `[chirpstack_api]` : url + api_key

---

## Configuration

### Enrichissement devices (MQTT)

Ajouter dans `config.toml` section `[mqtt]` :
```toml
application_topic = "application/+/device/+/event/+"
```

Les noms de devices se peuplent **automatiquement** a chaque uplink ChirpStack. Pas de configuration manuelle des noms necessaire.

### Enrichissement gateways (API REST, optionnel)

Ajouter dans `config.toml` :
```toml
[chirpstack_api]
url = "http://chirpstack:8080"
api_key = "votre-api-key"
```

L'API key se genere dans l'interface web ChirpStack : API Keys.

### Sans configuration supplementaire

L'analyzer fonctionne normalement sans ces options. Les metadata sont un enrichissement optionnel - tout le reste reste inchange.

---

## Comportement

### Peuplement des metadata
- Au demarrage : chargement du cache depuis la table `device_metadata` de ClickHouse
- En cours d'execution : chaque message sur `application/+/device/+/event/+` met a jour le cache + la DB
- Les metadata sont persistees et survivent aux redemarrages

### Mapping DevAddr
- Le DevAddr est attribue lors du Join (OTAA) et peut changer au re-join
- Le mapping se met a jour automatiquement au prochain uplink apres un re-join
- Pas de TTL sur la table device_metadata (les anciennes entrees sont ecrasees par ReplacingMergeTree)

### Performance
- Cache in-memory : lookup O(1) par DevAddr ou DevEUI
- Pas d'impact sur le pipeline de paquets existant (enrichissement cote API, pas cote ingestion)
- Les messages application sont en volume inferieur aux messages gateway (dedupliques par le network server)
