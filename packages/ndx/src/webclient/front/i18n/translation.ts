import type { NDXWebClientLocale } from "ndx/webclient/common";

export type Translation = Record<string, string>;

const translationCache = new Map<NDXWebClientLocale, Promise<Translation>>();

export function loadTranslation(locale: NDXWebClientLocale) {
  const cached = translationCache.get(locale);
  if (cached) {
    return cached;
  }

  const promise = fetch(`/assets/i18n/${locale}.json`, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to load translation for ${locale}: ${response.status}`);
    }
    return (await response.json()) as Translation;
  });

  translationCache.set(locale, promise);
  return promise;
}
