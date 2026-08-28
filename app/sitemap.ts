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
    { url: '/tools', priority: 0.8 },
    { url: '/tools/upvc-calculator', priority: 0.8 },
    { url: '/tools/glass-weight', priority: 0.7 },
    { url: '/tools/gst-calculator', priority: 0.7 },
    { url: '/tools/rf-sf-converter', priority: 0.7 },
    { url: '/tools/upi-qr', priority: 0.8 },
    { url: '/privacy', priority: 0.4 },
    { url: '/terms', priority: 0.4 },
    { url: '/refund-policy', priority: 0.4 },
    { url: '/sla', priority: 0.4 },
    { url: '/upvc/changelog', priority: 0.6 },
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
        url: `${baseUrl}/${slugify(client.id)}/`,
        lastModified: (client as any).updated_at || (client as any).created_at || new Date().toISOString(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
  } catch (error) {
    console.error("Failed to generate sitemap for clients:", error);
  }

  return [...staticRoutes, ...clientRoutes];
}
