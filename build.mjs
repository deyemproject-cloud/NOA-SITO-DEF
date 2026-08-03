#!/usr/bin/env node
/* ============================================================
   NOA — build statico, zero dipendenze.

     node build.mjs

   Legge  partials/{head,header,footer}.html  +  src/*.html
   Scrive gli HTML finali nella root del repo (quelli che GitHub
   Pages serve). L'output è HTML normale, ispezionabile nel diff.

   Ogni file in src/ inizia con un blocco META (JSON) che contiene
   title, description, dati schema.org, FAQ e listino della pagina.
   Da quell'unico blocco si generano SIA l'HTML visibile SIA il
   JSON-LD: così i dati strutturati non possono divergere da ciò
   che l'utente legge (requisito di Google).
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://www.noapavia.it';
const TODAY = new Date().toISOString().slice(0, 10);

/* ---------- Dati dell'attività (unica fonte per NAP + schema) ---------- */
const BIZ = {
  name: 'NOA Beauty & Wellness',
  legalName: 'NOA Beauty & Wellness',
  phone: '+39 347 566 4504',
  phoneRaw: '+393475664504',
  street: 'Via San Pietro in Verzolo 15',
  city: 'Pavia',
  postal: '27100',
  region: 'PV',
  country: 'IT',
  instagram: 'https://www.instagram.com/noa.pavia/',
  // Recensioni Treatwell, già visibili in home (requisito per aggregateRating)
  rating: { value: '4.9', count: '32' },
  // TODO Andrea: prendere lat/lng esatte da Google Maps (pin del GBP) e
  // incollarle qui — finché sono null il blocco `geo` viene omesso.
  geo: null,
};

/* Comuni serviti — usati in areaServed e nel footer */
const COMUNI = [
  'Pavia', 'San Martino Siccomario', 'Travacò Siccomario', 'Cava Manara',
  'Borgarello', 'Certosa di Pavia', 'San Genesio ed Uniti', 'Valle Salimbene',
  "Sant'Alessio con Vialone", 'Belgioioso', "Torre d'Isola",
];

const ORARI = [
  { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], open: '09:00', close: '19:00' },
  { days: ['Saturday'], open: '09:00', close: '12:30' },
];

/* ============================================================
   Schema.org
   ============================================================ */
const BIZ_ID = `${SITE}/#business`;

const postalAddress = () => ({
  '@type': 'PostalAddress',
  streetAddress: BIZ.street,
  addressLocality: BIZ.city,
  postalCode: BIZ.postal,
  addressRegion: BIZ.region,
  addressCountry: BIZ.country,
});

/** Entità completa — solo in home, dove recensioni e orari sono visibili. */
function localBusiness(catalog) {
  const node = {
    '@type': 'BeautySalon',
    '@id': BIZ_ID,
    name: BIZ.name,
    url: `${SITE}/`,
    logo: `${SITE}/assets/logo-oro-tagline.png`,
    image: `${SITE}/assets/og-image.jpg`,
    description:
      'Centro estetico e benessere a Pavia: massaggi professionali, epilazione a cera e ' +
      'luce pulsata, trattamenti viso e corpo ad alta efficacia, nail spa e sauna.',
    telephone: BIZ.phoneRaw,
    priceRange: '€€',
    currenciesAccepted: 'EUR',
    paymentAccepted: 'Contanti, Carta di credito, Carta di debito',
    address: postalAddress(),
    openingHoursSpecification: ORARI.map(o => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: o.days.map(d => `https://schema.org/${d}`),
      opens: o.open,
      closes: o.close,
    })),
    sameAs: [BIZ.instagram],
    areaServed: COMUNI.map(c => ({ '@type': 'City', name: c })),
    knowsLanguage: ['it', 'en'],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: BIZ.rating.value,
      reviewCount: BIZ.rating.count,
      bestRating: '5',
      worstRating: '1',
    },
  };
  if (BIZ.geo) node.geo = { '@type': 'GeoCoordinates', latitude: BIZ.geo[0], longitude: BIZ.geo[1] };
  if (catalog) node.hasOfferCatalog = catalog;
  return node;
}

/** Riferimento leggero all'attività, per le pagine servizio. */
const bizRef = () => ({
  '@type': 'BeautySalon',
  '@id': BIZ_ID,
  name: BIZ.name,
  url: `${SITE}/`,
  telephone: BIZ.phoneRaw,
  address: postalAddress(),
});

const num = p => String(p).replace(/\./g, '').replace(',', '.');

function offerFromItem(it, url) {
  const o = {
    '@type': 'Offer',
    name: it.n,
    price: num(it.price),
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock',
    url,
  };
  if (it.meta) o.description = it.meta;
  return o;
}

/** Catalogo sintetico della home: una voce per categoria, che punta alla
 *  relativa pagina servizio. Il dettaglio prezzo-per-prezzo vive sulle pagine
 *  servizio (Service.hasOfferCatalog), dove è anche visibile all'utente. */
function categoryCatalog(list) {
  return {
    '@type': 'OfferCatalog',
    name: 'Trattamenti NOA Beauty & Wellness',
    itemListElement: list.map(c => ({
      '@type': 'Offer',
      name: c.n,
      price: num(c.price),
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: SITE + c.url,
      itemOffered: { '@type': 'Service', name: c.n, url: SITE + c.url },
    })),
  };
}

/** OfferCatalog completo, dai gruppi del listino. */
function offerCatalog(groups, url, catalogName) {
  return {
    '@type': 'OfferCatalog',
    name: catalogName,
    itemListElement: groups.map(g => ({
      '@type': 'OfferCatalog',
      name: g.group,
      itemListElement: g.items.map(it => offerFromItem(it, url)),
    })),
  };
}

function breadcrumbs(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: SITE + t.url,
    })),
  };
}

function faqSchema(faq) {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) },
    })),
  };
}

/* ============================================================
   Rendering HTML
   ============================================================ */
const esc = s => String(s).replace(/&(?!(?:[a-zA-Z]+|#\d+);)/g, '&amp;').replace(/"/g, '&quot;');
const stripTags = s => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Voce di listino → markup identico a quello scritto a mano in listino.html */
function renderItem(it) {
  const badge = it.top ? '<span class="badge-top">Più richiesto</span>' : '';
  const from = it.from ? '<small>da</small>' : '';
  let html =
    `      <div class="menu-item">\n` +
    `        <div class="mi-row"><span class="mi-name">${it.n}${badge}</span>` +
    `<span class="mi-dots"></span>` +
    `<span class="mi-price">${from}€ ${it.price}</span></div>\n`;
  if (it.variants) {
    html += `        <div class="mi-variants">\n`;
    for (const v of it.variants) {
      html +=
        `          <div class="mi-row"><span class="mi-name">${v.n}</span>` +
        `<span class="mi-dots"></span><span class="mi-price">€ ${v.price}</span></div>\n`;
    }
    html += `        </div>\n`;
  }
  if (it.meta) html += `        <p class="mi-meta">${it.meta}</p>\n`;
  return html + `      </div>\n`;
}

function renderMenu(groups) {
  let html = `    <div class="menu-list reveal" data-delay="1">\n`;
  groups.forEach((g, i) => {
    if (i > 0 || g.groupNote) {
      html +=
        `      <div class="menu-subgroup">\n        <h3>${g.group}</h3>\n` +
        (g.groupNote ? `        <p>${g.groupNote}</p>\n` : '') +
        `      </div>\n`;
    }
    g.items.forEach(it => { html += renderItem(it); });
  });
  return html + `    </div>\n`;
}

function renderFaq(faq) {
  let html = `    <div class="faq-list reveal" data-delay="1">\n`;
  for (const f of faq) {
    html +=
      `      <details class="faq-item">\n` +
      `        <summary>${f.q}</summary>\n` +
      `        <div class="faq-a">${f.a}</div>\n` +
      `      </details>\n`;
  }
  return html + `    </div>\n`;
}

function renderCrumbs(trail) {
  const parts = trail.map((t, i) =>
    i === trail.length - 1
      ? `<span aria-current="page">${t.name}</span>`
      : `<a href="${t.url}">${t.name}</a>`
  );
  return `<nav class="crumbs" aria-label="Percorso">${parts.join('<span class="sep">/</span>')}</nav>`;
}

/* ============================================================
   Pipeline
   ============================================================ */
const partial = n => readFileSync(join(ROOT, 'partials', `${n}.html`), 'utf8');
const HEAD = partial('head');
const HEADER = partial('header');
const FOOTER = partial('footer');

/** Attiva le voci di menu indicate, poi rimuove gli attributi data-nav. */
function markActive(html, active = []) {
  for (const key of active) {
    html = html.replace(new RegExp(`data-nav="${key}"`, 'g'), 'class="active"');
  }
  return html.replace(/ data-nav="[^"]*"/g, '');
}

function readSrc(file) {
  const raw = readFileSync(join(ROOT, 'src', file), 'utf8');
  const m = raw.match(/^<!--META\s*([\s\S]*?)\s*META-->\s*/);
  if (!m) throw new Error(`src/${file}: blocco META mancante`);
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`src/${file}: META non è JSON valido — ${e.message}`);
  }
  return { meta, body: raw.slice(m[0].length) };
}

function buildPage(file) {
  const { meta, body: rawBody } = readSrc(file);
  const url = meta.url;                       // es. "/", "/massaggi-pavia/"
  const canonical = SITE + url;

  /* --- corpo: sostituzione dei blocchi generati --- */
  let body = rawBody;
  if (meta.menu) body = body.replace('{{MENU}}', renderMenu(meta.menu));
  if (meta.faq) body = body.replace('{{FAQ}}', renderFaq(meta.faq));
  if (meta.breadcrumb) body = body.replace('{{CRUMBS}}', renderCrumbs(meta.breadcrumb));

  /* --- JSON-LD --- */
  const graph = [];
  if (meta.schema === 'home') {
    graph.push({
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: BIZ.name,
      inLanguage: 'it-IT',
      publisher: { '@id': BIZ_ID },
    });
    graph.push(localBusiness(meta.catalog ? categoryCatalog(meta.catalog) : null));
  } else {
    graph.push(bizRef());
  }

  if (meta.service) {
    const svc = {
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: meta.service.name,
      serviceType: meta.service.type,
      description: meta.description,
      url: canonical,
      provider: { '@id': BIZ_ID },
      areaServed: COMUNI.map(c => ({ '@type': 'City', name: c })),
      audience: { '@type': 'Audience', audienceType: 'Donne e uomini' },
    };
    if (meta.menu) {
      svc.hasOfferCatalog = offerCatalog(meta.menu, canonical, meta.service.name);
    }
    graph.push(svc);
  }

  if (meta.breadcrumb && meta.breadcrumb.length > 1) graph.push(breadcrumbs(meta.breadcrumb));
  if (meta.faq) graph.push(faqSchema(meta.faq));

  const jsonld =
    `<script type="application/ld+json">\n` +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2) +
    `\n</script>`;

  /* --- head --- */
  const head = HEAD
    .replaceAll('{{TITLE}}', esc(meta.title))
    .replaceAll('{{DESCRIPTION}}', esc(meta.description))
    .replaceAll('{{CANONICAL}}', canonical)
    .replaceAll('{{SITE}}', SITE)
    .replaceAll('{{ROBOTS}}', meta.noindex
      ? 'noindex, follow'
      : 'index, follow, max-image-preview:large, max-snippet:-1')
    .replace('{{EXTRA_HEAD}}', meta.extraHead || '')
    .replace('{{JSONLD}}', jsonld);

  const header = markActive(HEADER, meta.nav || []);
  const footer = markActive(FOOTER, []);

  const html =
    `<!DOCTYPE html>\n<html lang="it">\n<head>\n${head}\n</head>\n<body>\n\n` +
    `${header}\n${body}\n${footer}\n` +
    (meta.scripts || '') +
    `</body>\n</html>\n`;

  /* --- scrittura: "/" → index.html, "/x/" → x/index.html --- */
  const out = url === '/'
    ? join(ROOT, 'index.html')
    : url.endsWith('/')
      ? join(ROOT, url.slice(1), 'index.html')
      : join(ROOT, url.slice(1));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return { url, out, priority: meta.priority ?? '0.7', noindex: !!meta.noindex };
}

/* ---------- Esecuzione ---------- */
const files = readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.html')).sort();
const pages = files.map(buildPage);

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  pages
    .filter(p => !p.noindex)
    .map(p =>
      `  <url>\n    <loc>${SITE}${p.url}</loc>\n` +
      `    <lastmod>${TODAY}</lastmod>\n` +
      `    <priority>${p.priority}</priority>\n  </url>\n`)
    .join('') +
  `</urlset>\n`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

console.log(`✓ ${pages.length} pagine + sitemap.xml`);
for (const p of pages) console.log(`  ${p.url.padEnd(28)} → ${p.out.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
