import './globals.css'
import { cn } from '@/lib/utils'
import Link from 'next/link';

export const metadata = {
  title: 'Shams lo trae! - Los mejores productos al mejor precio',
  description: 'Descubre ofertas y productos con precios actualizados en tiempo real. Encuentra lo que necesitas en nuestro catálogo.',
  keywords: 'shams lo trae, catálogo, productos, compras, precios, Costa Rica',
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
        <div className="relative flex min-h-screen flex-col">
          <nav className="hidden md:block bg-gray-100 p-4 shadow-md">
            <ul className="flex space-x-4">
              <li>
                <Link href="/">Inicio</Link>
              </li>
              <li>
                <Link href="/product-overview">Resumen de Productos</Link>
              </li>
            </ul>
          </nav>
          <div className="flex-1">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}