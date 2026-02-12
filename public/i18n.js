// i18n engine — zero dependency, zero build step
// Usage: t('key'), t('key', { param: 'value' }), setLang('fr'), getLang(), translatePage()
(function () {
  'use strict';

  var DEFAULT_LANG = 'en';
  var STORAGE_KEY = 'lang';
  var currentLang = DEFAULT_LANG;

  // ============================================================
  // DICTIONARIES
  // ============================================================

  var translations = {
    en: {
      // ---- Common ----
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.confirm': 'Confirm',
      'common.apply': 'Apply',
      'common.add': 'Add',
      'common.create': 'Create',
      'common.load': 'Load',
      'common.loading': 'Loading...',
      'common.search': 'Search',
      'common.close': 'Close',
      'common.download': 'Download',
      'common.error': 'Error',
      'common.select': '-- Select --',
      'common.all': '-- All --',
      'common.none': '-- None --',
      'common.unmapped': '-- Unmapped --',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.back': 'Back',
      'common.off': 'off',
      'common.unknown': 'Unknown',
      'common.never': 'Never',
      'common.no_data': 'No data',
      'common.failed_to_load': 'Failed to load',
      'common.done': 'Done',
      'common.show_hide': 'Show/Hide',
      'common.optional': 'optional',
      'common.disable': 'Disable',
      'common.disabled': 'Disabled',
      'common.saved': 'Saved!',

      // ---- Navigation ----
      'nav.title': 'LoRaWAN Analyzer',
      'nav.dashboard': 'Dashboard',
      'nav.live': 'Live Stream',
      'nav.toolkit': 'Toolkit ChirpStack',
      'nav.settings': 'Settings',
      'nav.device': 'Device',

      // ---- Dashboard (index.html) ----
      'dashboard.title': 'LoRaWAN Analyzer',
      'dashboard.filter_list': 'Filter list...',
      'dashboard.time': 'Time:',
      'dashboard.my_devices': 'My Devices',
      'dashboard.unknown_devices': 'Unknown Devices',
      'dashboard.all_gateways': 'All Gateways',
      'dashboard.packets': 'Packets',
      'dashboard.active_devices': 'Active Devices',
      'dashboard.total_airtime': 'Total Airtime',
      'dashboard.rx_airtime': 'RX Airtime',
      'dashboard.tx_duty_cycle': 'TX Duty Cycle',
      'dashboard.downlinks': 'Downlinks',
      'dashboard.tx_ack_ok': 'TX ACK OK',
      'dashboard.tx_ack_fail': 'TX ACK Fail',
      'dashboard.traffic_over_time': 'Traffic Over Time',
      'dashboard.by_operator': 'By Operator',
      'dashboard.channel_usage': 'Channel Usage',
      'dashboard.spreading_factor': 'Spreading Factor',
      'dashboard.recent_joins': 'Recent Joins',
      'dashboard.devices': 'Devices',
      'dashboard.no_devices': 'No devices',
      'dashboard.no_join_requests': 'No join requests',
      'dashboard.ownership': 'Ownership',
      'dashboard.mine': 'Mine',
      'dashboard.activity': 'Activity',
      'dashboard.high_activity': 'High (100+)',
      'dashboard.med_activity': 'Med (10-99)',
      'dashboard.low_activity': 'Low (<10)',
      'dashboard.totals': 'Totals',
      'dashboard.pkts': 'pkts',
      'dashboard.dev': 'dev',

      // ---- Help Tooltips ----
      'help.packets': 'Total LoRaWAN packets captured by your gateways in the selected period. Includes uplinks, downlinks, joins and ACKs from all devices in radio range — yours and others.',
      'help.active_devices': 'Unique devices (by DevAddr) that sent at least one packet. Includes your devices ("Private") and nearby devices from other operators (Orange, TTN, etc.).',
      'help.total_airtime': 'Cumulative radio transmission time of all received packets. EU868 regulation limits duty cycle to 1% per sub-band. High airtime = heavy channel usage.',
      'help.rx_airtime': 'Percentage of time your gateway radio was busy receiving. Below 1% is normal. Above 5% means heavy traffic with risk of packet collisions and missed frames.',
      'help.tx_duty_cycle': 'Percentage of time your gateway spent transmitting downlinks. EU regulation limits this to 1-10% depending on sub-band. Exceeding limits is illegal and can cause interference.',
      'help.downlinks': 'Downlink frames sent from ChirpStack through your gateways to devices. Includes confirmed/unconfirmed data, MAC commands, and join accepts.',
      'help.tx_ack_ok': 'Downlinks successfully transmitted by the gateway radio. A high OK rate means the gateway TX path is healthy and duty cycle is not exhausted.',
      'help.tx_ack_fail': 'Failed downlink transmissions. Causes: duty cycle limit reached, channel busy, or gateway radio issue. Should stay close to 0. Persistent failures need investigation.',
      'help.traffic_over_time': 'Packet volume trend grouped by network operator. Helps identify traffic patterns, peak hours, and anomalies. Click a legend entry to isolate one operator.',
      'help.by_operator': 'Breakdown of packets by operator, identified from DevAddr prefix (NetID). "Private" = your ChirpStack network. Other names = nearby devices from commercial networks.',
      'help.channel_usage': 'Distribution of packets across LoRa frequency channels (EU868: 868.1-868.5 MHz). Balanced usage is ideal. One dominant channel may indicate ADR or device misconfiguration.',
      'help.spreading_factor': 'Distribution of spreading factors (SF7-SF12). SF7 = close devices, fast, low airtime. SF12 = distant devices, slow, high airtime. Lots of high SF may indicate poor coverage.',
      'help.recent_joins': 'Recent OTAA join requests captured by your gateways. A join means a device is (re)activating on the network. Frequent re-joins from the same device may indicate connectivity issues.',
      'help.devices': 'All devices seen in the selected time period, sorted by activity. Click a device to see detailed analytics. Star icon marks favorites that sort to the top.',

      // ---- Device page help ----
      'help.dev_packets': 'Total uplink packets received from this specific device. A sudden drop may indicate the device went offline, moved out of range, or encountered a join issue.',
      'help.dev_missed': 'Estimated missed frames based on gaps in the frame counter (FCnt). LoRaWAN increments FCnt with each uplink — gaps mean packets were sent but not received by any gateway.',
      'help.dev_packet_loss': 'Percentage of estimated missed frames vs total expected. Below 1% is excellent. 1-5% is acceptable for LoRaWAN. Above 10% suggests poor coverage or interference.',
      'help.dev_airtime': 'Cumulative radio transmission time of this device\'s packets. Depends on spreading factor and payload size. High airtime = more channel usage and battery drain.',
      'help.dev_duty_cycle': 'This device\'s contribution to the gateway duty cycle. EU868 regulation limits total TX to 1% per sub-band. One device rarely impacts this unless sending very frequently at high SF.',
      'help.dev_interval': 'Average time between consecutive uplinks. Helps verify the device transmit interval matches its configuration (e.g., 60s, 5min, 15min).',
      'help.dev_rssi': 'Average Received Signal Strength Indicator. Above -100 dBm is good. -100 to -115 is marginal. Below -115 is weak — consider moving the device or adding a gateway.',
      'help.dev_snr': 'Average Signal-to-Noise Ratio. Above +5 dB is good. 0 to +5 is acceptable. Below 0 dB means the signal is close to the noise floor — expect packet loss.',
      'help.dev_gateways': 'Number of different gateways that received packets from this device. Multiple gateways = better redundancy and reliability through spatial diversity.',
      'help.dev_rssi_chart': 'RSSI value for each individual uplink over time. Look for trends: gradual degradation may indicate battery issues or environmental changes.',
      'help.dev_snr_chart': 'SNR value for each individual uplink over time. Correlates with spreading factor — higher SF tolerates lower SNR but uses more airtime.',
      'help.dev_last_frame': 'Raw payload of the most recent uplink. Useful for debugging codec issues or verifying the device is sending expected data.',
      'help.dev_sf': 'Distribution of spreading factors used by this device. Ideally most packets use low SF (7-8). High SF usage means ADR is compensating for poor signal.',
      'help.dev_channels': 'Frequency channels used by this device. LoRaWAN devices should hop across all available channels. Uneven distribution may indicate a channel plan mismatch.',
      'help.dev_gateway_dist': 'Which gateways received this device\'s packets and how many. Helps identify the primary gateway and evaluate multi-gateway coverage.',
      'help.dev_fcnt': 'Frame counter progression over time. Should be a steady staircase. Resets to 0 indicate device rejoin. Flat sections mean no packets received.',
      'help.dev_loss_chart': 'Packet loss rate over time windows. Spikes may correlate with interference events, weather conditions, or temporary obstructions.',
      'help.dev_interval_chart': 'Distribution of time intervals between consecutive uplinks. A tight peak at the expected interval means stable operation. Wide spread suggests retransmissions or variable behavior.',
      'help.dev_recent_packets': 'Most recent raw packets from this device with signal quality, timing, and payload details. Useful for real-time monitoring and troubleshooting.',

      // ---- Live (live.html) ----
      'live.title': 'Live Stream - LoRaWAN Analyzer',
      'live.packets': 'packets',
      'live.filter_packets': 'Filter packets...',
      'live.waiting': 'Waiting for packets...',

      // ---- Packet Feed ----
      'feed.time': 'Time',
      'feed.type': 'Type',
      'feed.operator': 'Operator',
      'feed.addr': 'Address',
      'feed.dev_eui': 'DevEUI',
      'feed.fcnt': 'FCnt / JoinEUI / DLID',
      'feed.fport': 'FPort',
      'feed.dr': 'DR',
      'feed.freq': 'Freq',
      'feed.rssi': 'RSSI',
      'feed.snr': 'SNR',
      'feed.size': 'Size',
      'feed.airtime': 'Airtime',
      'feed.gateway': 'Gateway',
      'feed.uplinks': 'Uplinks',
      'feed.join_requests': 'Join Requests',
      'feed.downlinks': 'Downlinks',
      'feed.tx_ack': 'TX Acknowledgements',
      'feed.uplink': 'Uplink',
      'feed.uplink_confirmed': 'Uplink Confirmed',
      'feed.uplink_unconfirmed': 'Uplink Unconfirmed',
      'feed.downlink': 'Downlink',
      'feed.downlink_confirmed': 'Downlink Confirmed',
      'feed.downlink_unconfirmed': 'Downlink Unconfirmed',
      'feed.join': 'Join',
      'feed.ack': 'Ack',
      'feed.no_devices_found': 'No devices found',

      // ---- Device (device.html) ----
      'device.title': 'Device Details - LoRaWAN Analyzer',
      'device.back': '\u2190 Back',
      'device.deveui': 'DevEUI',
      'device.app': 'App',
      'device.profile': 'Profile',
      'device.first_seen': 'First seen',
      'device.last_seen': 'Last seen',
      'device.loading': 'Loading device data...',
      'device.not_found': 'Device not found',
      'device.no_addr': 'No device address specified',
      'device.failed_load': 'Failed to load device data',
      'device.my_device': '(My Device)',
      'device.packets': 'Packets',
      'device.missed': 'Missed',
      'device.packet_loss': 'Packet Loss',
      'device.total_airtime': 'Total Airtime',
      'device.duty_cycle': 'Duty Cycle',
      'device.avg_interval': 'Avg Interval',
      'device.avg_rssi': 'Avg RSSI',
      'device.avg_snr': 'Avg SNR',
      'device.gateways': 'Gateways',
      'device.last_frame': 'Last Frame',
      'device.fcnt': 'FCnt',
      'device.fport': 'FPort',
      'device.received': 'Received',
      'device.raw_hex': 'Raw (hex)',
      'device.decoded': 'Decoded',
      'device.rssi_chart': 'RSSI (per packet)',
      'device.snr_chart': 'SNR (per packet)',
      'device.spreading_factor': 'Spreading Factor',
      'device.channel_usage': 'Channel Usage',
      'device.gateway_distribution': 'Gateway Distribution',
      'device.fcnt_timeline': 'Frame Counter Timeline',
      'device.packet_loss_chart': 'Packet Loss Over Time',
      'device.interval_chart': 'Packet Interval Distribution',
      'device.recent_packets': 'Recent Packets',
      'device.frame_counter': 'Frame Counter',
      'device.missed_label': 'Missed',

      // ---- Device modal (dashboard) ----
      'modal.operator': 'Operator',
      'modal.packets': 'Packets',
      'modal.total_airtime': 'Total Airtime',
      'modal.avg_interval': 'Avg Interval',
      'modal.first_seen': 'First Seen',
      'modal.last_seen': 'Last Seen',
      'modal.signal_quality': 'Signal Quality',
      'modal.avg_rssi': 'Avg RSSI',
      'modal.avg_snr': 'Avg SNR',
      'modal.spreading_factors': 'Spreading Factors',
      'modal.frequencies': 'Frequencies',
      'modal.signal_per_uplink': 'Signal (per uplink)',
      'modal.uplinks_over_time': 'Uplinks over Time',
      'modal.recent_activity': 'Recent Activity',
      'modal.no_recent_activity': 'No recent activity',
      'modal.no_data_found': 'No data found',
      'modal.failed_load': 'Failed to load device data',

      // ---- Settings ----
      'settings.title': 'Settings - LoRaWAN Analyzer',
      'settings.mqtt_broker': 'MQTT Broker',
      'settings.mqtt_status_unknown': 'Unknown',
      'settings.mqtt_connected': 'Connected to {server}',
      'settings.mqtt_connecting': 'Connecting to {server}...',
      'settings.mqtt_not_configured': 'Not configured',
      'settings.server_url': 'Server URL',
      'settings.topic': 'Topic',
      'settings.username': 'Username',
      'settings.password': 'Password',
      'settings.format': 'Format',
      'settings.app_topic': 'Application Topic',
      'settings.save_connect': 'Save & Connect',
      'settings.server_url_required': 'Server URL is required',
      'settings.saved_connecting': 'Saved! Connecting...',
      'settings.chirpstack_api': 'ChirpStack API',
      'settings.chirpstack_optional': 'Optional - enriches gateway names',
      'settings.api_key': 'API Key',
      'settings.url_apikey_required': 'URL and API Key are required',
      'settings.saved_sync': 'Saved! Sync started.',
      'settings.custom_operators': 'Custom Operators',
      'settings.no_operators': 'No custom operators configured',
      'settings.prefix_hex': 'Prefix (hex)',
      'settings.name': 'Name',
      'settings.priority': 'Priority',
      'settings.hide_rules': 'Hide Rules',
      'settings.no_hide_rules': 'No hide rules configured',
      'settings.rule_type': 'Type',
      'settings.prefix': 'Prefix',
      'settings.description': 'Description',

      // ---- Search bar ----
      'search.placeholder': 'Search devices...',
      'search.no_results': 'No devices found',
      'search.toggle_favorite': 'Toggle favorite',

      // ---- Management - Connection ----
      'mgmt.connection_title': 'ChirpStack Connection',
      'mgmt.disconnected': 'Disconnected',
      'mgmt.connected': 'Connected',
      'mgmt.saved_servers': 'Saved Servers',
      'mgmt.select_server': '-- Select a server --',
      'mgmt.server_actions': 'Server Actions',
      'mgmt.chirpstack_url': 'ChirpStack URL',
      'mgmt.api_token': 'API Token',
      'mgmt.connect': 'Connect',
      'mgmt.url_required': 'ChirpStack URL required',
      'mgmt.token_required': 'API token required',
      'mgmt.url_invalid': 'URL must start with http:// or https://',
      'mgmt.connecting': 'Connecting...',
      'mgmt.connected_admin': 'Connected (Admin key)',
      'mgmt.connected_admin_no_tenants': 'Connected but no tenants found',
      'mgmt.connected_tenant': 'Connected (Tenant key) \u2014 enter Tenant ID manually',
      'mgmt.failed': 'Failed: {message}',
      'mgmt.key_type': 'Key Type',
      'mgmt.admin': 'Admin',
      'mgmt.admin_no_tenants': 'Admin (no tenants)',
      'mgmt.tenant': 'Tenant',
      'mgmt.tenant_id': 'Tenant ID (tenant key)',
      'mgmt.select_tenant': 'Tenant',
      'mgmt.application': 'Application',
      'mgmt.device_profile': 'Device Profile',
      'mgmt.all_applications': '-- All applications --',
      'mgmt.all_profiles': '-- All profiles --',
      'mgmt.total_devices': 'Total Devices',
      'mgmt.active_24h': 'Active (24h)',
      'mgmt.inactive': 'Inactive',
      'mgmt.never_seen': 'Never Seen',
      'mgmt.save_server': 'Save Server',
      'mgmt.server_name': 'Server Name',
      'mgmt.server_saved': 'Server saved',
      'mgmt.delete_server': 'Delete Server',
      'mgmt.delete_server_confirm': 'Delete server "{name}"?',
      'mgmt.server_deleted': 'Server deleted',
      'mgmt.select_to_delete': 'Select a server to delete',
      'mgmt.url_required_save': 'URL required to save',
      'mgmt.loading_select': '-- Loading... --',
      'mgmt.error_select': '-- Error --',

      // ---- Management - Import ----
      'import.title': 'Device Import',
      'import.profiles': 'Import Profiles',
      'import.profile_name': 'Profile Name',
      'import.required_tags': 'Required Tags (comma-separated)',
      'import.delete_profile': 'Delete Profile',
      'import.delete_profile_confirm': 'Delete this import profile?',
      'import.target_app': 'Target Application',
      'import.target_dp': 'Target Device Profile',
      'import.import_profile': 'Import Profile (optional)',
      'import.download_template': 'Download Template',
      'import.csv_template': 'CSV Template',
      'import.drop_zone': 'Drop a CSV/XLSX file here or click to select',
      'import.parse_result': 'Parse Result',
      'import.separator': 'Separator:',
      'import.rows': 'Rows:',
      'import.columns': 'Columns:',
      'import.deveui': 'DevEUI',
      'import.appkey': 'AppKey',
      'import.name': 'Name',
      'import.description': 'Description',
      'import.device_profile_id': 'Device Profile ID',
      'import.required_tags_mapping': 'Required Tags Mapping',
      'import.tag_label': 'Tag: {tag}',
      'import.validate': 'Validate',
      'import.validation_result': 'Validation Result',
      'import.valid': 'Valid',
      'import.errors': 'Errors',
      'import.duplicates': 'Duplicates',
      'import.warnings': 'Warnings',
      'import.duplicate_action': 'Duplicate Action',
      'import.skip': 'Skip',
      'import.overwrite': 'Overwrite',
      'import.import_btn': 'Import',
      'import.import_result': 'Import Result',
      'import.created': 'Created',
      'import.skipped': 'Skipped',
      'import.total': 'Total',
      'import.undo': 'Undo Import',
      'import.undo_confirm': 'Delete the {count} devices created during this import?',
      'import.undo_title': 'Undo Import',
      'import.undoing': 'Undoing...',
      'import.devices_deleted': '{count} devices deleted',
      'import.devices_deleted_errors': '{count} devices deleted, {errors} errors',
      'import.no_devices_undo': 'No devices to undo',
      'import.validating': 'Validating...',
      'import.validation_complete': 'Validation complete',
      'import.importing': 'Importing...',
      'import.import_complete': 'Import complete',
      'import.connection_required': 'ChirpStack connection required',
      'import.select_app': 'Select a target application in the Import section',
      'import.deveui_required': 'DevEUI mapping is required',
      'import.select_dp': 'Select a target Device Profile in the Import section',
      'import.file_read_error': 'File read error',
      'import.row_error': 'Row {row}: {field} \u2014 {message}',
      'import.dup_info': '{deveui} \u2014 exists: "{existing}", CSV: "{csv}"',

      // ---- Management - Export & Bulk ----
      'bulk.title': 'Export & Bulk Operations',
      'bulk.application': 'Application',
      'bulk.tab_export': 'Export',
      'bulk.tab_delete': 'Delete',
      'bulk.tab_migrate': 'Migrate',
      'bulk.tab_change_dp': 'Change DP',
      'bulk.tab_update_tags': 'Update Tags',
      'bulk.tab_search': 'Search',

      // Export
      'export.load_devices': 'Load Devices',
      'export.devices_loaded': '{count} devices loaded',
      'export.filter_dp': 'Device Profile',
      'export.filter_activity': 'Activity',
      'export.active_24h': 'Active (24h)',
      'export.inactive': 'Inactive',
      'export.never_seen_opt': 'Never seen',
      'export.filter_tag': 'Tag (key=value)',
      'export.format': 'Format',
      'export.include_keys': 'Include Keys (AppKey)',
      'export.preview': 'Preview (first 5)',
      'export.preview_deveui': 'DevEUI',
      'export.preview_name': 'Name',
      'export.preview_dp': 'Device Profile',
      'export.preview_last_seen': 'Last Seen',
      'export.downloading': 'Downloading...',
      'export.downloaded': 'Downloaded',
      'export.select_app': 'Select an application',

      // Delete
      'delete.load_devices': 'Load Devices',
      'delete.search_placeholder': 'Search (DevEUI, name...)',
      'delete.select_all': 'Select All',
      'delete.deselect_all': 'Deselect All',
      'delete.selected': '{count} selected',
      'delete.delete_btn': 'Delete',
      'delete.select_one': 'Select at least one device',
      'delete.bulk_title': 'Bulk Delete',
      'delete.bulk_confirm': 'You are about to delete {count} device(s). This action is irreversible.',
      'delete.type_confirm': 'Type {count} to confirm',
      'delete.deleting': 'Deleting...',
      'delete.cancelled': 'Deletion cancelled',
      'delete.deleted': 'Deleted',

      // Migrate
      'migrate.load_devices': 'Load Devices',
      'migrate.search_placeholder': 'Search...',
      'migrate.select_all': 'Select All',
      'migrate.deselect_all': 'Deselect All',
      'migrate.selected': '{count} selected',
      'migrate.dest_app': 'Destination Application',
      'migrate.migrate_btn': 'Migrate',
      'migrate.select_one': 'Select at least one device',
      'migrate.select_source': 'Select a source application',
      'migrate.select_dest': 'Select a destination application',
      'migrate.title': 'Device Migration',
      'migrate.confirm': 'Migrate {count} device(s) to the selected application?',
      'migrate.migrating': 'Migrating...',
      'migrate.migrated': 'Migrated',

      // Change DP
      'dp.load_devices': 'Load Devices',
      'dp.search_placeholder': 'Search...',
      'dp.select_all': 'Select All',
      'dp.deselect_all': 'Deselect All',
      'dp.selected': '{count} selected',
      'dp.new_profile': 'New Device Profile',
      'dp.apply_btn': 'Apply',
      'dp.select_one': 'Select at least one device',
      'dp.select_profile': 'Select a Device Profile',
      'dp.title': 'Change Device Profile',
      'dp.confirm': 'Change the Device Profile of {count} device(s)?',
      'dp.updating': 'Updating...',
      'dp.updated': 'Updated',

      // Update Tags
      'tags.description': 'Upload a CSV/XLSX file with a <strong>dev_eui</strong> column and tag columns.',
      'tags.merge': 'Merge (add/update)',
      'tags.replace': 'Replace (replace all)',
      'tags.drop_zone': 'Drop a CSV/XLSX file or click to select',
      'tags.preview': 'Preview',
      'tags.run_update': 'Run Update',
      'tags.select_file': 'Select a file',
      'tags.updating': 'Updating...',
      'tags.updated': 'Updated',

      // Search
      'cross_search.placeholder': 'DevEUI (full or partial)',
      'cross_search.search_btn': 'Search',
      'cross_search.enter_deveui': 'Enter a DevEUI',
      'cross_search.connection_required': 'Connection and tenant required',
      'cross_search.searching': 'Searching...',
      'cross_search.no_results': 'No results found',
      'cross_search.results': '{count} result(s)',
      'cross_search.col_deveui': 'DevEUI',
      'cross_search.col_name': 'Name',
      'cross_search.col_application': 'Application',
      'cross_search.col_profile': 'Profile',
      'cross_search.col_tags': 'Tags',
      'cross_search.col_last_seen': 'Last Seen',

      // Shared select/bulk
      'bulk.select_app_required': 'Select an application in the Export & Bulk Operations section',
      'bulk.no_devices': 'No devices',
      'bulk.selected': '{count} selected',

      // Management tiles
      'tiles.import': 'Import',
      'tiles.import_desc': 'Import devices from a CSV/XLSX file',
      'tiles.export': 'Export',
      'tiles.export_desc': 'Export application devices to CSV or XLSX',
      'tiles.delete': 'Bulk Delete',
      'tiles.delete_desc': 'Select and delete multiple devices',
      'tiles.migrate': 'Migrate',
      'tiles.migrate_desc': 'Move devices to another application',
      'tiles.change_dp': 'Change Profile',
      'tiles.change_dp_desc': 'Change the Device Profile of multiple devices',
      'tiles.update_tags': 'Update Tags',
      'tiles.update_tags_desc': 'Update tags from CSV/XLSX file',
      'tiles.search': 'Search',
      'tiles.search_desc': 'Find a device by DevEUI across all apps',
      'tiles.analyze': 'Analyse',
      'tiles.analyze_desc': 'Dashboard and detailed device metrics',
      'mgmt.back_to_tools': 'Back to tools',

      // ---- Analyze ----
      'analyze.title': 'Device Analysis',
      'analyze.run': 'Analyze Devices',
      'analyze.total': 'Total',
      'analyze.status_active': 'Active (<24h)',
      'analyze.status_recent': 'Recent (1-7d)',
      'analyze.status_inactive': 'Inactive (7-30d)',
      'analyze.status_offline': 'Offline (>30d)',
      'analyze.status_never': 'Never Seen',
      'analyze.profile_dist': 'Profile Distribution',
      'analyze.all_statuses': 'All statuses',
      'analyze.all_profiles': 'All profiles',
      'analyze.sort_recent': 'Last seen (recent)',
      'analyze.sort_oldest': 'Last seen (oldest)',
      'analyze.sort_name_az': 'Name (A-Z)',
      'analyze.sort_name_za': 'Name (Z-A)',
      'analyze.devices_count': '{count} devices',
      'analyze.no_devices': 'No devices found',
      'analyze.col_name': 'Name',
      'analyze.col_profile': 'Profile',
      'analyze.col_last_seen': 'Last Seen',
      'analyze.col_status': 'Status',
      'analyze.col_actions': 'Actions',
      'analyze.metrics': 'Metrics',
      'analyze.export_csv': 'Export CSV',
      'analyze.loading': 'Loading',
      'analyze.loading_metrics': 'Loading metrics...',
      'analyze.packets_received': 'Packets',
      'analyze.errors': 'Errors',
      'analyze.avg_rssi': 'Avg RSSI',
      'analyze.avg_snr': 'Avg SNR',
      'analyze.packets_chart': 'Packets received',
      'analyze.period_24h': 'Last 24h',
      'analyze.period_7d': 'Last 7 days',
      'analyze.period_30d': 'Last 30 days',
      'analyze.excellent': 'Excellent',
      'analyze.fair': 'Fair',
      'analyze.poor': 'Poor',
      'analyze.metrics_error': 'Failed to load metrics',
      'analyze.never': 'Never',
      'analyze.just_now': '< 1min',
      'analyze.connection_required': 'Connection and tenant required',
      'analyze.select_tenant': 'Select a tenant first',
      'analyze.no_apps': 'No applications found',
      'analyze.loading_apps': 'Loading applications...',
      'analyze.loading_devices': 'Loading devices: {loaded}/{total}',
      'analyze.loading_profiles': 'Loading profiles...',
      'analyze.computing_stats': 'Computing statistics...',
      'analyze.error_analysis': 'Analysis error',
      'analyze.no_devices_export': 'No devices to export',
      'analyze.col_deveui': 'DevEUI',
      'analyze.col_tags': 'Tags',

      // Chart labels
      'chart.packets': 'Packets',
      'chart.rssi_dbm': 'RSSI (dBm)',
      'chart.snr_db': 'SNR (dB)',
      'chart.fcnt': 'FCnt',
      'chart.gaps': 'Gaps',
      'chart.missed_packets': 'Missed Packets',
      'chart.count': 'Count',
      'chart.uplink': 'Uplink',

      // Validation stat labels
      'stat.valid': 'Valid',
      'stat.errors': 'Errors',
      'stat.duplicates': 'Duplicates',
      'stat.warnings': 'Warnings',
      'stat.created': 'Created',
      'stat.skipped': 'Skipped',
      'stat.total': 'Total',
      'stat.deleted': 'Deleted',
      'stat.migrated': 'Migrated',
      'stat.updated': 'Updated',

      // Confirmation labels
      'confirm.title': 'Confirmation',
      'confirm.type_to_confirm': 'Type {value} to confirm',
    },

    fr: {
      // ---- Common ----
      'common.save': 'Enregistrer',
      'common.cancel': 'Annuler',
      'common.delete': 'Supprimer',
      'common.confirm': 'Confirmer',
      'common.apply': 'Appliquer',
      'common.add': 'Ajouter',
      'common.create': 'Cr\u00e9er',
      'common.load': 'Charger',
      'common.loading': 'Chargement...',
      'common.search': 'Rechercher',
      'common.close': 'Fermer',
      'common.download': 'T\u00e9l\u00e9charger',
      'common.error': 'Erreur',
      'common.select': '-- S\u00e9lectionner --',
      'common.all': '-- Tous --',
      'common.none': '-- Aucun --',
      'common.unmapped': '-- Non mapp\u00e9 --',
      'common.yes': 'Oui',
      'common.no': 'Non',
      'common.back': 'Retour',
      'common.off': 'off',
      'common.unknown': 'Inconnu',
      'common.never': 'Jamais',
      'common.no_data': 'Aucune donn\u00e9e',
      'common.failed_to_load': '\u00c9chec du chargement',
      'common.done': 'Termin\u00e9',
      'common.show_hide': 'Afficher/Masquer',
      'common.optional': 'optionnel',
      'common.disable': 'D\u00e9sactiver',
      'common.disabled': 'D\u00e9sactiv\u00e9',
      'common.saved': 'Enregistr\u00e9 !',

      // ---- Navigation ----
      'nav.title': 'LoRaWAN Analyzer',
      'nav.dashboard': 'Tableau de bord',
      'nav.live': 'Flux temps r\u00e9el',
      'nav.toolkit': 'Toolkit ChirpStack',
      'nav.settings': 'Param\u00e8tres',
      'nav.device': 'Appareil',

      // ---- Dashboard ----
      'dashboard.title': 'LoRaWAN Analyzer',
      'dashboard.filter_list': 'Filtrer la liste...',
      'dashboard.time': 'P\u00e9riode :',
      'dashboard.my_devices': 'Mes appareils',
      'dashboard.unknown_devices': 'Appareils inconnus',
      'dashboard.all_gateways': 'Toutes les passerelles',
      'dashboard.packets': 'Paquets',
      'dashboard.active_devices': 'Appareils actifs',
      'dashboard.total_airtime': 'Temps d\'antenne',
      'dashboard.rx_airtime': 'Temps RX',
      'dashboard.tx_duty_cycle': 'Cycle TX',
      'dashboard.downlinks': 'Downlinks',
      'dashboard.tx_ack_ok': 'ACK TX OK',
      'dashboard.tx_ack_fail': 'ACK TX \u00c9chec',
      'dashboard.traffic_over_time': 'Trafic dans le temps',
      'dashboard.by_operator': 'Par op\u00e9rateur',
      'dashboard.channel_usage': 'Utilisation canaux',
      'dashboard.spreading_factor': 'Facteur d\'\u00e9talement',
      'dashboard.recent_joins': 'Joins r\u00e9cents',
      'dashboard.devices': 'Appareils',
      'dashboard.no_devices': 'Aucun appareil',
      'dashboard.no_join_requests': 'Aucune requ\u00eate join',
      'dashboard.ownership': 'Propri\u00e9t\u00e9',
      'dashboard.mine': 'Moi',
      'dashboard.activity': 'Activit\u00e9',
      'dashboard.high_activity': '\u00c9lev\u00e9e (100+)',
      'dashboard.med_activity': 'Moyenne (10-99)',
      'dashboard.low_activity': 'Faible (<10)',
      'dashboard.totals': 'Totaux',
      'dashboard.pkts': 'pqts',
      'dashboard.dev': 'app',

      // ---- Bulles d'aide ----
      'help.packets': 'Total des paquets LoRaWAN captur\u00e9s par vos passerelles sur la p\u00e9riode. Inclut uplinks, downlinks, joins et ACKs de tous les appareils \u00e0 port\u00e9e radio \u2014 les v\u00f4tres et ceux des autres.',
      'help.active_devices': 'Appareils uniques (par DevAddr) ayant envoy\u00e9 au moins un paquet. Inclut vos appareils ("Private") et ceux des r\u00e9seaux voisins (Orange, TTN, etc.).',
      'help.total_airtime': 'Temps de transmission radio cumul\u00e9 de tous les paquets re\u00e7us. La r\u00e9glementation EU868 limite le duty cycle \u00e0 1% par sous-bande. Un airtime \u00e9lev\u00e9 = forte charge des canaux.',
      'help.rx_airtime': 'Pourcentage du temps o\u00f9 la radio de votre passerelle \u00e9tait occup\u00e9e en r\u00e9ception. Moins de 1% est normal. Au-dessus de 5%, risque de collisions et de paquets perdus.',
      'help.tx_duty_cycle': 'Pourcentage du temps d\'\u00e9mission de votre passerelle (downlinks). La r\u00e9glementation EU limite \u00e0 1-10% selon la sous-bande. D\u00e9passer ces limites est ill\u00e9gal et cause des interf\u00e9rences.',
      'help.downlinks': 'Trames descendantes envoy\u00e9es par ChirpStack via vos passerelles. Inclut les donn\u00e9es confirm\u00e9es/non confirm\u00e9es, commandes MAC et accept joins.',
      'help.tx_ack_ok': 'Downlinks transmis avec succ\u00e8s par la radio de la passerelle. Un taux OK \u00e9lev\u00e9 signifie que la cha\u00eene TX fonctionne bien et que le duty cycle n\'est pas \u00e9puis\u00e9.',
      'help.tx_ack_fail': 'Transmissions downlink \u00e9chou\u00e9es. Causes : limite de duty cycle atteinte, canal occup\u00e9, ou probl\u00e8me radio. Doit rester proche de 0. Des \u00e9checs persistants n\u00e9cessitent une investigation.',
      'help.traffic_over_time': 'Tendance du volume de paquets par op\u00e9rateur r\u00e9seau. Permet d\'identifier les sch\u00e9mas de trafic, les heures de pointe et les anomalies. Cliquez sur la l\u00e9gende pour isoler un op\u00e9rateur.',
      'help.by_operator': 'R\u00e9partition des paquets par op\u00e9rateur, identifi\u00e9 par le pr\u00e9fixe DevAddr (NetID). "Private" = votre r\u00e9seau ChirpStack. Les autres = appareils voisins de r\u00e9seaux commerciaux.',
      'help.channel_usage': 'R\u00e9partition des paquets sur les canaux de fr\u00e9quence LoRa (EU868 : 868.1-868.5 MHz). Une utilisation \u00e9quilibr\u00e9e est id\u00e9ale. Un canal dominant peut indiquer un probl\u00e8me ADR ou de configuration.',
      'help.spreading_factor': 'R\u00e9partition des facteurs d\'\u00e9talement (SF7-SF12). SF7 = appareils proches, rapide, faible airtime. SF12 = appareils distants, lent, fort airtime. Beaucoup de SF \u00e9lev\u00e9s peut indiquer une mauvaise couverture.',
      'help.recent_joins': 'Requ\u00eates join OTAA r\u00e9centes. Un join signifie qu\'un appareil s\'\u2019active sur le r\u00e9seau. Des re-joins fr\u00e9quents du m\u00eame appareil peuvent indiquer des probl\u00e8mes de connectivit\u00e9.',
      'help.devices': 'Tous les appareils vus sur la p\u00e9riode, tri\u00e9s par activit\u00e9. Cliquez pour voir les analyses d\u00e9taill\u00e9es. L\'\u00e9toile marque les favoris qui remontent en haut de la liste.',

      // ---- Aide page Device ----
      'help.dev_packets': 'Total des paquets uplink re\u00e7us de cet appareil. Une chute soudaine peut indiquer que l\'appareil est hors ligne, hors de port\u00e9e, ou a rencontr\u00e9 un probl\u00e8me de join.',
      'help.dev_missed': 'Trames manqu\u00e9es estim\u00e9es bas\u00e9es sur les trous du compteur de trames (FCnt). LoRaWAN incr\u00e9mente le FCnt \u00e0 chaque uplink \u2014 les trous signifient des paquets envoy\u00e9s mais non re\u00e7us.',
      'help.dev_packet_loss': 'Pourcentage de trames manqu\u00e9es vs total attendu. Moins de 1% est excellent. 1-5% est acceptable en LoRaWAN. Au-dessus de 10%, la couverture ou les interf\u00e9rences posent probl\u00e8me.',
      'help.dev_airtime': 'Temps de transmission radio cumul\u00e9 des paquets de cet appareil. D\u00e9pend du SF et de la taille du payload. Un airtime \u00e9lev\u00e9 = plus de charge sur les canaux et de consommation batterie.',
      'help.dev_duty_cycle': 'Contribution de cet appareil au duty cycle de la passerelle. La r\u00e9glementation EU868 limite le TX total \u00e0 1% par sous-bande. Un seul appareil impacte rarement ce seuil sauf en SF \u00e9lev\u00e9.',
      'help.dev_interval': 'Temps moyen entre uplinks cons\u00e9cutifs. Permet de v\u00e9rifier que l\'intervalle de transmission correspond \u00e0 la configuration (ex : 60s, 5min, 15min).',
      'help.dev_rssi': 'Indicateur moyen de puissance du signal re\u00e7u. Au-dessus de -100 dBm = bon. De -100 \u00e0 -115 = marginal. En dessous de -115 = faible, envisagez de rapprocher l\'appareil ou d\'ajouter une passerelle.',
      'help.dev_snr': 'Rapport signal/bruit moyen. Au-dessus de +5 dB = bon. De 0 \u00e0 +5 = acceptable. En dessous de 0 dB, le signal est proche du bruit \u2014 perte de paquets probable.',
      'help.dev_gateways': 'Nombre de passerelles diff\u00e9rentes ayant re\u00e7u des paquets de cet appareil. Plusieurs passerelles = meilleure redondance et fiabilit\u00e9 par diversit\u00e9 spatiale.',
      'help.dev_rssi_chart': 'Valeur RSSI de chaque uplink individuel dans le temps. Surveillez les tendances : une d\u00e9gradation progressive peut indiquer des probl\u00e8mes de batterie ou des changements environnementaux.',
      'help.dev_snr_chart': 'Valeur SNR de chaque uplink individuel dans le temps. Corr\u00e9l\u00e9 au SF \u2014 un SF \u00e9lev\u00e9 tol\u00e8re un SNR plus bas mais utilise plus d\'airtime.',
      'help.dev_last_frame': 'Payload brut du dernier uplink. Utile pour d\u00e9bugger les probl\u00e8mes de codec ou v\u00e9rifier que l\'appareil envoie les donn\u00e9es attendues.',
      'help.dev_sf': 'R\u00e9partition des SF utilis\u00e9s par cet appareil. Id\u00e9alement la majorit\u00e9 en SF bas (7-8). Une forte utilisation de SF \u00e9lev\u00e9s signifie que l\'ADR compense un signal faible.',
      'help.dev_channels': 'Canaux de fr\u00e9quence utilis\u00e9s par cet appareil. Les appareils LoRaWAN doivent alterner sur tous les canaux. Une r\u00e9partition in\u00e9gale peut indiquer un probl\u00e8me de plan de canaux.',
      'help.dev_gateway_dist': 'Quelles passerelles ont re\u00e7u les paquets de cet appareil et combien. Permet d\'identifier la passerelle principale et d\'\u00e9valuer la couverture multi-passerelle.',
      'help.dev_fcnt': 'Progression du compteur de trames dans le temps. Devrait former un escalier r\u00e9gulier. Un reset \u00e0 0 indique un rejoin. Des sections plates = aucun paquet re\u00e7u.',
      'help.dev_loss_chart': 'Taux de perte de paquets sur des fen\u00eatres de temps. Les pics peuvent corr\u00e9ler avec des interf\u00e9rences, la m\u00e9t\u00e9o, ou des obstructions temporaires.',
      'help.dev_interval_chart': 'Distribution des intervalles entre uplinks cons\u00e9cutifs. Un pic serr\u00e9 \u00e0 l\'intervalle attendu = fonctionnement stable. Une distribution large sugg\u00e8re des retransmissions.',
      'help.dev_recent_packets': 'Paquets bruts les plus r\u00e9cents avec qualit\u00e9 du signal, timing et d\u00e9tails du payload. Utile pour la surveillance en temps r\u00e9el et le d\u00e9pannage.',

      // ---- Live ----
      'live.title': 'Flux temps r\u00e9el - LoRaWAN Analyzer',
      'live.packets': 'paquets',
      'live.filter_packets': 'Filtrer les paquets...',
      'live.waiting': 'En attente de paquets...',

      // ---- Packet Feed ----
      'feed.time': 'Heure',
      'feed.type': 'Type',
      'feed.operator': 'Op\u00e9rateur',
      'feed.addr': 'Adresse',
      'feed.dev_eui': 'DevEUI',
      'feed.fcnt': 'FCnt / JoinEUI / DLID',
      'feed.fport': 'FPort',
      'feed.dr': 'DR',
      'feed.freq': 'Fr\u00e9q',
      'feed.rssi': 'RSSI',
      'feed.snr': 'SNR',
      'feed.size': 'Taille',
      'feed.airtime': 'Airtime',
      'feed.gateway': 'Passerelle',
      'feed.uplinks': 'Uplinks',
      'feed.join_requests': 'Requ\u00eates Join',
      'feed.downlinks': 'Downlinks',
      'feed.tx_ack': 'Acquittements TX',
      'feed.uplink': 'Uplink',
      'feed.uplink_confirmed': 'Uplink confirm\u00e9',
      'feed.uplink_unconfirmed': 'Uplink non confirm\u00e9',
      'feed.downlink': 'Downlink',
      'feed.downlink_confirmed': 'Downlink confirm\u00e9',
      'feed.downlink_unconfirmed': 'Downlink non confirm\u00e9',
      'feed.join': 'Join',
      'feed.ack': 'Ack',
      'feed.no_devices_found': 'Aucun appareil trouv\u00e9',

      // ---- Device ----
      'device.title': 'D\u00e9tails de l\'appareil - LoRaWAN Analyzer',
      'device.back': '\u2190 Retour',
      'device.deveui': 'DevEUI',
      'device.app': 'App',
      'device.profile': 'Profil',
      'device.first_seen': 'Premi\u00e8re vue',
      'device.last_seen': 'Derni\u00e8re vue',
      'device.loading': 'Chargement des donn\u00e9es...',
      'device.not_found': 'Appareil non trouv\u00e9',
      'device.no_addr': 'Aucune adresse sp\u00e9cifi\u00e9e',
      'device.failed_load': '\u00c9chec du chargement',
      'device.my_device': '(Mon appareil)',
      'device.packets': 'Paquets',
      'device.missed': 'Manqu\u00e9s',
      'device.packet_loss': 'Perte paquets',
      'device.total_airtime': 'Temps d\'antenne',
      'device.duty_cycle': 'Cycle d\'utilisation',
      'device.avg_interval': 'Intervalle moy.',
      'device.avg_rssi': 'RSSI moy.',
      'device.avg_snr': 'SNR moy.',
      'device.gateways': 'Passerelles',
      'device.last_frame': 'Derni\u00e8re trame',
      'device.fcnt': 'FCnt',
      'device.fport': 'FPort',
      'device.received': 'Re\u00e7u',
      'device.raw_hex': 'Brut (hex)',
      'device.decoded': 'D\u00e9cod\u00e9',
      'device.rssi_chart': 'RSSI (par paquet)',
      'device.snr_chart': 'SNR (par paquet)',
      'device.spreading_factor': 'Facteur d\'\u00e9talement',
      'device.channel_usage': 'Utilisation canaux',
      'device.gateway_distribution': 'R\u00e9partition passerelles',
      'device.fcnt_timeline': 'Chronologie compteur trames',
      'device.packet_loss_chart': 'Perte de paquets',
      'device.interval_chart': 'Distribution des intervalles',
      'device.recent_packets': 'Paquets r\u00e9cents',
      'device.frame_counter': 'Compteur trames',
      'device.missed_label': 'Manqu\u00e9s',

      // ---- Device modal (dashboard) ----
      'modal.operator': 'Op\u00e9rateur',
      'modal.packets': 'Paquets',
      'modal.total_airtime': 'Temps d\'antenne',
      'modal.avg_interval': 'Intervalle moy.',
      'modal.first_seen': 'Premi\u00e8re vue',
      'modal.last_seen': 'Derni\u00e8re vue',
      'modal.signal_quality': 'Qualit\u00e9 du signal',
      'modal.avg_rssi': 'RSSI moy.',
      'modal.avg_snr': 'SNR moy.',
      'modal.spreading_factors': 'Facteurs d\'\u00e9talement',
      'modal.frequencies': 'Fr\u00e9quences',
      'modal.signal_per_uplink': 'Signal (par uplink)',
      'modal.uplinks_over_time': 'Uplinks dans le temps',
      'modal.recent_activity': 'Activit\u00e9 r\u00e9cente',
      'modal.no_recent_activity': 'Aucune activit\u00e9 r\u00e9cente',
      'modal.no_data_found': 'Aucune donn\u00e9e trouv\u00e9e',
      'modal.failed_load': '\u00c9chec du chargement',

      // ---- Settings ----
      'settings.title': 'Param\u00e8tres - LoRaWAN Analyzer',
      'settings.mqtt_broker': 'Broker MQTT',
      'settings.mqtt_status_unknown': 'Inconnu',
      'settings.mqtt_connected': 'Connect\u00e9 \u00e0 {server}',
      'settings.mqtt_connecting': 'Connexion \u00e0 {server}...',
      'settings.mqtt_not_configured': 'Non configur\u00e9',
      'settings.server_url': 'URL du serveur',
      'settings.topic': 'Topic',
      'settings.username': 'Nom d\'utilisateur',
      'settings.password': 'Mot de passe',
      'settings.format': 'Format',
      'settings.app_topic': 'Topic application',
      'settings.save_connect': 'Enregistrer & Connecter',
      'settings.server_url_required': 'L\'URL du serveur est requise',
      'settings.saved_connecting': 'Enregistr\u00e9 ! Connexion...',
      'settings.chirpstack_api': 'API ChirpStack',
      'settings.chirpstack_optional': 'Optionnel - enrichit les noms de passerelles',
      'settings.api_key': 'Cl\u00e9 API',
      'settings.url_apikey_required': 'URL et cl\u00e9 API requises',
      'settings.saved_sync': 'Enregistr\u00e9 ! Synchronisation lanc\u00e9e.',
      'settings.custom_operators': 'Op\u00e9rateurs personnalis\u00e9s',
      'settings.no_operators': 'Aucun op\u00e9rateur personnalis\u00e9',
      'settings.prefix_hex': 'Pr\u00e9fixe (hex)',
      'settings.name': 'Nom',
      'settings.priority': 'Priorit\u00e9',
      'settings.hide_rules': 'R\u00e8gles de masquage',
      'settings.no_hide_rules': 'Aucune r\u00e8gle de masquage',
      'settings.rule_type': 'Type',
      'settings.prefix': 'Pr\u00e9fixe',
      'settings.description': 'Description',

      // ---- Search bar ----
      'search.placeholder': 'Rechercher des appareils...',
      'search.no_results': 'Aucun appareil trouv\u00e9',
      'search.toggle_favorite': 'Basculer favori',

      // ---- Management - Connection ----
      'mgmt.connection_title': 'Connexion ChirpStack',
      'mgmt.disconnected': 'D\u00e9connect\u00e9',
      'mgmt.connected': 'Connect\u00e9',
      'mgmt.saved_servers': 'Serveurs enregistr\u00e9s',
      'mgmt.select_server': '-- S\u00e9lectionner un serveur --',
      'mgmt.server_actions': 'Actions serveur',
      'mgmt.chirpstack_url': 'URL ChirpStack',
      'mgmt.api_token': 'Jeton API',
      'mgmt.connect': 'Connecter',
      'mgmt.url_required': 'URL ChirpStack requise',
      'mgmt.token_required': 'Jeton API requis',
      'mgmt.url_invalid': 'L\'URL doit commencer par http:// ou https://',
      'mgmt.connecting': 'Connexion...',
      'mgmt.connected_admin': 'Connect\u00e9 (cl\u00e9 Admin)',
      'mgmt.connected_admin_no_tenants': 'Connect\u00e9 mais aucun tenant trouv\u00e9',
      'mgmt.connected_tenant': 'Connect\u00e9 (cl\u00e9 Tenant) \u2014 saisir l\'ID du tenant',
      'mgmt.failed': '\u00c9chec : {message}',
      'mgmt.key_type': 'Type de cl\u00e9',
      'mgmt.admin': 'Admin',
      'mgmt.admin_no_tenants': 'Admin (aucun tenant)',
      'mgmt.tenant': 'Tenant',
      'mgmt.tenant_id': 'ID Tenant (cl\u00e9 tenant)',
      'mgmt.select_tenant': 'Tenant',
      'mgmt.application': 'Application',
      'mgmt.device_profile': 'Profil d\'appareil',
      'mgmt.all_applications': '-- Toutes les applications --',
      'mgmt.all_profiles': '-- Tous les profils --',
      'mgmt.total_devices': 'Total appareils',
      'mgmt.active_24h': 'Actifs (24h)',
      'mgmt.inactive': 'Inactifs',
      'mgmt.never_seen': 'Jamais vus',
      'mgmt.save_server': 'Enregistrer le serveur',
      'mgmt.server_name': 'Nom du serveur',
      'mgmt.server_saved': 'Serveur enregistr\u00e9',
      'mgmt.delete_server': 'Supprimer le serveur',
      'mgmt.delete_server_confirm': 'Supprimer le serveur \u00ab {name} \u00bb ?',
      'mgmt.server_deleted': 'Serveur supprim\u00e9',
      'mgmt.select_to_delete': 'S\u00e9lectionner un serveur \u00e0 supprimer',
      'mgmt.url_required_save': 'URL requise pour enregistrer',
      'mgmt.loading_select': '-- Chargement... --',
      'mgmt.error_select': '-- Erreur --',

      // ---- Management - Import ----
      'import.title': 'Import d\'appareils',
      'import.profiles': 'Profils d\'import',
      'import.profile_name': 'Nom du profil',
      'import.required_tags': 'Tags requis (s\u00e9par\u00e9s par virgule)',
      'import.delete_profile': 'Supprimer le profil',
      'import.delete_profile_confirm': 'Supprimer ce profil d\'import ?',
      'import.target_app': 'Application cible',
      'import.target_dp': 'Profil d\'appareil cible',
      'import.import_profile': 'Profil d\'import (optionnel)',
      'import.download_template': 'T\u00e9l\u00e9charger le mod\u00e8le',
      'import.csv_template': 'Mod\u00e8le CSV',
      'import.drop_zone': 'D\u00e9posez un fichier CSV/XLSX ici ou cliquez pour s\u00e9lectionner',
      'import.parse_result': 'R\u00e9sultat de l\'analyse',
      'import.separator': 'S\u00e9parateur :',
      'import.rows': 'Lignes :',
      'import.columns': 'Colonnes :',
      'import.deveui': 'DevEUI',
      'import.appkey': 'AppKey',
      'import.name': 'Nom',
      'import.description': 'Description',
      'import.device_profile_id': 'ID profil d\'appareil',
      'import.required_tags_mapping': 'Mapping des tags requis',
      'import.tag_label': 'Tag : {tag}',
      'import.validate': 'Valider',
      'import.validation_result': 'R\u00e9sultat de la validation',
      'import.valid': 'Valides',
      'import.errors': 'Erreurs',
      'import.duplicates': 'Doublons',
      'import.warnings': 'Avertissements',
      'import.duplicate_action': 'Action doublons',
      'import.skip': 'Ignorer',
      'import.overwrite': '\u00c9craser',
      'import.import_btn': 'Importer',
      'import.import_result': 'R\u00e9sultat de l\'import',
      'import.created': 'Cr\u00e9\u00e9s',
      'import.skipped': 'Ignor\u00e9s',
      'import.total': 'Total',
      'import.undo': 'Annuler l\'import',
      'import.undo_confirm': 'Supprimer les {count} appareils cr\u00e9\u00e9s pendant cet import ?',
      'import.undo_title': 'Annuler l\'import',
      'import.undoing': 'Annulation...',
      'import.devices_deleted': '{count} appareils supprim\u00e9s',
      'import.devices_deleted_errors': '{count} appareils supprim\u00e9s, {errors} erreurs',
      'import.no_devices_undo': 'Aucun appareil \u00e0 annuler',
      'import.validating': 'Validation...',
      'import.validation_complete': 'Validation termin\u00e9e',
      'import.importing': 'Import en cours...',
      'import.import_complete': 'Import termin\u00e9',
      'import.connection_required': 'Connexion ChirpStack requise',
      'import.select_app': 'S\u00e9lectionnez une application cible',
      'import.deveui_required': 'Le mapping DevEUI est requis',
      'import.select_dp': 'S\u00e9lectionnez un profil d\'appareil cible',
      'import.file_read_error': 'Erreur de lecture du fichier',
      'import.row_error': 'Ligne {row} : {field} \u2014 {message}',
      'import.dup_info': '{deveui} \u2014 existe : \u00ab {existing} \u00bb, CSV : \u00ab {csv} \u00bb',

      // ---- Management - Export & Bulk ----
      'bulk.title': 'Export & Op\u00e9rations en masse',
      'bulk.application': 'Application',
      'bulk.tab_export': 'Export',
      'bulk.tab_delete': 'Supprimer',
      'bulk.tab_migrate': 'Migrer',
      'bulk.tab_change_dp': 'Changer profil',
      'bulk.tab_update_tags': 'Mettre \u00e0 jour tags',
      'bulk.tab_search': 'Recherche',

      // Export
      'export.load_devices': 'Charger les appareils',
      'export.devices_loaded': '{count} appareils charg\u00e9s',
      'export.filter_dp': 'Profil d\'appareil',
      'export.filter_activity': 'Activit\u00e9',
      'export.active_24h': 'Actifs (24h)',
      'export.inactive': 'Inactifs',
      'export.never_seen_opt': 'Jamais vus',
      'export.filter_tag': 'Tag (cl\u00e9=valeur)',
      'export.format': 'Format',
      'export.include_keys': 'Inclure les cl\u00e9s (AppKey)',
      'export.preview': 'Aper\u00e7u (5 premiers)',
      'export.preview_deveui': 'DevEUI',
      'export.preview_name': 'Nom',
      'export.preview_dp': 'Profil d\'appareil',
      'export.preview_last_seen': 'Derni\u00e8re vue',
      'export.downloading': 'T\u00e9l\u00e9chargement...',
      'export.downloaded': 'T\u00e9l\u00e9charg\u00e9',
      'export.select_app': 'S\u00e9lectionnez une application',

      // Delete
      'delete.load_devices': 'Charger les appareils',
      'delete.search_placeholder': 'Rechercher (DevEUI, nom...)',
      'delete.select_all': 'Tout s\u00e9lectionner',
      'delete.deselect_all': 'Tout d\u00e9s\u00e9lectionner',
      'delete.selected': '{count} s\u00e9lectionn\u00e9(s)',
      'delete.delete_btn': 'Supprimer',
      'delete.select_one': 'S\u00e9lectionnez au moins un appareil',
      'delete.bulk_title': 'Suppression en masse',
      'delete.bulk_confirm': 'Vous allez supprimer {count} appareil(s). Cette action est irr\u00e9versible.',
      'delete.type_confirm': 'Tapez {count} pour confirmer',
      'delete.deleting': 'Suppression...',
      'delete.cancelled': 'Suppression annul\u00e9e',
      'delete.deleted': 'Supprim\u00e9s',

      // Migrate
      'migrate.load_devices': 'Charger les appareils',
      'migrate.search_placeholder': 'Rechercher...',
      'migrate.select_all': 'Tout s\u00e9lectionner',
      'migrate.deselect_all': 'Tout d\u00e9s\u00e9lectionner',
      'migrate.selected': '{count} s\u00e9lectionn\u00e9(s)',
      'migrate.dest_app': 'Application de destination',
      'migrate.migrate_btn': 'Migrer',
      'migrate.select_one': 'S\u00e9lectionnez au moins un appareil',
      'migrate.select_source': 'S\u00e9lectionnez une application source',
      'migrate.select_dest': 'S\u00e9lectionnez une application de destination',
      'migrate.title': 'Migration d\'appareils',
      'migrate.confirm': 'Migrer {count} appareil(s) vers l\'application s\u00e9lectionn\u00e9e ?',
      'migrate.migrating': 'Migration...',
      'migrate.migrated': 'Migr\u00e9s',

      // Change DP
      'dp.load_devices': 'Charger les appareils',
      'dp.search_placeholder': 'Rechercher...',
      'dp.select_all': 'Tout s\u00e9lectionner',
      'dp.deselect_all': 'Tout d\u00e9s\u00e9lectionner',
      'dp.selected': '{count} s\u00e9lectionn\u00e9(s)',
      'dp.new_profile': 'Nouveau profil d\'appareil',
      'dp.apply_btn': 'Appliquer',
      'dp.select_one': 'S\u00e9lectionnez au moins un appareil',
      'dp.select_profile': 'S\u00e9lectionnez un profil d\'appareil',
      'dp.title': 'Changer le profil d\'appareil',
      'dp.confirm': 'Changer le profil de {count} appareil(s) ?',
      'dp.updating': 'Mise \u00e0 jour...',
      'dp.updated': 'Mis \u00e0 jour',

      // Update Tags
      'tags.description': 'Envoyez un fichier CSV/XLSX avec une colonne <strong>dev_eui</strong> et des colonnes de tags.',
      'tags.merge': 'Fusionner (ajouter/modifier)',
      'tags.replace': 'Remplacer (remplacer tout)',
      'tags.drop_zone': 'D\u00e9posez un fichier CSV/XLSX ou cliquez pour s\u00e9lectionner',
      'tags.preview': 'Aper\u00e7u',
      'tags.run_update': 'Lancer la mise \u00e0 jour',
      'tags.select_file': 'S\u00e9lectionnez un fichier',
      'tags.updating': 'Mise \u00e0 jour...',
      'tags.updated': 'Mis \u00e0 jour',

      // Search
      'cross_search.placeholder': 'DevEUI (complet ou partiel)',
      'cross_search.search_btn': 'Rechercher',
      'cross_search.enter_deveui': 'Saisissez un DevEUI',
      'cross_search.connection_required': 'Connexion et tenant requis',
      'cross_search.searching': 'Recherche...',
      'cross_search.no_results': 'Aucun r\u00e9sultat',
      'cross_search.results': '{count} r\u00e9sultat(s)',
      'cross_search.col_deveui': 'DevEUI',
      'cross_search.col_name': 'Nom',
      'cross_search.col_application': 'Application',
      'cross_search.col_profile': 'Profil',
      'cross_search.col_tags': 'Tags',
      'cross_search.col_last_seen': 'Derni\u00e8re vue',

      // Shared select/bulk
      'bulk.select_app_required': 'S\u00e9lectionnez une application dans Export & Op\u00e9rations en masse',
      'bulk.no_devices': 'Aucun appareil',
      'bulk.selected': '{count} sélectionné(s)',

      // Management tiles
      'tiles.import': 'Import',
      'tiles.import_desc': 'Importer des devices depuis un fichier CSV/XLSX',
      'tiles.export': 'Export',
      'tiles.export_desc': 'Exporter les devices en CSV ou XLSX',
      'tiles.delete': 'Supprimer en masse',
      'tiles.delete_desc': 'Sélectionner et supprimer plusieurs devices',
      'tiles.migrate': 'Migrer',
      'tiles.migrate_desc': 'Déplacer des devices vers une autre application',
      'tiles.change_dp': 'Changer profil',
      'tiles.change_dp_desc': 'Modifier le Device Profile de plusieurs devices',
      'tiles.update_tags': 'Mettre à jour tags',
      'tiles.update_tags_desc': 'Modifier les tags via CSV/XLSX',
      'tiles.search': 'Recherche',
      'tiles.search_desc': 'Trouver un device par DevEUI dans toutes les applications',
      'tiles.analyze': 'Analyse',
      'tiles.analyze_desc': 'Tableau de bord et m\u00e9triques d\u00e9taill\u00e9es des devices',
      'mgmt.back_to_tools': 'Retour aux outils',

      // ---- Analyze ----
      'analyze.title': 'Analyse des devices',
      'analyze.run': 'Analyser les devices',
      'analyze.total': 'Total',
      'analyze.status_active': 'Actif (<24h)',
      'analyze.status_recent': 'R\u00e9cent (1-7j)',
      'analyze.status_inactive': 'Inactif (7-30j)',
      'analyze.status_offline': 'Hors ligne (>30j)',
      'analyze.status_never': 'Jamais vu',
      'analyze.profile_dist': 'R\u00e9partition par profil',
      'analyze.all_statuses': 'Tous les statuts',
      'analyze.all_profiles': 'Tous les profils',
      'analyze.sort_recent': 'Dernier vu (r\u00e9cent)',
      'analyze.sort_oldest': 'Dernier vu (ancien)',
      'analyze.sort_name_az': 'Nom (A-Z)',
      'analyze.sort_name_za': 'Nom (Z-A)',
      'analyze.devices_count': '{count} devices',
      'analyze.no_devices': 'Aucun device trouv\u00e9',
      'analyze.col_name': 'Nom',
      'analyze.col_profile': 'Profil',
      'analyze.col_last_seen': 'Dernier vu',
      'analyze.col_status': 'Statut',
      'analyze.col_actions': 'Actions',
      'analyze.metrics': 'M\u00e9triques',
      'analyze.export_csv': 'Exporter CSV',
      'analyze.loading': 'Chargement',
      'analyze.loading_metrics': 'Chargement des m\u00e9triques...',
      'analyze.packets_received': 'Paquets',
      'analyze.errors': 'Erreurs',
      'analyze.avg_rssi': 'RSSI moy.',
      'analyze.avg_snr': 'SNR moy.',
      'analyze.packets_chart': 'Paquets re\u00e7us',
      'analyze.period_24h': 'Derni\u00e8res 24h',
      'analyze.period_7d': '7 derniers jours',
      'analyze.period_30d': '30 derniers jours',
      'analyze.excellent': 'Excellent',
      'analyze.fair': 'Correct',
      'analyze.poor': 'Faible',
      'analyze.metrics_error': '\u00c9chec du chargement des m\u00e9triques',
      'analyze.never': 'Jamais',
      'analyze.just_now': '< 1min',
      'analyze.connection_required': 'Connexion et tenant requis',
      'analyze.select_tenant': 'S\u00e9lectionnez d\'abord un tenant',
      'analyze.no_apps': 'Aucune application trouv\u00e9e',
      'analyze.loading_apps': 'Chargement des applications...',
      'analyze.loading_devices': 'Chargement : {loaded}/{total} devices',
      'analyze.loading_profiles': 'Chargement des profils...',
      'analyze.computing_stats': 'Calcul des statistiques...',
      'analyze.error_analysis': 'Erreur d\'analyse',
      'analyze.no_devices_export': 'Aucun device \u00e0 exporter',
      'analyze.col_deveui': 'DevEUI',
      'analyze.col_tags': 'Tags',

      // Chart labels
      'chart.packets': 'Paquets',
      'chart.rssi_dbm': 'RSSI (dBm)',
      'chart.snr_db': 'SNR (dB)',
      'chart.fcnt': 'FCnt',
      'chart.gaps': 'Trous',
      'chart.missed_packets': 'Paquets manqu\u00e9s',
      'chart.count': 'Nombre',
      'chart.uplink': 'Uplink',

      // Validation stat labels
      'stat.valid': 'Valides',
      'stat.errors': 'Erreurs',
      'stat.duplicates': 'Doublons',
      'stat.warnings': 'Avertissements',
      'stat.created': 'Cr\u00e9\u00e9s',
      'stat.skipped': 'Ignor\u00e9s',
      'stat.total': 'Total',
      'stat.deleted': 'Supprim\u00e9s',
      'stat.migrated': 'Migr\u00e9s',
      'stat.updated': 'Mis \u00e0 jour',

      // Confirmation labels
      'confirm.title': 'Confirmation',
      'confirm.type_to_confirm': 'Tapez {value} pour confirmer',
    },
  };

  // ============================================================
  // ENGINE
  // ============================================================

  /**
   * Translate a key with optional parameter interpolation.
   * Fallback chain: currentLang -> 'en' -> '[key]'
   */
  function t(key, params) {
    var dict = translations[currentLang] || translations[DEFAULT_LANG];
    var str = dict[key];
    if (str === undefined) {
      str = translations[DEFAULT_LANG][key];
    }
    if (str === undefined) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[i18n] Missing key: ' + key);
      }
      return '[' + key + ']';
    }
    if (params) {
      Object.keys(params).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return str;
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (!translations[lang]) {
      console.warn('[i18n] Unsupported language: ' + lang);
      return;
    }
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* ignore */ }
    translatePage();
    updateLangButtons();
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  /**
   * Translate all elements with data-i18n attributes.
   * Supports:
   *   data-i18n="key"                 -> textContent
   *   data-i18n-placeholder="key"     -> placeholder
   *   data-i18n-title="key"           -> title
   *   data-i18n-html="key"            -> innerHTML (use sparingly)
   */
  function translatePage() {
    // textContent
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });

    // placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });

    // title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key);
    });

    // innerHTML (for keys containing HTML like <strong>)
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });

    // Update page title if data-i18n-title is on <html> or <title>
    var titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) {
      var key = titleEl.getAttribute('data-i18n');
      if (key) document.title = t(key);
    }
  }

  function updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var lang = btn.getAttribute('data-lang');
      if (lang === currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    // Read saved language
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && translations[saved]) {
        currentLang = saved;
      }
    } catch (e) { /* ignore */ }

    // Translate static page content
    translatePage();

    // Bind language toggle buttons
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-lang');
        if (lang) setLang(lang);
      });
    });
    updateLangButtons();
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.t = t;
  window.getLang = getLang;
  window.setLang = setLang;
  window.translatePage = translatePage;
})();
