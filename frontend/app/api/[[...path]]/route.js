import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

// MongoDB connection
let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
  }
  return db
}

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // Root endpoint - GET /api/root (since /api/ is not accessible with catch-all)
    if (route === '/root' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "Hello World" }))
    }
    // Root endpoint - GET /api/root (since /api/ is not accessible with catch-all)
    if (route === '/' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "Hello World" }))
    }

  // Status endpoints - POST /api/status
    if (route === '/status' && method === 'POST') {
      const body = await request.json()
      
      if (!body.client_name) {
        return handleCORS(NextResponse.json(
          { error: "client_name is required" }, 
          { status: 400 }
        ))
      }

      const statusObj = {
        id: uuidv4(),
        client_name: body.client_name,
        timestamp: new Date()
      }

      await db.collection('status_checks').insertOne(statusObj)
      return handleCORS(NextResponse.json(statusObj))
    }

    // Cart endpoints
    // POST /api/cart -> create a new shared cart
    if (route === '/cart' && method === 'POST') {
      const body = await request.json()
      const items = Array.isArray(body?.items) ? body.items : [] // [[id, qty], ...]
      const cart = {
        id: uuidv4(),
        items,
        created_at: new Date(),
        updated_at: new Date(),
      }
      await db.collection('carts').insertOne(cart)
      return handleCORS(NextResponse.json({ id: cart.id }))
    }

    // GET /api/cart/:id -> fetch cart
    if (route.startsWith('/cart/') && method === 'GET') {
      const id = route.split('/')[2]
      if (!id) return handleCORS(NextResponse.json({ error: 'Missing id' }, { status: 400 }))
      const cart = await db.collection('carts').findOne({ id })
      if (!cart) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const { _id, ...clean } = cart
      return handleCORS(NextResponse.json(clean))
    }

    // PUT /api/cart/:id -> create or update existing cart (idempotent)
    if (route.startsWith('/cart/') && method === 'PUT') {
      const id = route.split('/')[2]
    const body = await request.json()
    const items = Array.isArray(body?.items) ? body.items : []
    const details = Array.isArray(body?.details) ? body.details : []
      if (!id) return handleCORS(NextResponse.json({ error: 'Missing id' }, { status: 400 }))
      await db.collection('carts').updateOne(
        { id },
        {
      $set: { items, details, updated_at: new Date() },
          $setOnInsert: { id, created_at: new Date() }
        },
        { upsert: true }
      )
      const updated = await db.collection('carts').findOne({ id })
      const { _id, ...clean } = updated || { id }
      return handleCORS(NextResponse.json(clean))
    }

    // Status endpoints - GET /api/status
    if (route === '/status' && method === 'GET') {
      const statusChecks = await db.collection('status_checks')
        .find({})
        .limit(1000)
        .toArray()

      // Remove MongoDB's _id field from response
      const cleanedStatusChecks = statusChecks.map(({ _id, ...rest }) => rest)
      
      return handleCORS(NextResponse.json(cleanedStatusChecks))
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` }, 
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute