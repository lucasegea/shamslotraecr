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
  const providedQty = Number(body?.totalQty)
  const computedFromSeed = seed.reduce((s, [, q]) => s + (Number(q) || 0), 0)
  const now = new Date().toISOString()
  if (!shareId) return badRequest('Missing shareId')
  try {
    const cart = await ensureCart(db, shareId)
    const { count, error: cErr } = await db.from('cart_items').select('*', { count: 'exact', head: true }).eq('cart_id', cart.id)
    if (cErr) throw cErr
    // If cart already has items or seed is empty, still update quantity_items if provided/derivable and exit
    if ((count || 0) > 0 || seed.length === 0) {
      try {
        // Determine quantity to set: prefer provided, else compute from DB
        let qtyToSet = Number.isFinite(providedQty) ? providedQty : (computedFromSeed || null)
        if (!Number.isFinite(qtyToSet)) {
          const { data: rows } = await db.from('cart_items').select('qty').eq('cart_id', cart.id)
          qtyToSet = (rows || []).reduce((s, r) => s + (Number(r.qty) || 0), 0)
        }
        await db.from('carts').update({ updated_at: now, quantity_items: qtyToSet }).eq('id', cart.id)
      } catch {}
      return new NextResponse(null, { status: 204 })
    }
    const ids = seed.map(([pid]) => pid)
    let snapshots = []
    if (ids.length) {
      const { data: prods } = await db.from('products').select('id, name, product_url, image_url, image_file_url, final_price, price_raw, currency').in('id', ids)
      const byId = new Map((prods || []).map(p => [p.id, p]))
      snapshots = seed.map(([pid, qty]) => ({ cart_id: cart.id, product_id: pid, qty, snapshot: byId.get(pid) || null }))
    }
    // Use insert for seed to avoid depending on a unique constraint during first write
  const { error: insErr } = await db.from('cart_items').insert(snapshots)
    if (insErr) throw insErr
  const qtyToSet = Number.isFinite(providedQty) ? providedQty : computedFromSeed
  const { error: upErr } = await db.from('carts').update({ updated_at: now, revision: (cart.revision || 0) + 1, quantity_items: qtyToSet }).eq('id', cart.id)
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
        // Try upsert using (cart_id,product_id). If the table lacks a unique constraint, fallback to delete+insert
        const tryUpsert = await db.from('cart_items').upsert(row, { onConflict: 'cart_id,product_id' })
        if (tryUpsert.error) {
          // Fallback: delete then insert
          await db.from('cart_items').delete().eq('cart_id', cart.id).eq('product_id', op.productId)
          const { error: ins2 } = await db.from('cart_items').insert(row)
          if (ins2) throw ins2
        }
      } else if (op.op === 'remove') {
        if (!op.productId) continue
        const { error } = await db.from('cart_items').delete().eq('cart_id', cart.id).eq('product_id', op.productId)
        if (error) throw error
      }
    }
  // Compute new total quantity
  const { data: allItems } = await db.from('cart_items').select('qty').eq('cart_id', cart.id)
  const sumQty = (allItems || []).reduce((s, r) => s + (Number(r.qty) || 0), 0)
  const { error: upErr } = await db.from('carts').update({ updated_at: new Date().toISOString(), revision: currentRev + 1, quantity_items: sumQty }).eq('id', cart.id)
    if (upErr) throw upErr
    const { data: updatedCart } = await db.from('carts').select('*').eq('id', cart.id).single()
    const { data: items } = await db.from('cart_items').select('*').eq('cart_id', cart.id)
    return new NextResponse(JSON.stringify({ items, revision: updatedCart.revision }), { status: 200, headers: { 'Content-Type': 'application/json', 'ETag': `W/"${updatedCart.revision}"` } })
  } catch (e) {
    return badRequest(e?.message || 'Patch failed')
  }
}
