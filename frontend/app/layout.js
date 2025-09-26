import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/toaster'
import NextTopLoader from 'nextjs-toploader'

export const metadata = {
  title: 'Shams lo trae! - Los mejores productos al mejor precio',
  description: 'Descubre ofertas y productos con precios actualizados en tiempo real. Encuentra lo que necesitas en nuestro catálogo.',
  keywords: 'shams lo trae, catálogo, productos, compras, precios, Costa Rica',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'Shams lo trae! - Los mejores productos',
    description: 'Descubre nuestra selección con precios actualizados en tiempo real.',
    type: 'website',
    locale: 'es_CR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shams lo trae! - Los mejores productos',
    description: 'Descubre nuestra selección con precios actualizados en tiempo real.',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FF6A3D',
}

export default function RootLayout({ children }) {
  return (
  <html lang="es-CR" className="scroll-smooth">
      <body className={cn(
        "min-h-screen bg-gray-100 font-sans antialiased",
        "selection:bg-primary/20 selection:text-primary-foreground"
      )}>
    <link rel="preconnect" href="https://wjgitkxfzdmrblqzwryf.supabase.co" crossOrigin="anonymous" />
    <link rel="preconnect" href="https://wa.me" />
        <div className="relative flex min-h-screen flex-col">
          {/* Loading bar visible en transiciones de ruta y fetches client-side */}
          <NextTopLoader color="#2563eb" height={3} showSpinner={false} zIndex={90} />
          <div className="flex-1">
            {children}
          </div>
          <Toaster />
        </div>
      </body>
    </html>
  )
}