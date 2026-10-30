import { providerLegalNotices, type ProviderLegalNotice } from '../clients/providerCompliance.ts';

export interface RenderedLegalPageProvider extends ProviderLegalNotice {}

export interface RenderedLegalPage {
  title: 'about-legal';
  providers: readonly RenderedLegalPageProvider[];
  html: string;
}

export function renderLegalPage(): RenderedLegalPage {
  const providers = providerLegalNotices();
  const html = [
    '<main data-page="/about-legal">',
    '<h1>About / Legal</h1>',
    '<section data-provider-legal-notices>',
    '<h2>Data providers</h2>',
    ...providers.map(
      (provider) =>
        `<article data-provider="${provider.provider}"><h3>${provider.name}</h3><p data-provider-attribution>${provider.attribution}</p>${provider.termsUrl ? `<a href="${provider.termsUrl}" rel="license terms">Terms</a>` : ''}${provider.licenseUrl ? `<a href="${provider.licenseUrl}" rel="license">License</a>` : ''}</article>`
    ),
    '</section>',
    '</main>'
  ].join('');

  return { title: 'about-legal', providers, html };
}
