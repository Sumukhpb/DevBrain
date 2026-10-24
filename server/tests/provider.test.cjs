const { test } = require('node:test')
const assert = require('node:assert/strict')
const { checkProviderHealth, createAnswer, createEmbeddings, embeddingConfiguration, selectedProvider } = require('../dist/ai/provider.js')

test('uses local Ollama for chat without an API key', async () => {
  const oldFetch = global.fetch
  process.env.AI_PROVIDER = 'ollama'
  delete process.env.OPENAI_API_KEY
  const calls = []
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) })
    return new Response(JSON.stringify({ message: { content: 'The route checks the session.' } }), { status: 200 })
  }
  try {
    const answer = await createAnswer([{ role: 'user', content: 'How does auth work?' }])
    assert.equal(answer, 'The route checks the session.')
    assert.equal(calls[0].url, 'http://localhost:11434/api/chat')
    assert.equal(calls[0].body.model, 'qwen2.5-coder:3b')
    assert.equal(calls[0].body.stream, false)
  } finally { global.fetch = oldFetch }
})

test('uses configured local embedding model and verifies vector dimensions', async () => {
  const oldFetch = global.fetch
  process.env.AI_PROVIDER = 'ollama'
  process.env.OLLAMA_EMBEDDING_DIMENSIONS = '3'
  global.fetch = async (url, options) => {
    assert.equal(String(url), 'http://localhost:11434/api/embed')
    const body = JSON.parse(options.body)
    assert.deepEqual(body.input, ['one', 'two'])
    return new Response(JSON.stringify({ embeddings: [[1, 0, 0], [0, 1, 0]] }), { status: 200 })
  }
  try {
    assert.equal(selectedProvider(), 'ollama')
    assert.deepEqual(embeddingConfiguration(), { model: 'embeddinggemma', dimensions: 3 })
    assert.deepEqual(await createEmbeddings(['one', 'two']), [[1, 0, 0], [0, 1, 0]])
  } finally {
    global.fetch = oldFetch
    delete process.env.OLLAMA_EMBEDDING_DIMENSIONS
  }
})

test('rejects embedding responses that do not match the configured collection size', async () => {
  const oldFetch = global.fetch
  process.env.AI_PROVIDER = 'ollama'
  process.env.OLLAMA_EMBEDDING_DIMENSIONS = '2'
  global.fetch = async () => new Response(JSON.stringify({ embeddings: [[1, 0, 0]] }), { status: 200 })
  try {
    await assert.rejects(createEmbeddings(['one']), /dimensions did not match/)
  } finally {
    global.fetch = oldFetch
    delete process.env.OLLAMA_EMBEDDING_DIMENSIONS
  }
})

test('reports when Ollama is running but the configured chat model is missing', async () => {
  const oldFetch = global.fetch
  process.env.AI_PROVIDER = 'ollama'
  process.env.OLLAMA_CHAT_MODEL = 'qwen2.5-coder:3b'
  global.fetch = async (url) => {
    assert.equal(String(url), 'http://localhost:11434/api/tags')
    return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), { status: 200 })
  }
  try {
    const health = await checkProviderHealth()
    assert.equal(health.ready, false)
    assert.equal(health.status, 'model_missing')
    assert.match(health.message, /ollama pull qwen2\.5-coder:3b/)
  } finally {
    global.fetch = oldFetch
    delete process.env.OLLAMA_CHAT_MODEL
  }
})

test('reports a ready Ollama service when the configured chat model is installed', async () => {
  const oldFetch = global.fetch
  process.env.AI_PROVIDER = 'ollama'
  process.env.OLLAMA_CHAT_MODEL = 'qwen2.5-coder:3b'
  global.fetch = async () => new Response(JSON.stringify({ models: [{ name: 'qwen2.5-coder:3b' }] }), { status: 200 })
  try {
    const health = await checkProviderHealth()
    assert.equal(health.ready, true)
    assert.equal(health.status, 'ready')
  } finally {
    global.fetch = oldFetch
    delete process.env.OLLAMA_CHAT_MODEL
  }
})

test('distinguishes Ollama connection failures from request timeouts', async () => {
  const oldFetch = global.fetch
  process.env.AI_PROVIDER = 'ollama'
  global.fetch = async () => { throw new DOMException('request timed out', 'TimeoutError') }
  try {
    assert.equal((await checkProviderHealth()).status, 'timeout')
    await assert.rejects(createAnswer([{ role: 'user', content: 'hello' }]), /took too long.*retry/i)
  } finally { global.fetch = oldFetch }
})
