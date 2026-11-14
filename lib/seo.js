'use strict';
/* Lo que leen WhatsApp, Facebook y Google cuando alguien comparte o busca un aviso:
   etiquetas Open Graph (vista previa con título, texto y flyer), datos JobPosting
   (Google for Jobs) y el mapa del sitio. Funciones puras: reciben datos, devuelven texto. */

const SITE = 'WorkUco';
const SITE_DESC = 'Empleos y changas en San Carlos, Tunuyán y Tupungato. Mirá cuánto pagan, qué tan compatible sos y postulate en un toque.';
const DEFAULT_IMAGE = '/og-default.png';

const escAttr = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escXml = escAttr;
/* JSON dentro de <script>: que nada pueda cerrar la etiqueta */
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const oneLine = (t, max) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s;
};
const absUrl = (origin, u) => (!u ? '' : /^https?:\/\//.test(u) ? u : `${origin}${u.startsWith('/') ? '' : '/'}${u}`);
/* WhatsApp y Facebook no muestran SVG: sólo fotos */
const isPhoto = (u) => /\.(jpe?g|png|webp)(\?|$)/i.test(String(u || ''));

/* Etiquetas <meta> para el <head>. */
function metaTags({ title, description, url, image, type = 'website', noindex = false }) {
  const tags = [
    `<meta name="description" content="${escAttr(description)}">`,
    `<link rel="canonical" href="${escAttr(url)}">`,
    `<meta property="og:site_name" content="${SITE}">`,
    `<meta property="og:locale" content="es_AR">`,
    `<meta property="og:type" content="${escAttr(type)}">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:url" content="${escAttr(url)}">`,
    `<meta property="og:image" content="${escAttr(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (noindex) tags.push('<meta name="robots" content="noindex">');
  return tags.join('\n  ');
}

function pageMeta({ origin, path = '/', title = SITE, description = SITE_DESC, noindex = false }) {
  return metaTags({ title, description, url: `${origin}${path}`, image: `${origin}${DEFAULT_IMAGE}`, noindex });
}

function jobDescriptionLine(job) {
  const bits = [job.companyName, job.locality, job.gig ? 'Changa' : job.type];
  if (job.salaryLabel) bits.push(job.salaryLabel);
  return `${bits.filter(Boolean).join(' · ')}. ${oneLine(job.description, 150)}`;
}

function jobMeta(job, origin, { noindex = false } = {}) {
  const image = [job.flyer, ...(job.companyGallery || []), job.companyLogo].find(isPhoto);
  return metaTags({
    title: `${job.title} en ${job.companyName} · ${job.locality}`,
    description: jobDescriptionLine(job),
    url: `${origin}/oferta/${job.id}`,
    image: image ? absUrl(origin, image) : `${origin}${DEFAULT_IMAGE}`,
    type: 'article',
    noindex,
  });
}

const EMPLOYMENT = { 'Tiempo completo': 'FULL_TIME', 'Medio tiempo': 'PART_TIME', Temporal: 'TEMPORARY', 'Pasantía': 'INTERN', Freelance: 'CONTRACTOR' };
const UNIT = { mes: 'MONTH', 'día': 'DAY', hora: 'HOUR' };
const lines = (t) => String(t || '').split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
const htmlText = (t) => escAttr(t).replace(/\n/g, '<br>');

/* Datos estructurados JobPosting (https://developers.google.com/search/docs/appearance/structured-data/job-posting).
   Sólo para avisos aprobados y vigentes. */
function jobPostingLd(job, origin) {
  const resp = lines(job.responsibilities);
  const reqs = lines(job.requirements);
  const description = [
    `<p>${htmlText(job.description)}</p>`,
    resp.length ? `<p><strong>Tareas</strong></p><ul>${resp.map((r) => `<li>${escAttr(r)}</li>`).join('')}</ul>` : '',
    reqs.length ? `<p><strong>Requisitos</strong></p><ul>${reqs.map((r) => `<li>${escAttr(r)}</li>`).join('')}</ul>` : '',
  ].join('');
  const org = { '@type': 'Organization', name: job.companyName };
  if (job.companyWebsite) org.sameAs = job.companyWebsite;
  if (isPhoto(job.companyLogo)) org.logo = absUrl(origin, job.companyLogo);
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description,
    identifier: { '@type': 'PropertyValue', name: SITE, value: job.id },
    datePosted: new Date(job.publishedAt || job.createdAt || Date.now()).toISOString().slice(0, 10),
    employmentType: job.gig ? ['TEMPORARY', 'PER_DIEM'] : (EMPLOYMENT[job.type] || 'OTHER'),
    hiringOrganization: org,
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.locality, addressRegion: 'Mendoza', addressCountry: 'AR' },
    },
    directApply: true,
    url: `${origin}/oferta/${job.id}`,
  };
  /* sin fecha de cierre, Google lo deja de mostrar a los 60 días de publicado (no queda un aviso viejo para siempre) */
  const until = job.closesAt || new Date((job.publishedAt || job.createdAt || Date.now()) + 60 * 86400000 - 3 * 3600e3).toISOString().slice(0, 10);
  ld.validThrough = `${until}T23:59:59-03:00`;
  if (job.modality === 'Remoto') {
    ld.jobLocationType = 'TELECOMMUTE';
    ld.applicantLocationRequirements = { '@type': 'Country', name: 'Argentina' };
  }
  if (job.salaryMin > 0) {
    const value = { '@type': 'QuantitativeValue', unitText: UNIT[job.salaryPeriod] || 'MONTH' };
    if (job.salaryMax > job.salaryMin) { value.minValue = job.salaryMin; value.maxValue = job.salaryMax; } else value.value = job.salaryMin;
    ld.baseSalary = { '@type': 'MonetaryAmount', currency: 'ARS', value };
  }
  return `<script type="application/ld+json">${safeJson(ld)}</script>`;
}

function companyMeta(company, origin) {
  const image = [company.logo, ...(company.gallery || [])].find(isPhoto);
  return metaTags({
    title: `${company.name} · Empleos en ${company.locality || 'el Valle de Uco'}`,
    description: oneLine(company.description, 160) || `Búsquedas abiertas de ${company.name} en el Valle de Uco.`,
    url: `${origin}/empresa/${company.id}`,
    image: image ? absUrl(origin, image) : `${origin}${DEFAULT_IMAGE}`,
  });
}

/* ---------- Guía del Valle ---------- */
const PLACE_TYPE = { comida: 'Restaurant', oficios: 'HomeAndConstructionBusiness', salidas: 'EntertainmentBusiness', servicios: 'LocalBusiness' };
const DAY_NAME = { dom: 'Sunday', lun: 'Monday', mar: 'Tuesday', mie: 'Wednesday', jue: 'Thursday', vie: 'Friday', sab: 'Saturday' };
const { normPhone } = require('./importer');
const intlPhone = (raw) => { const n = normPhone(raw); return n && n.length === 10 ? `+54${n}` : ''; };

function placeTitle(place) {
  return `${place.name} · ${place.category} en ${place.localities[0] || 'el Valle de Uco'}`;
}
function placeMeta(place, origin, { noindex = false } = {}) {
  const image = (place.photos || []).find(isPhoto);
  return metaTags({
    title: placeTitle(place),
    description: `${place.category} en ${place.localities.join(', ')}. ${oneLine(place.description, 150)}`,
    url: `${origin}/guia/${place.slug}`,
    image: image ? absUrl(origin, image) : `${origin}${DEFAULT_IMAGE}`,
    noindex,
  });
}
/* Datos LocalBusiness (https://developers.google.com/search/docs/appearance/structured-data/local-business) */
function localBusinessLd(place, origin) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': PLACE_TYPE[place.section] || 'LocalBusiness',
    name: place.name,
    description: oneLine(place.description, 500),
    url: `${origin}/guia/${place.slug}`,
    address: { '@type': 'PostalAddress', addressLocality: place.localities[0] || '', addressRegion: 'Mendoza', addressCountry: 'AR' },
  };
  if (place.address) ld.address.streetAddress = place.address;
  const tel = intlPhone(place.phone || place.whatsapp);
  if (tel) ld.telephone = tel;
  const imgs = (place.photos || []).filter(isPhoto).map((u) => absUrl(origin, u));
  if (imgs.length) ld.image = imgs;
  const same = [place.instagram ? `https://www.instagram.com/${place.instagram}` : '', place.website].filter(Boolean);
  if (same.length) ld.sameAs = same;
  const h = place.hours;
  if (h && h.mode === '24h') {
    ld.openingHoursSpecification = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: Object.values(DAY_NAME), opens: '00:00', closes: '23:59' }];
  } else if (h && h.mode === 'horario') {
    ld.openingHoursSpecification = Object.entries(h.days || {}).flatMap(([d, ranges]) => (ranges || [])
      .map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAME[d], opens, closes })));
  }
  return `<script type="application/ld+json">${safeJson(ld)}</script>`;
}

/* entries: [{ path, lastmod (ms o ISO), priority }] */
function sitemapXml(origin, entries) {
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const urls = entries.map((e) => `  <url><loc>${escXml(origin + e.path)}</loc>${e.lastmod ? `<lastmod>${day(e.lastmod)}</lastmod>` : ''}${e.priority ? `<priority>${e.priority}</priority>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function robotsTxt(origin, { demo = false } = {}) {
  if (demo) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /panel',
    'Disallow: /admin',
    'Disallow: /mi-perfil',
    'Disallow: /acceder',
    'Disallow: /reclamar/',
    'Disallow: /cv',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

module.exports = { SITE, SITE_DESC, DEFAULT_IMAGE, escAttr, pageMeta, jobMeta, jobPostingLd, companyMeta, placeTitle, placeMeta, localBusinessLd, sitemapXml, robotsTxt };
