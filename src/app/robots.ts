import type { MetadataRoute } from 'next';

/** The landing page is public; demo churches, their pages, the API and family/buddy links are not for crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/demo', '/c/', '/api/', '/p/', '/b/'] },
  };
}
