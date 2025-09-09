export const dynamic = 'force-dynamic'

export default function TestSupabasePage() {
	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="text-2xl font-bold">Test Supabase</h1>
			<p className="text-muted-foreground mt-2">Ruta temporal para pruebas. (No se ejecuta en build)</p>
		</div>
	)
}
