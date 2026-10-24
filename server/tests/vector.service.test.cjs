const { test } = require('node:test')
const assert = require('node:assert/strict')

process.env.OPENAI_API_KEY = 'test-key'
process.env.AI_PROVIDER = 'openai'
process.env.QDRANT_URL = 'http://qdrant.test'
process.env.OPENAI_EMBEDDING_DIMENSIONS = '1536'
const { indexCodeChunks, searchCodeChunks } = require('../dist/ai/vector.service.js')
const embedding = Array(1536).fill(0.25)

test('stores vectors with user/repository/commit metadata and removes obsolete revisions', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ url: String(url), method, body })
    if (method === 'GET') return new Response('{}', { status: 404 })
    if (String(url).startsWith('https://api.openai.com')) return new Response(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding })) }), { status: 200 })
    return new Response('{}', { status: 200 })
  }
  try {
    const indexed = await indexCodeChunks('user-1', 'repo-1', 'commit-new', [
      { filePath: 'src/auth.ts', language: 'TypeScript', startLine: 1, endLine: 8, text: 'secure source' },
    ])
    assert.equal(indexed, true)
    const upsert = calls.find(({ method, url }) => method === 'PUT' && url.includes('/points?wait=true'))
    assert.equal(upsert.body.points[0].payload.user_id, 'user-1')
    assert.equal(upsert.body.points[0].payload.repository_id, 'repo-1')
    assert.equal(upsert.body.points[0].payload.commit_sha, 'commit-new')
    const cleanup = calls.find(({ url }) => url.includes('/points/delete'))
    assert.deepEqual(cleanup.body.filter.must.map(({ key, match }) => [key, match.value]), [['user_id', 'user-1'], ['repository_id', 'repo-1']])
  } finally { global.fetch = originalFetch }
})

test('search filters vector retrieval to the current user, repository, and commit', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ url: String(url), body })
    if (String(url).startsWith('https://api.openai.com')) return new Response(JSON.stringify({ data: [{ index: 0, embedding }] }), { status: 200 })
    if (String(url).endsWith('/points/query')) return new Response(JSON.stringify({ result: { points: [{ score: 0.91, payload: { file_path: 'src/auth.ts', language: 'TypeScript', start_line: 3, end_line: 12, text: 'matched source' } }] } }), { status: 200 })
    return new Response('{}', { status: 200 })
  }
  try {
    const results = await searchCodeChunks('user-2', 'repo-2', 'commit-2', 'authentication flow')
    const query = calls.find(({ url }) => url.endsWith('/points/query'))
    assert.deepEqual(query.body.filter.must.map(({ key, match }) => [key, match.value]), [
      ['user_id', 'user-2'], ['repository_id', 'repo-2'], ['commit_sha', 'commit-2'],
    ])
    assert.deepEqual(results[0], { filePath: 'src/auth.ts', language: 'TypeScript', startLine: 3, endLine: 12, text: 'matched source', score: 0.91 })
  } finally { global.fetch = originalFetch }
})
