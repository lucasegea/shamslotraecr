'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Package, Filter } from 'lucide-react'

export default function CategorySidebar({ categories, selectedCategory, onCategorySelect, isMobile = false }) {
  const totalProducts = categories.reduce((sum, cat) => sum + (cat.product_count || 0), 0)

  return (
    <div className={isMobile ? "w-full h-fit" : "w-80 sticky top-4 h-fit"}>
      <Card className={cn(
        isMobile ? "bg-transparent border-0 shadow-none" : "glass-card bg-white shadow-sm"
      )}>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <Filter className="h-5 w-5 text-blue-600" />
            Categorías
          </CardTitle>
          <p className="text-sm text-gray-600">
            {totalProducts} productos en total
          </p>
        </CardHeader>
        
        <CardContent className="space-y-2">
          {/* All Products Option */}
          <motion.div whileHover={{ x: 4 }} transition={{ duration: 0.2 }}>
            <Button
              variant={!selectedCategory ? "default" : "ghost"}
              className={cn(
                "w-full justify-between p-3 h-auto hover-lift",
                !selectedCategory 
                  ? "bg-blue-600 text-white hover:bg-blue-700" 
                  : "hover:bg-gray-50 text-gray-700"
              )}
              onClick={() => onCategorySelect(null)}
            >
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4" />
                <span className="font-medium">Todos los productos</span>
              </div>
              <Badge 
                variant={!selectedCategory ? "secondary" : "outline"} 
                className={cn(
                  "ml-2",
                  !selectedCategory 
                    ? "bg-white text-blue-600" 
                    : "bg-gray-100 text-gray-700"
                )}
              >
                {totalProducts}
              </Badge>
            </Button>
          </motion.div>

          {/* Category List */}
      <div className={cn("space-y-1", isMobile ? "max-h-[50vh]" : "max-h-96", "overflow-y-auto")}
      >
            {categories.map((category) => (
              <motion.div 
                key={`${category.id}-${category.name}`}
                whileHover={{ x: 4 }} 
                transition={{ duration: 0.2 }}
              >
                <Button
                  variant={selectedCategory?.id === category.id ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-between p-3 h-auto text-left hover-lift",
                    selectedCategory?.id === category.id 
                      ? "bg-blue-600 text-white hover:bg-blue-700" 
                      : "hover:bg-gray-50 text-gray-700"
                  )}
                  onClick={() => onCategorySelect(category)}
                >
                  <span className="font-medium truncate flex-1 text-balance">
                    {category.name}
                  </span>
                  
                  <Badge 
                    variant={selectedCategory?.id === category.id ? "secondary" : "outline"} 
                    className={cn(
                      "ml-2 shrink-0",
                      selectedCategory?.id === category.id 
                        ? "bg-white text-blue-600" 
                        : "bg-gray-100 text-gray-700"
                    )}
                  >
                    {category.product_count || 0}
                  </Badge>
                </Button>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}