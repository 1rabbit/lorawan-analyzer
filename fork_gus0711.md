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

### Derniere trame (Last Frame)
- Les messages application MQTT contiennent le payload dechiffre (`data` en base64) et decode (`object` en JSON si codec configure)
- Le dernier payload est stocke en memoire uniquement (pas en DB) dans le cache metadata
- Affiche dans la page device detail : FCnt, FPort, timestamp, hex brut, et JSON decode
- Se perd au redemarrage (se re-peuple au prochain uplink du device)

### Performance
- Cache in-memory : lookup O(1) par DevAddr ou DevEUI
- Pas d'impact sur le pipeline de paquets existant (enrichissement cote API, pas cote ingestion)
- Les messages application sont en volume inferieur aux messages gateway (dedupliques par le network server)

---

# Page Settings - Configuration Zero-Config via Web UI

## Problematique

Toute la configuration (broker MQTT, topics, API ChirpStack, operateurs, hide rules) se faisait uniquement en editant `config.toml` manuellement. Pour un nouvel utilisateur, cela signifiait :
- Copier `config.toml.example` en `config.toml`
- Editer le fichier avec les bons parametres
- Redemarrer le container

L'objectif est un setup "zero-config" : installer, ouvrir le navigateur, configurer depuis la page Settings, et commencer a analyser.

## Solution implementee

Page Settings web accessible depuis la navigation, avec :
- Configuration MQTT (broker, topic, auth, format) avec hot-reconnect
- Configuration ChirpStack API (optionnelle) avec demarrage/arret a chaud
- Gestion des operateurs custom (CRUD via API existante)
- Gestion des hide rules (CRUD via API existante)
- Indicateur de statut MQTT en temps reel
- Persistance des settings dans ClickHouse (priorite sur config.toml)
- Demarrage gracieux sans config MQTT (attente de configuration via Settings)

---

## Architecture

```
Settings Page (Web UI)
  |
  |-- PUT /api/settings/mqtt          -> setSetting('mqtt', JSON) -> onMqttChanged callback
  |                                         |
  |                                         v
  |                                    disconnectMqtt() + connectMqtt(newConfig)
  |
  |-- PUT /api/settings/chirpstack-api -> setSetting('chirpstack_api', JSON) -> onChirpStackApiChanged
  |                                         |
  |                                         v
  |                                    GatewaySync.stop() + new GatewaySync().start()
  |
  |-- GET /api/settings               -> getAllSettings() from ClickHouse
  |-- GET /api/settings/status         -> getMqttStatus() (connected/server)

Startup Flow:
  loadConfig(TOML) -> initClickHouse -> migrations -> loadSettingsFromDb()
    -> mergeConfigWithDbSettings(TOML, DB)  [DB overrides TOML]
    -> if mqtt.server: connectMqtt()
    -> else: "MQTT not configured, waiting for Settings page"
    -> startApi(callbacks)
```

## Modifications detaillees

### Backend

#### `src/db/migrations.ts`
- Nouvelle table `settings` :
  ```sql
  CREATE TABLE IF NOT EXISTS settings (
    key String,
    value String,
    updated_at DateTime64(3)
  ) ENGINE = ReplacingMergeTree(updated_at) ORDER BY key
  ```
- ReplacingMergeTree avec `updated_at` comme version : les INSERT successifs sur la meme `key` ecrasent la valeur precedente

#### `src/db/queries.ts`
- `getSetting(key)` : SELECT value FROM settings FINAL WHERE key = {key}
- `setSetting(key, value)` : INSERT INTO settings avec timestamp courant
- `getAllSettings()` : SELECT key, value FROM settings FINAL -> Record<string, string>

#### `src/config.ts`
- `DEFAULT_CONFIG` exporte (etait `const` interne, devient `export const`)
- `mqtt.server` default change de `'tcp://localhost:1883'` a `''` (vide = pas configure)
- `applyEnvOverrides(config)` : surcharge via variables d'environnement :
  - `CLICKHOUSE_URL` -> `config.clickhouse.url`
  - `CLICKHOUSE_DATABASE` -> `config.clickhouse.database`
  - `API_BIND` -> `config.api.bind`
- `loadSettingsFromDb()` : lit les cles `mqtt` et `chirpstack_api` depuis la table settings, parse le JSON
- `mergeConfigWithDbSettings(config, dbSettings)` : fusionne DB > TOML > defaults

#### `src/mqtt/consumer.ts`
- Variable `currentServer` stockee a chaque `connectMqtt()`, effacee a chaque `disconnectMqtt()`
- `getMqttStatus()` exporte : retourne `{ connected: boolean, server: string | null }`

#### `src/api/settings.ts` (NOUVEAU)
- Interface `SettingsCallbacks` : `onMqttChanged(MqttConfig)`, `onChirpStackApiChanged(ChirpStackApiConfig | null)`
- `settingsRoutes(callbacks)` : factory de plugin Fastify, 5 routes :
  - `GET /api/settings` : retourne settings actuels (mqtt, chirpstack_api, mqtt_status)
  - `GET /api/settings/status` : retourne uniquement le statut MQTT
  - `PUT /api/settings/mqtt` : valide body, sauve en DB, appelle `onMqttChanged` (disconnect + reconnect)
  - `PUT /api/settings/chirpstack-api` : valide body, sauve en DB, appelle `onChirpStackApiChanged` (restart sync)
  - `DELETE /api/settings/chirpstack-api` : efface la config, appelle `onChirpStackApiChanged(null)` (stop sync)

#### `src/api/index.ts`
- Import et branchement de `settingsRoutes` avec callbacks
- Signature `startApi()` etendue avec parametre optionnel `callbacks: SettingsCallbacks`

#### `src/index.ts`
- Nouveau flux de demarrage :
  1. `loadConfig(TOML)` -> config de base
  2. `initClickHouse()` -> toujours avec TOML/defaults/env
  3. `runMigrations()` -> cree la table settings si absente
  4. `loadSettingsFromDb()` -> lit les settings persistees
  5. `mergeConfigWithDbSettings()` -> DB overrides TOML
  6. Si `mqtt.server` non vide : `connectMqtt()` ; sinon log "waiting for Settings"
  7. `startApi()` avec callbacks de reconnexion
- Callback `onMqttChanged` : `disconnectMqtt()` + `connectMqtt(newConfig)` si server non vide
- Callback `onChirpStackApiChanged` : `GatewaySync.stop()` + new `GatewaySync().start()` si config fournie, sinon stop uniquement
- Les handlers `onPacket` et `onDeviceMetadata` sont enregistres **avant** le connect MQTT, donc persistent a travers les reconnexions

#### `docker-compose.yml`
- Suppression du volume `./config.toml:/app/config.toml:ro` (plus obligatoire)
- Suppression de `CONFIG_PATH` en variable d'environnement
- Ajout des variables d'environnement :
  - `CLICKHOUSE_URL: http://clickhouse:8123`
  - `API_BIND: "0.0.0.0:3000"`

### Frontend

#### `public/settings.html` (NOUVEAU)
- Page complete avec header et navigation coherents avec le reste du dashboard
- 4 sections :
  1. **MQTT Broker** : champs server, topic, username, password, format (select), application_topic + indicateur de statut (dot vert/rouge/jaune) + bouton "Save & Connect"
  2. **ChirpStack API** : champs url, api_key + boutons "Save" et "Disable"
  3. **Custom Operators** : liste des operateurs existants + formulaire ajout (prefix, name, priority) + bouton delete par ligne
  4. **Hide Rules** : liste des regles existantes + formulaire ajout (type select, prefix, description) + bouton delete par ligne

#### `public/settings.js` (NOUVEAU)
- IIFE pour eviter la pollution du scope global
- Helper `api(path, options)` : wrapper fetch avec gestion d'erreur JSON
- **MQTT** :
  - `loadSettings()` : GET /api/settings, peuple tous les champs du formulaire
  - `updateMqttStatus(status)` : met a jour le dot (vert=connecte, jaune=en cours, gris=pas configure) et le texte
  - `refreshStatus()` : GET /api/settings/status, appele toutes les 5s par setInterval
  - Bouton "Save & Connect" : PUT /api/settings/mqtt, affiche feedback, refresh status apres 2s et 5s
- **ChirpStack API** :
  - Bouton "Save" : PUT /api/settings/chirpstack-api
  - Bouton "Disable" : DELETE /api/settings/chirpstack-api, vide les champs
- **Operators** :
  - `loadOperators()` : GET /api/operators, rendu HTML de la liste avec boutons delete
  - `deleteOperator(id)` : DELETE /api/operators/:id, reload
  - Bouton "Add" : POST /api/operators, vide les champs, reload
- **Hide Rules** :
  - `loadHideRules()` : GET /api/hide-rules, rendu HTML
  - `deleteHideRule(id)` : DELETE /api/hide-rules/:id, reload
  - Bouton "Add" : POST /api/hide-rules, vide les champs, reload
- Helper `esc(str)` : echappement HTML via textContent/innerHTML
- Auto-refresh du statut MQTT toutes les 5 secondes

#### `public/index.html`
- Ajout lien navigation : `<a href="settings.html" class="nav-link">Settings</a>`

#### `public/live.html`
- Ajout lien navigation : `<a href="settings.html" class="nav-link">Settings</a>`

#### `public/device.html`
- Ajout lien navigation : `<a href="settings.html" class="nav-link">Settings</a>`

---

## Flux utilisateur zero-config

1. `docker compose up -d` (pas besoin de config.toml)
2. Ouvrir `http://localhost:15337` -> dashboard vide
3. Cliquer sur "Settings" dans la navigation
4. Remplir le broker MQTT : `tcp://host.docker.internal:1883`, topic `eu868/gateway/+/event/up`
5. Cliquer "Save & Connect" -> indicateur passe au vert, les paquets commencent a arriver
6. Optionnel : configurer ChirpStack API pour les noms de gateways
7. Optionnel : ajouter des operateurs custom et des hide rules

## Compatibilite ascendante

- Si `config.toml` existe : l'app le charge normalement, les settings DB **ont priorite** sur le TOML
- La page Settings affiche les valeurs actives (DB ou TOML)
- Les utilisateurs existants n'ont rien a changer
- Les endpoints API existants (`/api/operators`, `/api/hide-rules`) sont reutilises tels quels
