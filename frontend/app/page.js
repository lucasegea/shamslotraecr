'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, ShoppingBag, Sparkles, ShoppingCart } from 'lucide-react'

import { getCategories, getProducts } from '@/lib/database'
import CategorySidebar from '@/components/CategorySidebar'
import ProductGrid from '@/components/ProductGrid'
import SearchBar from '@/components/SearchBar'
import CartDrawer from '@/components/CartDrawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function HomePage() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(false)
  
  // Cart state
  const [cartItems, setCartItems] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)

  // Load initial data
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true)
      try {
        console.log('Loading initial data...')
        const [categoriesData, productsData] = await Promise.all([
          getCategories(),
          getProducts({ limit: 24 })
        ])
        
        console.log('Categories loaded:', categoriesData.length)
        console.log('Products loaded:', productsData.products.length)
        
        setCategories(categoriesData)
        setProducts(productsData.products)
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Load products when category or search changes
  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true)
      try {
        const result = await getProducts({
          categoryId: selectedCategory?.id,
          searchTerm: searchTerm.trim(),
          limit: 50
        })
        setProducts(result.products)
      } catch (error) {
        console.error('Error loading products:', error)
        setProducts([])
      } finally {
        setProductsLoading(false)
      }
    }

    if (!loading) {
      loadProducts()
    }
  }, [selectedCategory, searchTerm, loading])

  const handleCategorySelect = (category) => {
    setSelectedCategory(category)
    setSearchTerm('')
  }

  const handleSearch = (term) => {
    setSearchTerm(term)
    if (term.trim()) {
      setSelectedCategory(null)
    }
  }

  // Cart functions
  const handleAddToCart = (product) => {
    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.product.id === product.id)
      
      if (existingItem) {
        return prevItems.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      } else {
        return [...prevItems, { product, quantity: 1 }]
      }
    })
    
    // Show cart briefly
    setIsCartOpen(true)
    setTimeout(() => setIsCartOpen(false), 2000)
  }

  const handleUpdateQuantity = (productId, newQuantity) => {
    if (newQuantity === 0) {
      handleRemoveItem(productId)
      return
    }
    
    setCartItems(prevItems =>
      prevItems.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    )
  }

  const handleRemoveItem = (productId) => {
    setCartItems(prevItems => prevItems.filter(item => item.product.id !== productId))
  }

  const filteredProductsCount = useMemo(() => {
    return products.length
  }, [products])

  const headerTitle = useMemo(() => {
    if (searchTerm) {
      return `Resultados para "${searchTerm}"`
    }
    if (selectedCategory) {
      return selectedCategory.name
    }
    return 'Todos los productos'
  }, [searchTerm, selectedCategory])

  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex gap-8">
            <div className="w-80 space-y-4">
              <div className="h-96 bg-card/50 rounded-2xl animate-pulse" />
            </div>
            <div className="flex-1 space-y-6">
              <div className="h-16 bg-card/50 rounded-2xl animate-pulse" />
              <ProductGrid loading={true} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <motion.header 
        className="border-b border-border/50 bg-card/20 backdrop-blur-sm sticky top-0 z-40"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ShoppingBag className="h-8 w-8 text-primary" />
                  <Sparkles className="h-4 w-4 text-secondary absolute -top-1 -right-1" />
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                    Catálogo Premium
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Los mejores productos al mejor precio
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <SearchBar 
                onSearch={handleSearch}
                searchTerm={searchTerm}
                placeholder="Buscar productos..."
              />
              
              <Badge variant="secondary" className="hidden sm:flex">
                {categories.reduce((sum, cat) => sum + (cat.product_count || 0), 0)} productos
              </Badge>

              {/* Cart Button */}
              <Button
                variant="outline"
                className="relative"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-5 w-5" />
                {totalCartItems > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {totalCartItems}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <CategorySidebar
              categories={categories}
              selectedCategory={selectedCategory}
              onCategorySelect={handleCategorySelect}
            />
          </motion.aside>

          {/* Products */}
          <motion.div 
            className="flex-1 space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {/* Products Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {headerTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredProductsCount} {filteredProductsCount === 1 ? 'producto encontrado' : 'productos encontrados'}
                </p>
              </div>

              {(selectedCategory || searchTerm) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedCategory(null)
                    setSearchTerm('')
                  }}
                  className="shrink-0"
                >
                  Limpiar filtros
                </Button>
              )}
            </div>

            {/* Products Grid */}
            <ProductGrid
              products={products}
              loading={productsLoading}
              searchTerm={searchTerm}
              categoryName={selectedCategory?.name}
              onAddToCart={handleAddToCart}
            />
          </motion.div>
        </div>
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
      />
    </div>
  )
}