import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/login', '/signup', '/logout', '/upvc/login', '/*/home', '/*/console'],
    },
    sitemap: 'https://app.vitharn.com/sitemap.xml',
  };
}
