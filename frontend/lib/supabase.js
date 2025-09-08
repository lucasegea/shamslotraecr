import { createClient } from '@supabase/supabase-js'

// Lazy/safe client getter to avoid build-time crashes when envs are missing
let cachedClient = null

function createSafeClient() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

	// If envs are missing during build/SSR, avoid throwing synchronously
	if (!supabaseUrl || !supabaseAnonKey) {
		// Return a proxy that throws only when actually used at runtime
		return new Proxy(
			{},
			{
				get() {
					throw new Error(
						'Supabase client not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
					)
				},
			}
		)
	}

	return createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = new Proxy(
	{},
	{
		get(_target, prop) {
			if (!cachedClient) {
				cachedClient = createSafeClient()
			}
			// Forward all property accesses to the real client (or proxy)
			// eslint-disable-next-line no-unsafe-negation
			return cachedClient[prop]
		},
	}
)

// Public storage helper URL (may be undefined if URL is missing)
export const PRODUCT_STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
	? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/`
	: ''