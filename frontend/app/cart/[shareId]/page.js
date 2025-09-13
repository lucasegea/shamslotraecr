import HomePage from '@/app/page'

export const dynamic = 'force-dynamic'

export default function CartSharePage() {
  // Reutilizamos la Home para que /cart/:id muestre la misma UI
  return <HomePage />
}
