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
  // Pin del profilo Google Maps (maps.app.goo.gl/kqCbz2W3AeWZCFyZA), 2026-08-05.
  geo: ['45.180416', '9.1830979'],
  foundingDate: '2026-03-23',
  maps: 'https://maps.app.goo.gl/kqCbz2W3AeWZCFyZA',
};

/* Persone: unica fonte per pagina "Chi siamo" e dati strutturati.
   Solo dati pubblici già presenti sul sito e sul profilo Instagram. */
const PEOPLE = [
  {
    id: 'antonio-puccio', name: 'Antonio Puccio',
    jobTitle: 'Direttore tecnico · operatore olistico del benessere',
    description: "Laureato in Scienze Motorie, responsabile dell'area massaggi di NOA e specializzato nel massaggio in gravidanza. Porta a Pavia l'esperienza maturata a Milano nei trattamenti manuali personalizzati.",
    knowsAbout: ['Massaggio in gravidanza', 'Massaggio decontratturante', 'Massaggio terapeutico', 'Massaggio sportivo', 'Linfodrenaggio metodo Vodder',
      'Riflessologia plantare', 'Massaggio in gravidanza', 'Maderoterapia', 'Trattamenti anticellulite'],
    credential: 'Laurea in Scienze Motorie',
    image: '/assets/foto/antonio-puccio.webp',
  },
  {
    id: 'vitalia', name: 'Vitalia',
    jobTitle: 'Estetista · trattamenti viso e corpo',
    description: 'Estetista di NOA: massaggi estetici rimodellanti, trattamenti viso e corpo, maderoterapia.',
    knowsAbout: ['Trattamenti viso', 'Trattamenti corpo', 'Maderoterapia', 'Massaggio anticellulite', 'Pressoterapia'],
    image: '/assets/foto/vitalia.webp',
  },
];
const personNode = pp => ({
  '@type': 'Person', '@id': `${SITE}/chi-siamo/#${pp.id}`, name: pp.name, jobTitle: pp.jobTitle,
  description: pp.description, knowsAbout: pp.knowsAbout, image: `${SITE}${pp.image}`,
  worksFor: { '@id': BIZ_ID },
  ...(pp.credential ? { hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'degree', name: pp.credential } } : {}),
});

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
      'laser a diodo, trattamenti viso e corpo ad alta efficacia, nail spa e sauna.',
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
    sameAs: [BIZ.instagram, BIZ.maps],
    hasMap: BIZ.maps,
    foundingDate: BIZ.foundingDate,
    employee: PEOPLE.map(pp => ({ '@id': `${SITE}/chi-siamo/#${pp.id}` })),
    founder: { '@id': `${SITE}/chi-siamo/#antonio-puccio` },
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

/* Hub "Domande frequenti": raccoglie le FAQ di tutte le pagine (unica fonte: i META). */
function allFaqs() {
  return readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.html')).sort()
    .map(f => readSrc(f).meta).filter(m => m.faq && !m.faqHub)
    .map(m => ({ url: m.url, title: m.url === '/' ? 'Il centro e i trattamenti' : m.title.replace(/\s*\|.*$/, ''), faq: m.faq }))
    .sort((a, b) => {
      const ORD = ['/', '/massaggi-pavia/', '/massaggio-gravidanza-pavia/'];
      const r = u => (ORD.indexOf(u) === -1 ? ORD.length : ORD.indexOf(u));
      return r(a.url) - r(b.url);
    });
}
function renderFaqHub() {
  return allFaqs().map(g =>
    `    <div class="menu-head reveal"><span class="orn">✿ ✿ ✿</span><h2><a href="${g.url}">${g.title}</a></h2></div>\n` +
    renderFaq(g.faq)).join('\n');
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
  if (body.includes('{{EVENTI}}')) {
    const live = (meta.events || []).filter(e => e.until >= TODAY);
    body = body.replace('{{EVENTI}}', live.map(e => e.html).join('\n'));
  }
  if (body.includes('{{FAQ_TUTTE}}')) body = body.replace('{{FAQ_TUTTE}}', renderFaqHub());

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

  graph.push({
    '@type': meta.pageType || 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: meta.title,
    description: meta.description,
    inLanguage: 'it-IT',
    isPartOf: { '@id': `${SITE}/#website` },
    about: { '@id': BIZ_ID },
    primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}${meta.image || '/assets/og-image.jpg'}` },
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.lead', '.svc-prose p:first-of-type'] },
  });
  if (meta.schema !== 'home') graph.push({ '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: BIZ.name, inLanguage: 'it-IT', publisher: { '@id': BIZ_ID } });
  if (meta.people) PEOPLE.forEach(pp => graph.push(personNode(pp)));
  for (const ev of (meta.events || [])) {
    if (ev.until < TODAY) continue;
    graph.push({
      '@type': 'Event', name: ev.name, description: ev.description, startDate: ev.start, endDate: ev.start,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: true, inLanguage: 'it-IT',
      location: { '@type': 'Place', name: BIZ.name, address: postalAddress() },
      organizer: { '@id': BIZ_ID }, image: `${SITE}${ev.image || '/assets/og-image.jpg'}`,
      offers: { '@type': 'Offer', url: canonical, price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/LimitedAvailability' },
    });
  }
  if (meta.breadcrumb && meta.breadcrumb.length > 1) graph.push(breadcrumbs(meta.breadcrumb));
  if (meta.faq) graph.push(faqSchema(meta.faq));
  if (meta.faqHub) graph.push(faqSchema(allFaqs().flatMap(g => g.faq)));

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

  let header = markActive(HEADER, meta.nav || []);
  let footer = markActive(FOOTER, []);
  if (meta.landing) {
    /* Landing per annunci: nessun menu che porti via la visitatrice; restano barra Chiama/WhatsApp, consenso e conteggio. */
    header = `<div class="island-wrap"><header class="island" id="island">
    <a class="brand" href="/massaggio-gravidanza-pavia/" aria-label="NOA Beauty &amp; Wellness"><img src="/assets/logo-oro.png" alt="NOA Beauty &amp; Wellness" width="1600" height="1080"></a>
    <a class="btn-prenota" href="https://wa.me/393475664504?text=Ciao%20NOA!%20Vorrei%20prenotare%20un%20massaggio%20in%20gravidanza" target="_blank" rel="noopener">Prenota</a>
  </header></div>`;
    const tail = footer.slice(footer.indexOf('<div class="consenso"'));
    footer = `<footer class="site"><div class="container"><p class="fnap" style="text-align:center"><strong>NOA Beauty &amp; Wellness</strong> · Via San Pietro in Verzolo 15, 27100 Pavia · <a href="tel:+393475664504">347 566 4504</a><br>Lun–Ven 9:00–19:00 · Sabato 9:00–12:30</p></div></footer>\n` + tail;
  }

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
  return { url, out, meta, priority: meta.priority ?? '0.7', noindex: !!meta.noindex };
}

/* ---------- Esecuzione ---------- */
const files = readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.html')).sort();
const pages = files.map(buildPage);

/* ============================================================
   Livello "indicizzazione": sitemap con immagini e lastmod onesto,
   robots.txt, llms.txt e llms-full.txt (per i motori di risposta IA).
   Tutto generato dagli stessi dati delle pagine: niente da tenere
   allineato a mano.
   ============================================================ */
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* lastmod onesto: cambia solo se cambia l'HTML finale della pagina */
const LM_FILE = join(ROOT, '.lastmod.json');
const lm = existsSync(LM_FILE) ? JSON.parse(readFileSync(LM_FILE, 'utf8')) : {};
for (const p of pages) {
  const html = readFileSync(p.out, 'utf8');
  const h = createHash('sha1').update(html).digest('hex');
  if (!lm[p.url] || lm[p.url].h !== h) lm[p.url] = { h, d: TODAY };
  p.lastmod = lm[p.url].d;
  p.html = html;
}
writeFileSync(LM_FILE, JSON.stringify(lm, null, 1));

const imagesOf = html => {
  const seen = new Set(), out = [];
  for (const m of html.matchAll(/<img[^>]+src="(\/assets\/foto\/[^"]+)"[^>]*alt="([^"]*)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]); out.push({ src: m[1], alt: m[2] });
  }
  return out;
};

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
  pages
    .filter(p => !p.noindex)
    .map(p =>
      `  <url>\n    <loc>${SITE}${p.url}</loc>\n` +
      `    <lastmod>${p.lastmod}</lastmod>\n` +
      `    <priority>${p.priority}</priority>\n` +
      imagesOf(p.html).map(i =>
        `    <image:image><image:loc>${SITE}${i.src}</image:loc><image:title>${esc(i.alt)}</image:title></image:image>\n`).join('') +
      `  </url>\n`)
    .join('') +
  `</urlset>\n`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

/* robots.txt: tutti i crawler ammessi, i bot IA nominati esplicitamente */
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot',
  'Amazonbot', 'meta-externalagent', 'CCBot'];
writeFileSync(join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\n` +
  AI_BOTS.map(b => `User-agent: ${b}\nAllow: /\n`).join('\n') +
  `\nSitemap: ${SITE}/sitemap.xml\n`);

/* testo pulito di una pagina, in markdown, per llms-full.txt */
function pageToMarkdown(html) {
  let m = html.match(/<main[\s\S]*?<\/main>/i);
  let t = m ? m[0] : html.replace(/[\s\S]*<body[^>]*>/i, '');
  const hero = html.match(/<header class="listino-hero">[\s\S]*?<\/header>/i);
  if (hero && !m?.[0].includes('listino-hero')) t = hero[0] + t;
  t = t.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, '')
       .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
       .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
       .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
       .replace(/<li[^>]*>/gi, '\n- ')
       .replace(/<\/(p|div|section|dt|dd|tr|details|summary)>/gi, '\n')
       .replace(/<br\s*\/?>/gi, '\n')
       .replace(/<[^>]+>/g, ' ')
       .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
       .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

const indexable = pages.filter(p => !p.noindex && p.url !== '/404.html');
const orariTxt = 'Lunedì–venerdì 9:00–19:00, sabato 9:00–12:30, domenica chiuso';
const headLlms =
  `# ${BIZ.name}\n\n` +
  `> Centro estetico e benessere a ${BIZ.city} (${BIZ.region}): massaggi, maderoterapia, epilazione a cera e laser, ` +
  `trattamenti viso e corpo, manicure e pedicure, sauna. Specializzato nel massaggio in gravidanza con lettino dotato di apertura per il pancione. ` +
  `Indirizzo: ${BIZ.street}, ${BIZ.postal} ${BIZ.city}. Telefono e WhatsApp: ${BIZ.phone}. Orari: ${orariTxt}. ` +
  `Si prenota su WhatsApp. Sito ufficiale: ${SITE}/\n\n`;
const titleOf = p => (p.meta?.title || p.url).replace(/\s*\|.*$/, '');
writeFileSync(join(ROOT, 'llms.txt'),
  headLlms +
  `## Pagine principali\n\n` +
  indexable.map(p => `- [${titleOf(p)}](${SITE}${p.url}): ${p.meta?.description || ''}`).join('\n') +
  `\n\n## Dati dell'attività\n\n- Nome: ${BIZ.name}\n- Indirizzo: ${BIZ.street}, ${BIZ.postal} ${BIZ.city} (${BIZ.region})\n` +
  `- Telefono / WhatsApp: ${BIZ.phone}\n- Orari: ${orariTxt}\n- Instagram: ${BIZ.instagram}\n` +
  `- Comuni serviti: ${COMUNI.join(', ')}\n\n## Testo completo\n\n- [Tutte le pagine in un solo file](${SITE}/llms-full.txt)\n`);
writeFileSync(join(ROOT, 'llms-full.txt'),
  headLlms + indexable.map(p => `\n\n---\n\nFonte: ${SITE}${p.url}\nAggiornata: ${p.lastmod}\n\n${pageToMarkdown(p.html)}`).join('') + '\n');

console.log(`✓ ${pages.length} pagine + sitemap.xml, robots.txt, llms.txt, llms-full.txt`);
for (const p of pages) console.log(`  ${p.url.padEnd(28)} → ${p.out.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
