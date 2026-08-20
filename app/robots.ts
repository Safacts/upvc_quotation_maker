import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/portal_auth', '/api/console', '/api/admin', '/login', '/signup', '/logout', '/upvc/login', '/*/home', '/*/console'],
      },
      {
        userAgent: 'Googlebot-Image',
        allow: '/api/favicon/',
      },
    ],
    sitemap: 'https://app.vitharn.com/sitemap.xml',
  };
}
