import * as XLSX from 'xlsx';
import type { CsvParseResult } from '../types.js';

/**
 * Analyse les premieres lignes pour detecter le separateur CSV
 * Compte les occurrences de ; , et \t puis retourne le plus frequent
 */
export function detectSeparator(content: string): string {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  // Analyser au maximum les 10 premieres lignes
  const sample = lines.slice(0, 10);

  const candidates: Record<string, number> = {
    ';': 0,
    ',': 0,
    '\t': 0,
  };

  for (const line of sample) {
    for (const sep of Object.keys(candidates)) {
      candidates[sep] += line.split(sep).length - 1;
    }
  }

  // Retourner le separateur avec le plus d'occurrences
  let bestSep = ',';
  let bestCount = 0;
  for (const [sep, count] of Object.entries(candidates)) {
    if (count > bestCount) {
      bestCount = count;
      bestSep = sep;
    }
  }

  return bestSep;
}

/**
 * Mapping automatique des noms de colonnes vers les champs internes
 * Correspondance insensible a la casse
 */
export function autoMapColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Regles de mapping : variantes connues -> nom de champ interne
  const rules: Array<{ patterns: string[]; field: string }> = [
    {
      patterns: ['deveui', 'dev_eui', 'DevEUI', 'dev eui', 'device_eui'],
      field: 'dev_eui',
    },
    {
      patterns: ['appkey', 'app_key', 'AppKey', 'app key', 'application_key'],
      field: 'app_key',
    },
    {
      patterns: ['name', 'Name', 'nom', 'device_name', 'devicename'],
      field: 'name',
    },
    {
      patterns: ['description', 'Description', 'desc'],
      field: 'description',
    },
    {
      patterns: [
        'device_profile_id',
        'deviceProfileId',
        'device_profile',
        'deviceprofileid',
        'profile_id',
      ],
      field: 'device_profile_id',
    },
  ];

  for (const header of headers) {
    const headerLower = header.toLowerCase().trim();
    for (const rule of rules) {
      const matched = rule.patterns.some(
        (pattern) => pattern.toLowerCase() === headerLower
      );
      if (matched) {
        mapping[header] = rule.field;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Parse un fichier CSV ou XLSX a partir d'un Buffer
 * Detecte le type par extension, extrait colonnes, preview (5 lignes), total, mapping auto
 */
export function parseFile(buffer: Buffer, filename: string): CsvParseResult {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(buffer);
  }

  // Par defaut, traiter comme CSV
  return parseCsv(buffer);
}

/**
 * Parse un fichier Excel (XLSX/XLS) via la lib xlsx
 */
function parseExcel(buffer: Buffer): CsvParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      columns: [],
      separator: '',
      auto_mapping: {},
      preview: [],
      total_rows: 0,
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return {
      columns: [],
      separator: '',
      auto_mapping: {},
      preview: [],
      total_rows: 0,
    };
  }

  // Convertir en tableau d'objets (la premiere ligne = headers)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  // Extraire les colonnes depuis les cles de la premiere ligne
  const columns: string[] =
    rows.length > 0 ? Object.keys(rows[0]) : [];

  // Preview : 5 premieres lignes, toutes les valeurs en string
  const preview = rows.slice(0, 5).map((row) => {
    const record: Record<string, string> = {};
    for (const col of columns) {
      record[col] = String(row[col] ?? '');
    }
    return record;
  });

  const autoMapping = autoMapColumns(columns);

  return {
    columns,
    separator: '',
    auto_mapping: autoMapping,
    preview,
    total_rows: rows.length,
  };
}

/**
 * Parse un fichier CSV a partir d'un Buffer
 */
function parseCsv(buffer: Buffer): CsvParseResult {
  const content = buffer.toString('utf-8');
  const separator = detectSeparator(content);

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      columns: [],
      separator,
      auto_mapping: {},
      preview: [],
      total_rows: 0,
    };
  }

  // Premiere ligne = en-tetes
  const columns = lines[0].split(separator).map((col) => col.trim());

  // Lignes de donnees (sans l'en-tete)
  const dataLines = lines.slice(1);

  // Preview : 5 premieres lignes de donnees
  const preview = dataLines.slice(0, 5).map((line) => {
    const values = line.split(separator);
    const record: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) {
      record[columns[i]] = (values[i] ?? '').trim();
    }
    return record;
  });

  const autoMapping = autoMapColumns(columns);

  return {
    columns,
    separator,
    auto_mapping: autoMapping,
    preview,
    total_rows: dataLines.length,
  };
}
