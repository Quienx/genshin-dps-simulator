const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

/**
 * @type {import('next-sitemap').IConfig}
 * @see https://github.com/iamvishnusankar/next-sitemap#readme
 */
module.exports = {
  // Same origin as src/constant/config.ts.
  siteUrl:
    process.env.SITE_URL ??
    (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000'),
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
  },
};
