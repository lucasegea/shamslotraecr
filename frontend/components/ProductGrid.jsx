'use client'

import { motion } from 'framer-motion'
import ProductCard from './ProductCard_v2'
import { Card, CardContent } from '@/components/ui/card'
import { Package, Search } from 'lucide-react'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

function ProductSkeleton() {
  return (
    <Card className="overflow-hidden animate-pulse h-full">
      <CardContent className="p-4 h-full">
        <div className="flex flex-col gap-4 h-full">
          <div className="aspect-square w-full bg-muted rounded-lg" />
          <div className="flex-1 space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="h-8 bg-muted rounded mt-auto" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ searchTerm, categoryName }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="col-span-full flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="rounded-full bg-muted/50 p-6 mb-4">
        {searchTerm ? (
          <Search className="h-12 w-12 text-muted-foreground" />
        ) : (
          <Package className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      
      <h3 className="text-xl font-semibold text-foreground mb-2">
        {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
      </h3>
      
      <p className="text-muted-foreground max-w-md">
        {searchTerm ? (
          <>No encontramos productos que coincidan con "<span className="font-medium text-foreground">{searchTerm}</span>"{categoryName && ` en la categoría ${categoryName}`}.</>
        ) : (
          categoryName ? `No hay productos disponibles en la categoría ${categoryName}.` : 'No hay productos disponibles en este momento.'
        )}
      </p>
    </motion.div>
  )
}

export default function ProductGrid({ 
  products, 
  loading = false, 
  searchTerm = '', 
  categoryName = '',
  onAddToCart
}) {
  if (loading) {
    return (
  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 auto-rows-fr">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!products || products.length === 0) {
    return (
      <div className="grid grid-cols-1">
        <EmptyState searchTerm={searchTerm} categoryName={categoryName} />
      </div>
    )
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
  className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 auto-rows-fr"
    >
      {products.map((product) => (
        <motion.div key={product.id} variants={item} className="col-span-1">
          <ProductCard product={product} onAddToCart={onAddToCart} />
        </motion.div>
      ))}
    </motion.div>
  )
}