const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')

const testUri = process.env.MONGODB_TEST_URI
const options = testUri ? {} : { skip: 'Set MONGODB_TEST_URI to run API end-to-end tests.' }
let mongoose
let models
let closeDatabase
let closeIndexQueue
let server
let cookie
let repositoryId
let originalFetch
let chatResponseCount = 0

before(async () => {
  if (!testUri) return
  const uri = new URL(testUri)
  const databaseName = uri.pathname.slice(1)
  if (!/test/i.test(databaseName)) throw new Error('MONGODB_TEST_URI must point to a database with "test" in its name.')
  uri.pathname = `/${databaseName}_api_e2e_test`
  process.env.MONGODB_URI = uri.toString()
  process.env.AI_PROVIDER = 'ollama'
  process.env.OLLAMA_BASE_URL = 'http://ollama.test'
  delete process.env.QDRANT_URL

  mongoose = require('mongoose')
  models = require('../dist/db/models.js')
  const database = require('../dist/db/connection.js')
  closeDatabase = database.closeDatabase
  await database.connectDatabase()
  await Promise.all(Object.values(models).map((model) => model.deleteMany({})))
  const queue = require('../dist/jobs/indexing.queue.js')
  closeIndexQueue = queue.closeIndexQueue
  const app = require('../dist/app.js').default
  server = app.listen(0)
  await once(server, 'listening')
  const address = server.address()
  process.env.API_E2E_BASE_URL = `http://127.0.0.1:${address.port}`

  originalFetch = global.fetch
  global.fetch = async (url, init) => {
    if (String(url).startsWith('http://ollama.test/api/chat')) {
      const content = chatResponseCount++ === 0
        ? 'The authenticate function validates credentials in this excerpt [1].'
        : 'The code defines an authenticate function for handling authentication.'
      return new Response(JSON.stringify({ message: { content } }), { status: 200 })
    }
    return originalFetch(url, init)
  }
})

after(async () => {
  if (!testUri) return
  global.fetch = originalFetch
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (closeIndexQueue) await closeIndexQueue()
  if (closeDatabase) await closeDatabase()
  if (mongoose) await mongoose.disconnect()
})

test('HTTP flow registers, asks about stored repository source, persists chat, and logs out', options, async () => {
  const base = process.env.API_E2E_BASE_URL
  const request = (path, body, method = 'GET', useCookie = true) => fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-DevBrain-Request': '1' } : {}),
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const registration = await request('/auth/register', { email: 'e2e@example.com', password: 'a long secure passphrase' }, 'POST', false)
  assert.equal(registration.status, 201)
  const setCookie = registration.headers.get('set-cookie')
  assert.ok(setCookie)
  cookie = setCookie.split(';', 1)[0]
  const { user } = await registration.json()
  assert.equal(user.email, 'e2e@example.com')

  repositoryId = 'api-e2e-repository'
  await models.RepositoryModel.create({
    id: repositoryId, userId: user.id, owner: 'sample', name: 'app', fullName: 'sample/app',
    description: null, branch: 'main', commitSha: 'abc123', url: 'https://github.com/sample/app',
    indexedAt: new Date().toISOString(), vectorIndexed: false,
    files: [{ path: 'src/auth.ts', language: 'TypeScript', content: 'export function authenticate() { /* authentication handler */ }' }],
  })

  const createdResponse = await request('/conversations', { repositoryId, title: 'Authentication' }, 'POST')
  assert.equal(createdResponse.status, 201)
  const { conversation } = await createdResponse.json()
  const answerResponse = await request(`/conversations/${conversation.id}/messages`, { question: 'How does authentication work?' }, 'POST')
  assert.equal(answerResponse.status, 200)
  const answer = await answerResponse.json()
  assert.match(answer.answer, /authenticate.*\[1\]/i)
  assert.equal(answer.citations[0].filePath, 'src/auth.ts')

  const uncitedResponse = await request(`/conversations/${conversation.id}/messages`, { question: 'What does the authentication code do?' }, 'POST')
  const uncited = await uncitedResponse.json()
  assert.match(uncited.answer, /Unverified model response: The code defines an authenticate function/)
  assert.equal(uncited.citations[0].filePath, 'src/auth.ts', 'show retrieved source links even when the model omits citation markers')

  const savedResponse = await request(`/conversations/${conversation.id}`)
  const saved = await savedResponse.json()
  assert.equal(saved.conversation.messages.length, 4)
  assert.equal(saved.conversation.messages[1].citations[0].filePath, 'src/auth.ts')
  assert.equal(saved.conversation.messages[3].citations[0].filePath, 'src/auth.ts')

  const logout = await request('/auth/logout', {}, 'POST')
  assert.equal(logout.status, 204)
  const afterLogout = await request('/auth/me', undefined, 'GET', false)
  assert.equal(afterLogout.status, 401)
})
