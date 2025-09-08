'use client'

import { useState, useEffect, useMemo, createContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ShoppingBag, Sparkles, ShoppingCart } from 'lucide-react'

import { getCategories, getProducts } from '@/lib/database'
import { supabase } from '@/lib/supabase'
import CategorySidebar from '@/components/CategorySidebar'
import ProductGrid from '@/components/ProductGrid'
import ProductPagination from '@/components/ProductPagination'
import SearchBar from '@/components/SearchBar'
import CartDrawer from '@/components/CartDrawer'
import ImageViewer from '@/components/ImageViewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Contexto para el visor de imágenes
export const ImageViewerContext = createContext({
  openImageViewer: () => {},
  imageViewerState: { isOpen: false, imageUrl: '', alt: '' }
});

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
  const [isCartBouncing, setIsCartBouncing] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const productsPerPage = 12
  
  // ImageViewer state
  const [imageViewerState, setImageViewerState] = useState({
    isOpen: false,
    imageUrl: '',
    alt: ''
  })
  
  // Función para abrir el visor de imágenes
  const openImageViewer = (imageUrl, alt) => {
    setImageViewerState({
      isOpen: true,
      imageUrl,
      alt
    })
  }
  
  // Función para cerrar el visor de imágenes
  const closeImageViewer = () => {
    setImageViewerState({
      ...imageViewerState,
      isOpen: false
    })
  }
  
  // Valor del contexto para el visor de imágenes
  const imageViewerContextValue = {
    openImageViewer,
    imageViewerState
  }

  // Load initial data
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true)
      try {
        const [categoriesData, productsData] = await Promise.all([
          getCategories(),
          getProducts({ limit: productsPerPage, page: 1 })
        ])
        
        setCategories(categoriesData)
        setProducts(productsData.products)
        setTotalProducts(productsData.totalCount)
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Load products when category, search, page, or productsPerPage changes
  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true)
      try {
        const result = await getProducts({
          categoryId: selectedCategory?.id,
          searchTerm: searchTerm.trim(),
          limit: productsPerPage,
          page: currentPage
        })
        
        // Debug detallado: verificar los datos de productos antes de establecerlos
        console.log('🔄 Productos recibidos en page.js:', result.products.slice(0, 3).map(p => ({
          id: p.id,
          name: p.name,
          final_price: p.final_price,
          final_price_type: typeof p.final_price,
          final_price_numeric: Number(p.final_price),
          price_raw: p.price_raw
        })));
        
        // No modificamos los productos, simplemente mostramos información
        console.log('👀 Productos en page.js antes de establecerlos:', result.products.slice(0, 2).map(p => ({
          name: p.name,
          final_price: p.final_price,
          final_price_type: typeof p.final_price
        })));
        
        // Usar los productos directamente sin modificar
        setProducts(result.products)
        setTotalProducts(result.totalCount)
        
        const pages = Math.max(1, Math.ceil(result.totalCount / productsPerPage))
        setTotalPages(pages)
        
        // Si la página actual es mayor que el total de páginas, volver a la primera
        if (currentPage > pages) {
          setCurrentPage(1)
        }
      } catch (error) {
        console.error('Error loading products:', error)
        setProducts([])
        setTotalProducts(0)
        setTotalPages(1)
      } finally {
        setProductsLoading(false)
      }
    }

    if (!loading) {
      loadProducts()
    }
  }, [selectedCategory, searchTerm, currentPage, loading, productsPerPage])

  const handleCategorySelect = (category) => {
    setSelectedCategory(category)
    setSearchTerm('')
    setCurrentPage(1) // Reset to first page on category change
  }

  const handleSearch = (term) => {
    setSearchTerm(term)
    setCurrentPage(1) // Reset to first page on search
    if (term.trim()) {
      setSelectedCategory(null)
    }
  }
  
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Cart functions
  const handleAddToCart = async (product, quantity = 1) => {
    const addQuantity = quantity || 1; // Asegurar que sea al menos 1
    
    try {
      // Obtener el producto más actualizado directamente de la base de datos
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, 
          name,
          product_url, 
          image_url, 
          image_file_url, 
          price_raw, 
          final_price, 
          currency
        `)
        .eq('id', product.id)
        .single();
      
      if (error) {
        console.error('Error al obtener producto actualizado:', error);
        // Continuar con el producto original si hay un error
      }
      
      // Usar el producto actualizado si está disponible, de lo contrario usar el original
      const updatedProduct = data || product;
      
      // Log detallado para depuración, enfocado en final_price
      console.log('🛒 AGREGANDO AL CARRITO:', {
        original: {
          id: product.id,
          name: product.name,
          final_price: product.final_price,
          final_price_type: typeof product.final_price
        },
        updated: {
          id: updatedProduct.id,
          name: updatedProduct.name,
          final_price: updatedProduct.final_price,
          final_price_type: typeof updatedProduct.final_price
        }
      });
      
      setCartItems(prevItems => {
        const existingItem = prevItems.find(item => item.product.id === updatedProduct.id);
        
        if (existingItem) {
          return prevItems.map(item =>
            item.product.id === updatedProduct.id
              ? { ...item, quantity: item.quantity + addQuantity }
              : item
          );
        } else {
          return [...prevItems, { product: updatedProduct, quantity: addQuantity }];
        }
      });
      
      // Animate cart icon
      setIsCartBouncing(true);
      setTimeout(() => setIsCartBouncing(false), 800);
    } catch (err) {
      console.error('Error en handleAddToCart:', err);
      // Fallback: usar el producto original si algo falla
      setCartItems(prevItems => {
        const existingItem = prevItems.find(item => item.product.id === product.id);
        
        if (existingItem) {
          return prevItems.map(item =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + addQuantity }
              : item
          );
        } else {
          return [...prevItems, { product, quantity: addQuantity }];
        }
      });
      
      setIsCartBouncing(true);
      setTimeout(() => setIsCartBouncing(false), 800);
    }
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
    return totalProducts
  }, [totalProducts])

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
    <ImageViewerContext.Provider value={imageViewerContextValue}>
      <div className="min-h-screen bg-background">
        {/* Visor de imágenes a nivel global */}
        <ImageViewer 
          isOpen={imageViewerState.isOpen}
          onClose={closeImageViewer}
          imageUrl={imageViewerState.imageUrl}
          alt={imageViewerState.alt}
        />
        
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
                    Los mejores precios
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <SearchBar 
                onSearch={handleSearch}
                searchTerm={searchTerm}
                placeholder="Buscar productos..."
                className="w-full max-w-md"
              />

              {/* Cart Button */}
              <Button
                variant="outline"
                className="relative"
                onClick={() => setIsCartOpen(true)}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={totalCartItems} // Esto fuerza la reanimación cuando cambia el total
                    initial={isCartBouncing ? { scale: 0.5, rotate: -15 } : { scale: 1, rotate: 0 }}
                    animate={isCartBouncing ? {
                      scale: [0.5, 1.2, 1],
                      rotate: [-15, 15, 0],
                    } : { scale: 1, rotate: 0 }}
                    transition={{ 
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    <ShoppingCart className="h-5 w-5" />
                  </motion.div>
                </AnimatePresence>
                <AnimatePresence>
                  {totalCartItems > 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs"
                      >
                        {totalCartItems}
                      </Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                  {totalProducts > 0 && (
                    <>
                      {totalProducts} {totalProducts === 1 ? 'producto encontrado' : 'productos encontrados'}
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-4">
                {(selectedCategory || searchTerm) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCategory(null)
                      setSearchTerm('')
                      setCurrentPage(1)
                    }}
                    className="shrink-0"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>

            {/* Products Grid */}
            <ProductGrid
              products={products}
              loading={productsLoading}
              searchTerm={searchTerm}
              categoryName={selectedCategory?.name}
              onAddToCart={handleAddToCart}
            />
            
            {/* Products Pagination - Bottom Center */}
            {totalProducts > productsPerPage && (
              <div className="flex justify-center mt-8 mb-6">
                <ProductPagination 
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  className="pagination-controls"
                />
              </div>
            )}
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
    </ImageViewerContext.Provider>
  )
}