export const dynamic = 'force-dynamic'

export default function CartSharePage({ params }) {
  // Esta página existe para URL canónica /cart/:shareId.
  // El Home ya detecta /cart/:id y carga ese carrito.
  // Renderizamos un contenedor mínimo para evitar duplicar lógica.
  return null
}
