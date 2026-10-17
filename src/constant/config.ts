// The deployed origin, without a trailing '/'. Vercel sets its production
// domain; elsewhere, set SITE_URL.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const siteConfig = {
  title: 'Genshin DPS Simulator',
  description:
    'A Genshin Impact team damage simulator with a combat timeline, built on a generic engine where every character is a JSON file.',
  url:
    process.env.SITE_URL ??
    (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000'),
};
