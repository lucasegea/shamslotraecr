'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { Package, Filter } from 'lucide-react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// Props:
// parents: CategoryNode[] (already limited/sorted upstream or we limit here)
// totalGlobal: number
export default function CategorySidebar({ parents = [], totalGlobal = 0, isMobile = false, onBeforeSelect }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [pending, setPending] = useState({ categoryId: null, parentId: null })
  const [openValue, setOpenValue] = useState('')
  const [clearAllRequested, setClearAllRequested] = useState(false)
  const spCategoryId = searchParams.get('categoryId')
  const spParentId = searchParams.get('parentId')
  const selectedCategoryId = pending.categoryId ? String(pending.categoryId) : spCategoryId
  const selectedParentId = pending.parentId ? String(pending.parentId) : spParentId

  // Clear optimistic pending once URL reflects the selection
  useEffect(() => {
    if (pending.categoryId && String(pending.categoryId) === spCategoryId) {
      setPending({ categoryId: null, parentId: null })
    } else if (pending.parentId && String(pending.parentId) === spParentId) {
      setPending({ categoryId: null, parentId: null })
    }
  }, [spCategoryId, spParentId, pending])

  // Keep accordion open state in sync with URL filters
  useEffect(() => {
    if (clearAllRequested) {
      setOpenValue('')
      if (!spParentId && !spCategoryId) {
        setClearAllRequested(false)
      }
      return
    }
    if (spParentId) {
      setOpenValue(`p-${spParentId}`)
    } else if (spCategoryId) {
      // find parent of selected category and open it
      const parent = parents.find((p) => (p.children || []).some((c) => String(c.id) === spCategoryId))
      setOpenValue(parent ? `p-${parent.id}` : '')
    } else {
      setOpenValue('')
    }
  }, [spParentId, spCategoryId, parents, clearAllRequested])

  const isAllSelected = !selectedCategoryId && !selectedParentId

  const setParam = (next) => {
    const sp = new URLSearchParams(searchParams.toString())
    // Clear both first
    sp.delete('categoryId')
    sp.delete('parentId')
    // Reset pagination when changing filters
    sp.set('page', '1')
    if (next?.categoryId) {
      setPending({ categoryId: next.categoryId, parentId: null })
      onBeforeSelect && onBeforeSelect('category', next.categoryId)
      sp.set('categoryId', String(next.categoryId))
    }
    if (next?.parentId) {
      setPending({ categoryId: null, parentId: next.parentId })
      onBeforeSelect && onBeforeSelect('parent', next.parentId)
      sp.set('parentId', String(next.parentId))
    }
    router.push(`${pathname}?${sp.toString()}`)
  }

  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const ORDER = new Map([
    ['tecnologia', 0],
    ['moda y accesorios', 1],
    ['hogar y oficina', 2],
    ['hogar, oficina y otros', 2],
    ['jugueteria', 3],
    ['sin categoria', 4],
    ['uncategorized', 4],
  ])
  const orderedParents = [...parents].sort((a, b) => {
    const ai = ORDER.has(norm(a.name)) ? ORDER.get(norm(a.name)) : 10
    const bi = ORDER.has(norm(b.name)) ? ORDER.get(norm(b.name)) : 10
    if (ai !== bi) return ai - bi
    const diff = (Number(b.productCount || 0) - Number(a.productCount || 0))
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
  const LAST_PARENT_ID = 35
  const baseParents = orderedParents.filter(p => p.id !== LAST_PARENT_ID).slice(0, 4)
  const lastParent = orderedParents.find(p => p.id === LAST_PARENT_ID)
  const topParents = lastParent ? [...baseParents, lastParent] : baseParents

  return (
  <div className={isMobile ? 'w-full h-fit' : 'w-[22rem] sticky top-4 h-fit'}>
      <Card className={cn(isMobile ? 'bg-transparent border-0 shadow-none' : 'glass-card bg-white shadow-sm')}>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-gray-900 text-lg">
            <Filter className="h-5 w-5 text-blue-600" />
            Categorías
          </CardTitle>
          <p className="text-sm text-gray-600">{totalGlobal} productos en total</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <motion.div whileHover={{ x: 4 }} transition={{ duration: 0.2 }}>
            <Button
              variant={isAllSelected ? 'default' : 'ghost'}
              className={cn('w-full justify-between py-3.5 px-3 h-auto hover-lift text-[15px]', isAllSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-50 text-gray-700')}
              onClick={() => {
                setOpenValue('');
                setClearAllRequested(true);
                setPending({ categoryId: null, parentId: null });
                onBeforeSelect && onBeforeSelect('all')
                try { sessionStorage.setItem('curatedShuffle', String(Date.now())) } catch {}
                const sp = new URLSearchParams(searchParams.toString())
                sp.delete('categoryId')
                sp.delete('parentId')
                sp.delete('shuffle')
                sp.set('page', '1')
                router.push(`${pathname}?${sp.toString()}`)
              }}
            >
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4" />
                <span className="font-medium">Todos los productos</span>
              </div>
              <Badge variant={isAllSelected ? 'secondary' : 'outline'} className={cn('ml-2 rounded-full px-2.5 py-0.5 text-[12px]', isAllSelected ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-700')}>
                {totalGlobal}
              </Badge>
            </Button>
          </motion.div>

          <div className={cn('space-y-1', isMobile ? 'max-h-[55vh]' : 'max-h-[28rem]', 'overflow-y-auto')}>
            <Accordion type="single" collapsible className="w-full" value={openValue} onValueChange={setOpenValue}>
              {topParents.map((parent) => {
                const parentActive = !selectedCategoryId && selectedParentId === String(parent.id)
                const hasChildren = Array.isArray(parent.children) && parent.children.length > 0
                if (!hasChildren) {
                  return (
                    <div key={parent.id} className="px-0">
                      <motion.div whileHover={{ x: 4 }} transition={{ duration: 0.2 }}>
                        <Button
                          variant={parentActive ? 'default' : 'ghost'}
                          className={cn('w-full justify-between py-2.5 px-3 h-auto text-left hover-lift', parentActive ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-50 text-gray-700')}
                          onClick={() => { setOpenValue(''); setParam({ parentId: parent.id }) }}
                        >
                          <span className="font-medium truncate flex-1 text-left">{parent.name}</span>
                          <Badge variant={parentActive ? 'secondary' : 'outline'} className={cn('ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-[12px]', parentActive ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-700')}>
                            {parent.productCount || 0}
                          </Badge>
                        </Button>
                      </motion.div>
                    </div>
                  )
                }
                return (
                  <AccordionItem
                    key={parent.id}
                    value={`p-${parent.id}`}
                    className={cn(
                      'rounded-md transition-colors',
                      // subtle outline on the whole block when open
                      'data-[state=open]:bg-blue-50/40 data-[state=open]:ring-1 data-[state=open]:ring-blue-200/70'
                    )}
                  >
                    <AccordionTrigger
                      className={cn(
                        'px-2 py-2.5 rounded-md',
                        parentActive ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      <div className="w-full flex items-center justify-between pr-2" onClick={() => { setOpenValue(`p-${parent.id}`); setParam({ parentId: parent.id }) }}>
                        <span className="font-medium truncate flex-1 text-left">{parent.name}</span>
                        <Badge variant={parentActive ? 'secondary' : 'outline'} className={cn('ml-2 rounded-full px-2.5 py-0.5 text-[12px]', parentActive ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-700')}>
                          {parent.productCount || 0}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div
                        className={cn(
                          'space-y-1 p-2 rounded-md transition-colors',
                          // left border + soft background to signal children of this parent
                          openValue === `p-${parent.id}`
                            ? 'bg-blue-50/50 ring-1 ring-blue-200/60 border-l-2 border-blue-300'
                            : 'border-l-2 border-transparent'
                        )}
                      >
                        {parent.children.map((child) => {
                          const childActive = selectedCategoryId === String(child.id)
                          return (
                            <motion.div key={child.id} whileHover={{ x: 4 }} transition={{ duration: 0.2 }}>
                              <Button
                                variant={childActive ? 'default' : 'ghost'}
                                className={cn('w-full justify-between py-2.5 px-3 h-auto text-left hover-lift', childActive ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-50 text-gray-700')}
                                onClick={() => { setOpenValue(`p-${parent.id}`); setParam({ categoryId: child.id }) }}
                              >
                                <span className="truncate flex-1">{child.name}</span>
                                <Badge variant={childActive ? 'secondary' : 'outline'} className={cn('ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-[12px]', childActive ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-700')}>
                                  {child.productCount || 0}
                                </Badge>
                              </Button>
                            </motion.div>
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}