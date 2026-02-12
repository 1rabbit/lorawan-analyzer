# Tests end-to-end — ChirpStack Toolkit

> Checklist de validation manuelle contre un ChirpStack réel.
> Cocher chaque test après validation. Les tests sont ordonnés par dépendance.

## Prérequis

- [ ] `docker compose up -d` ou `npm run dev` lancé
- [ ] Accès http://localhost:15337 → dashboard OK
- [ ] Accès http://localhost:15337/management.html → page management OK
- [ ] Un serveur ChirpStack accessible avec un token API valide
- [ ] Au moins un tenant, une application, un device profile configurés dans ChirpStack
- [ ] Un fichier CSV de test (voir section "Fichiers de test" en bas)

---

## 1. Connexion ChirpStack

Ouvrir http://localhost:15337/management.html

- [ ] **1.1** Saisir URL + Token → cliquer "Tester la connexion" → pastille verte, type de clé affiché
- [ ] **1.2** Clé Admin : dropdown Tenant se remplit, sélection → Applications + Device Profiles se chargent
- [ ] **1.3** Clé Tenant : champ "Tenant ID" manuel apparaît, saisir l'ID → Apps + DP se chargent
- [ ] **1.4** Mini dashboard : compteurs Total / Actifs / Inactifs / Jamais vus cohérents
- [ ] **1.5** Sauvegarder serveur → nom demandé → apparaît dans le dropdown "Serveurs sauvegardés"
- [ ] **1.6** Charger un serveur sauvegardé → URL pré-remplie
- [ ] **1.7** Supprimer un serveur sauvegardé → disparaît du dropdown
- [ ] **1.8** Token invalide → message "Authentification échouée" clair
- [ ] **1.9** URL invalide/offline → message timeout/erreur clair

---

## 2. Import CSV

Prérequis : connexion établie, application + device profile sélectionnés.

### 2.1 Parsing

- [ ] **2.1.1** Drag-drop fichier CSV (séparateur `;`) → séparateur détecté `;`, colonnes affichées, preview 5 lignes
- [ ] **2.1.2** Upload CSV (séparateur `,`) → séparateur détecté `,`
- [ ] **2.1.3** Upload XLSX → colonnes détectées, preview affichée
- [ ] **2.1.4** Auto-mapping : colonnes `DevEUI`, `AppKey`, `Name` → pré-sélectionnées dans les dropdowns

### 2.2 Validation

- [ ] **2.2.1** Cliquer "Valider" → stats Valides / Erreurs / Doublons / Warnings affichées
- [ ] **2.2.2** DevEUI invalide (pas 16 hex) → erreur affichée avec numéro de ligne
- [ ] **2.2.3** AppKey invalide (pas 32 hex) → erreur affichée
- [ ] **2.2.4** Device existant dans ChirpStack → compteur Doublons > 0, détail affiché

### 2.3 Import

- [ ] **2.3.1** Cliquer "Importer" (sans doublons) → X devices créés, vérifier dans ChirpStack UI
- [ ] **2.3.2** Import avec doublons + action "Ignorer" → doublons ignorés, nouveaux créés
- [ ] **2.3.3** Import avec doublons + action "Écraser" → devices existants remplacés
- [ ] **2.3.4** Devices créés ont les bons tags (vérifier dans ChirpStack)
- [ ] **2.3.5** Devices créés ont la bonne AppKey (vérifier via ChirpStack API ou UI)

### 2.4 Undo

- [ ] **2.4.1** Après import, cliquer "Annuler l'import" → confirmation → devices supprimés de ChirpStack
- [ ] **2.4.2** Vérifier dans ChirpStack UI que les devices n'existent plus

### 2.5 Profils d'import

- [ ] **2.5.1** Créer un profil avec tags obligatoires (ex: `site`, `building`)
- [ ] **2.5.2** Sélectionner le profil → mapping des tags obligatoires apparaît
- [ ] **2.5.3** Import avec profil → tags requis correctement appliqués aux devices
- [ ] **2.5.4** Supprimer le profil → disparaît de la liste

### 2.6 Template CSV

- [ ] **2.6.1** Cliquer "Template CSV" sans profil → headers: `dev_eui;app_key;name;description;device_profile_id`
- [ ] **2.6.2** Cliquer "Template CSV" avec profil sélectionné → headers incluent les tags du profil

---

## 3. Export

Onglet "Export" dans la section "Export & Opérations en masse".

- [ ] **3.1** Cliquer "Charger les devices" → compteur affiché, aperçu 5 lignes
- [ ] **3.2** Télécharger CSV → fichier `.csv` avec tous les devices, séparateur `;`
- [ ] **3.3** Télécharger XLSX → fichier `.xlsx` lisible dans Excel
- [ ] **3.4** Cocher "Inclure les clés" → colonne `app_key` présente dans le fichier
- [ ] **3.5** Filtre Device Profile → seuls les devices du profil sélectionné sont exportés
- [ ] **3.6** Filtre Activité "Actifs" → seuls les devices vus dans les 24h
- [ ] **3.7** Filtre Tag `site=paris` → seuls les devices avec ce tag
- [ ] **3.8** Re-import du CSV exporté → fonctionne sans modification (round-trip)

---

## 4. Suppression en masse

Onglet "Suppression".

- [ ] **4.1** Charger les devices → liste avec checkboxes
- [ ] **4.2** Recherche par DevEUI ou nom → filtre la liste
- [ ] **4.3** "Tout sélectionner" / "Tout désélectionner" → compteur mis à jour
- [ ] **4.4** Sélectionner 2-3 devices → cliquer "Supprimer" → saisir le nombre → confirmation
- [ ] **4.5** Résultat : X supprimés, vérifier dans ChirpStack UI
- [ ] **4.6** Confirmation incorrecte (mauvais nombre) → suppression annulée

---

## 5. Migration

Onglet "Migration". Prérequis : au moins 2 applications dans le tenant.

- [ ] **5.1** Charger les devices → liste affichée
- [ ] **5.2** Dropdown "App destination" → toutes les apps sauf la courante
- [ ] **5.3** Sélectionner devices + app destination → cliquer "Migrer" → confirmation
- [ ] **5.4** Résultat : X migrés, vérifier que les devices sont dans la nouvelle app
- [ ] **5.5** Vérifier que les clés (AppKey) ont été conservées après migration

---

## 6. Changement Device Profile

Onglet "Chg. Profil".

- [ ] **6.1** Charger les devices → liste avec profil actuel affiché
- [ ] **6.2** Sélectionner des devices + nouveau Device Profile → "Appliquer"
- [ ] **6.3** Résultat : X modifiés, vérifier dans ChirpStack UI

---

## 7. Mise à jour Tags

Onglet "MAJ Tags".

- [ ] **7.1** Upload CSV avec colonnes `dev_eui;site;building` → aperçu affiché
- [ ] **7.2** Mode "Merge" → tags ajoutés/modifiés, tags existants conservés
- [ ] **7.3** Mode "Replace" → tous les tags remplacés par ceux du fichier
- [ ] **7.4** Résultat : X mis à jour, vérifier dans ChirpStack UI

---

## 8. Recherche cross-app

Onglet "Recherche".

- [ ] **8.1** Saisir un DevEUI complet → résultat trouvé avec app, profil, dernier vu
- [ ] **8.2** Saisir un DevEUI partiel → résultats correspondants
- [ ] **8.3** DevEUI inexistant → "Aucun résultat trouvé"

---

## 9. Proxy multi-serveur

- [ ] **9.1** Connexion au serveur ChirpStack #1 → fonctionne
- [ ] **9.2** Changer l'URL pour un serveur #2 → tester connexion → fonctionne
- [ ] **9.3** Les deux serveurs peuvent être sauvegardés et basculés

---

## 10. Gestion des erreurs

- [ ] **10.1** Token expiré/invalide → message "Authentification échouée" (pas de crash)
- [ ] **10.2** Token avec permissions insuffisantes (403) → message "Accès refusé"
- [ ] **10.3** ChirpStack offline → message "Serveur indisponible" ou timeout
- [ ] **10.4** Upload fichier > 10 Mo → rejeté avec message d'erreur
- [ ] **10.5** Upload fichier non CSV/XLSX → erreur de parsing claire

---

## 11. Docker (quand Docker disponible)

- [ ] **11.1** `docker compose build` → succès sans erreur
- [ ] **11.2** `docker compose up -d` → tous les services healthy
- [ ] **11.3** http://localhost:15337 → dashboard accessible
- [ ] **11.4** http://localhost:15337/management.html → page management accessible
- [ ] **11.5** Proxy fonctionne depuis le container vers un ChirpStack externe

---

## Fichiers de test

### test-import.csv

Créer un fichier `test-import.csv` avec ce contenu (adapter les DevEUI pour éviter les conflits) :

```csv
dev_eui;app_key;name;description;site;building
AABBCCDD00000001;00112233445566778899AABBCCDDEEFF;Test Device 1;Premier device de test;Paris;Batiment A
AABBCCDD00000002;00112233445566778899AABBCCDDEEF0;Test Device 2;Deuxieme device;Paris;Batiment B
AABBCCDD00000003;00112233445566778899AABBCCDDEEF1;Test Device 3;Troisieme device;Lyon;Batiment C
AABBCCDD00000004;INVALIDKEY;Test Device 4;AppKey invalide pour test erreur;Paris;Batiment A
AABBCCDD0000000X;;Test Device 5;DevEUI invalide pour test erreur;Paris;Batiment A
```

> Lignes 4 et 5 contiennent des erreurs volontaires pour tester la validation.

### test-tags.csv

Pour tester la mise à jour de tags :

```csv
dev_eui;site;floor;room
AABBCCDD00000001;Marseille;3;301
AABBCCDD00000002;Marseille;2;205
AABBCCDD00000003;Lyon;1;102
```

---

*Dernière mise à jour : 2026-02-10*
