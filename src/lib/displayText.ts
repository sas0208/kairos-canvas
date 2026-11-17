const COMMON_REPLACEMENTS: Array<[RegExp, string]> = [
  [/perch\uFFFD/gi, "perche'"],
  [/pi\uFFFD/gi, 'piu'],
  [/attivit\uFFFD/gi, 'attivita'],
  [/modalit\uFFFD/gi, 'modalita'],
  [/qualit\uFFFD/gi, 'qualita'],
  [/priorit\uFFFD/gi, 'priorita'],
  [/luned\uFFFD/gi, 'lunedi'],
  [/marted\uFFFD/gi, 'martedi'],
  [/mercoled\uFFFD/gi, 'mercoledi'],
  [/gioved\uFFFD/gi, 'giovedi'],
  [/venerd\uFFFD/gi, 'venerdi'],
];

export function cleanDisplayText(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  let text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, ' - ')
    .replace(/\u2026/g, '...');

  for (const [pattern, replacement] of COMMON_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\uFFFD/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return text || fallback;
}

export function clipDisplayText(value: unknown, maxLength: number, fallback = ''): string {
  const text = cleanDisplayText(value, fallback);
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}
