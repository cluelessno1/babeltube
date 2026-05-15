'use strict';

// ─── Language list ────────────────────────────────────────────────────────────
// Common languages supported by YouTube's auto-translate feature.
const LANGUAGES = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'am', name: 'Amharic' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'eu', name: 'Basque' },
  { code: 'be', name: 'Belarusian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'my', name: 'Burmese' },
  { code: 'ca', name: 'Catalan' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
  { code: 'co', name: 'Corsican' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'et', name: 'Estonian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'gl', name: 'Galician' },
  { code: 'ka', name: 'Georgian' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'ha', name: 'Hausa' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'iw', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hmn', name: 'Hmong' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'ig', name: 'Igbo' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'jv', name: 'Javanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'km', name: 'Khmer' },
  { code: 'rw', name: 'Kinyarwanda' },
  { code: 'ko', name: 'Korean' },
  { code: 'ku', name: 'Kurdish' },
  { code: 'ky', name: 'Kyrgyz' },
  { code: 'lo', name: 'Lao' },
  { code: 'la', name: 'Latin' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mt', name: 'Maltese' },
  { code: 'mi', name: 'Maori' },
  { code: 'mr', name: 'Marathi' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'ne', name: 'Nepali' },
  { code: 'no', name: 'Norwegian' },
  { code: 'ny', name: 'Nyanja' },
  { code: 'or', name: 'Odia' },
  { code: 'ps', name: 'Pashto' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sm', name: 'Samoan' },
  { code: 'gd', name: 'Scots Gaelic' },
  { code: 'sr', name: 'Serbian' },
  { code: 'st', name: 'Sesotho' },
  { code: 'sn', name: 'Shona' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'si', name: 'Sinhala' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'so', name: 'Somali' },
  { code: 'es', name: 'Spanish' },
  { code: 'su', name: 'Sundanese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'tg', name: 'Tajik' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tt', name: 'Tatar' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'ug', name: 'Uyghur' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'cy', name: 'Welsh' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'zu', name: 'Zulu' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showSaveStatus() {
  const el = document.getElementById('save-status');
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

function save(patch) {
  chrome.storage.sync.set(patch, showSaveStatus);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function populateLanguageSelect(selectedCode) {
  const select = document.getElementById('target-language');
  LANGUAGES.forEach(({ code, name }) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    if (code === selectedCode) opt.selected = true;
    select.appendChild(opt);
  });
}

function updateDismissDurationVisibility(bannerEnabled) {
  document.getElementById('row-dismiss-duration').style.opacity = bannerEnabled
    ? '1'
    : '0.4';
  document.getElementById('banner-dismiss-duration').disabled = !bannerEnabled;
}

async function init() {
  const settings = await new Promise((resolve) =>
    chrome.storage.sync.get(null, resolve)
  );

  // Language dropdown
  populateLanguageSelect(settings.targetLanguage || 'en');
  document.getElementById('target-language').addEventListener('change', (e) => {
    const code = e.target.value;
    const name = LANGUAGES.find((l) => l.code === code)?.name ?? code;
    save({ targetLanguage: code, targetLanguageName: name });
  });

  // Banner toggle
  const showBanner = settings.showBanner !== false;
  document.getElementById('show-banner').checked = showBanner;
  updateDismissDurationVisibility(showBanner);
  document.getElementById('show-banner').addEventListener('change', (e) => {
    save({ showBanner: e.target.checked });
    updateDismissDurationVisibility(e.target.checked);
  });

  // Banner dismiss duration
  const duration = String(settings.bannerDismissDuration ?? 10);
  document.getElementById('banner-dismiss-duration').value = duration;
  document.getElementById('banner-dismiss-duration').addEventListener(
    'change',
    (e) => save({ bannerDismissDuration: Number(e.target.value) })
  );

  // Subtitle toggles
  document.getElementById('enable-subtitles').checked =
    settings.enableSubtitles !== false;
  document.getElementById('enable-subtitles').addEventListener('change', (e) =>
    save({ enableSubtitles: e.target.checked })
  );

  document.getElementById('enable-auto-translate').checked =
    settings.enableAutoTranslateFallback !== false;
  document.getElementById('enable-auto-translate').addEventListener(
    'change',
    (e) => save({ enableAutoTranslateFallback: e.target.checked })
  );
}

init();
