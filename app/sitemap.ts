import { MetadataRoute } from 'next';
import { getCachedClients, slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://app.vitharn.com';
  
  // Static Routes
  const staticRoutes = [
    { url: '', priority: 1.0 },
    { url: '/upvc', priority: 0.9 },
    { url: '/upvc/pricing', priority: 0.8 },
    { url: '/upvc/pricing/show', priority: 0.7 },
    { url: '/upvc/compare', priority: 0.9 },
    { url: '/signup', priority: 0.7 },
    { url: '/login', priority: 0.7 },
  ].map((route) => ({
    url: `${baseUrl}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'weekly' as const,
    priority: route.priority,
  }));

  // Dynamic Client Routes
  let clientRoutes: MetadataRoute.Sitemap = [];
  try {
    const clients = await getCachedClients();
    clientRoutes = (clients || [])
      .filter((c: any) => c.is_active !== false)
      .map((client: any) => ({
        url: `${baseUrl}/${slugify(client.id)}`,
        lastModified: new Date().toISOString(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
  } catch (error) {
    console.error("Failed to generate sitemap for clients:", error);
  }

  return [...staticRoutes, ...clientRoutes];
}
