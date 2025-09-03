import './globals.css'
import { cn } from '@/lib/utils'

export const metadata = {
  title: 'Catálogo Premium - Los mejores productos al mejor precio',
  description: 'Descubre nuestra selección premium de productos con precios actualizados en tiempo real. Encuentra lo que necesitas en nuestro catálogo completo.',
  keywords: 'catálogo, productos, compras, precios, Costa Rica',
  openGraph: {
    title: 'Catálogo Premium - Los mejores productos',
    description: 'Descubre nuestra selección premium de productos con precios actualizados en tiempo real.',
    type: 'website',
    locale: 'es_CR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Catálogo Premium - Los mejores productos',
    description: 'Descubre nuestra selección premium de productos con precios actualizados en tiempo real.',
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
        "min-h-screen bg-background font-sans antialiased",
        "selection:bg-primary/20 selection:text-primary-foreground"
      )}>
        <div className="relative flex min-h-screen flex-col">
          <div className="flex-1">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}