import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Ensure Node.js runtime (required for service role key usage) and disable caching
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse('Not found', { status: 404 })
const badRequest = (msg='Bad request') => new NextResponse(msg, { status: 400 })
const conflict = (body) => new NextResponse(JSON.stringify(body || {}), { status: 409, headers: { 'Content-Type': 'application/json' } })

async function ensureCart(db, shareId) {
  let { data: cart, error } = await db.from('carts').select('*').eq('share_id', shareId).maybeSingle()
  if (error) throw error
  if (!cart) {
    const { data: created, error: cErr } = await db.from('carts').insert({ share_id: shareId }).select('*').single()
    if (cErr) throw cErr
    cart = created
  }
  return cart
}

export async function GET(_req, { params }) {
  const db = getSupabaseAdmin()
  if (!db) return badRequest('Missing SUPABASE service credentials (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
  const shareId = params?.shareId
  if (!shareId) return badRequest('Missing shareId')
  const { data: cart, error } = await db.from('carts').select('*').eq('share_id', shareId).maybeSingle()
  if (error) return badRequest(error.message)
  if (!cart) return notFound()
  const { data: items, error: iErr } = await db.from('cart_items').select('*').eq('cart_id', cart.id)
  if (iErr) return badRequest(iErr.message)
  return new NextResponse(JSON.stringify({ cart: { id: cart.id, shareId: cart.share_id, title: cart.title }, items, revision: cart.revision }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'ETag': `W/"${cart.revision}"` }
  })
}

// POST /api/cart/:shareId?action=seed
export async function POST(req, { params }) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const shareId = params?.shareId
  if (action !== 'seed') return badRequest('Use PATCH for updates or add ?action=seed')
  const db = getSupabaseAdmin()
  if (!db) return badRequest('Missing SUPABASE service credentials (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
  const body = await req.json().catch(() => ({}))
  const seed = Array.isArray(body?.seed) ? body.seed : []
  if (!shareId) return badRequest('Missing shareId')
  try {
    const cart = await ensureCart(db, shareId)
    const { count, error: cErr } = await db.from('cart_items').select('*', { count: 'exact', head: true }).eq('cart_id', cart.id)
    if (cErr) throw cErr
    if ((count || 0) > 0 || seed.length === 0) {
      return new NextResponse(null, { status: 204 })
    }
    const ids = seed.map(([pid]) => pid)
    let snapshots = []
    if (ids.length) {
      const { data: prods } = await db.from('products').select('id, name, product_url, image_url, image_file_url, final_price, price_raw, currency').in('id', ids)
      const byId = new Map((prods || []).map(p => [p.id, p]))
      snapshots = seed.map(([pid, qty]) => ({ cart_id: cart.id, product_id: pid, qty, snapshot: byId.get(pid) || null }))
    }
    const { error: insErr } = await db.from('cart_items').upsert(snapshots, { onConflict: 'cart_id,product_id' })
    if (insErr) throw insErr
    const { error: upErr } = await db.from('carts').update({ updated_at: new Date().toISOString() }).eq('id', cart.id)
    if (upErr) throw upErr
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return badRequest(e?.message || 'Seed failed')
  }
}

// PATCH /api/cart/:shareId
export async function PATCH(req, { params }) {
  const db = getSupabaseAdmin()
  if (!db) return badRequest('Missing SUPABASE service credentials (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
  const shareId = params?.shareId
  if (!shareId) return badRequest('Missing shareId')
  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.ops)) return badRequest('Missing ops')
  try {
    const cart = await ensureCart(db, shareId)
    const currentRev = cart.revision || 0
    const ifRev = typeof body.ifRevision === 'number' ? body.ifRevision : currentRev
    if (ifRev !== currentRev) {
      const { data: items } = await db.from('cart_items').select('*').eq('cart_id', cart.id)
      return conflict({ items, revision: currentRev })
    }
    for (const op of body.ops) {
      if (op.op === 'upsert') {
        if (!op.productId || !(op.qty > 0)) continue
        const row = { cart_id: cart.id, product_id: op.productId, qty: op.qty, snapshot: op.snapshot || null }
        const { error } = await db.from('cart_items').upsert(row, { onConflict: 'cart_id,product_id' })
        if (error) throw error
      } else if (op.op === 'remove') {
        if (!op.productId) continue
        const { error } = await db.from('cart_items').delete().eq('cart_id', cart.id).eq('product_id', op.productId)
        if (error) throw error
      }
    }
    const { error: upErr } = await db.from('carts').update({ updated_at: new Date().toISOString() }).eq('id', cart.id)
    if (upErr) throw upErr
    const { data: updatedCart } = await db.from('carts').select('*').eq('id', cart.id).single()
    const { data: items } = await db.from('cart_items').select('*').eq('cart_id', cart.id)
    return new NextResponse(JSON.stringify({ items, revision: updatedCart.revision }), { status: 200, headers: { 'Content-Type': 'application/json', 'ETag': `W/"${updatedCart.revision}"` } })
  } catch (e) {
    return badRequest(e?.message || 'Patch failed')
  }
}
