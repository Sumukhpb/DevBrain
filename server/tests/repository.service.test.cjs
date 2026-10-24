const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseGitHubUrl, splitIntoChunks, scoreChunk } = require('../dist/services/repository.service.js')

test('accepts only a public GitHub repository URL', () => {
  assert.deepEqual(parseGitHubUrl('https://github.com/facebook/react.git'), { owner: 'facebook', name: 'react' })
  for (const url of [
    'http://github.com/owner/repo',
    'https://github.com.evil.test/owner/repo',
    'https://github.com/owner/repo/extra',
    'https://attacker@github.com/owner/repo',
    'https://github.com/owner%2Frepo',
  ]) assert.throws(() => parseGitHubUrl(url), /GitHub|valid/i, url)
})

test('chunks source with overlapping, accurate line ranges', () => {
  const content = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n')
  const chunks = splitIntoChunks({ path: 'src/main.ts', language: 'TypeScript', content })
  assert.equal(chunks.length, 2)
  assert.deepEqual(chunks.map(({ startLine, endLine }) => [startLine, endLine]), [[1, 70], [61, 100]])
  assert.equal(chunks[1].text.split('\n')[0], 'line 61')
})

test('caps chunk payloads even when a source line is exceptionally long', () => {
  const chunks = splitIntoChunks({ path: 'generated.ts', language: 'TypeScript', content: 'x'.repeat(18_000) })
  assert.equal(chunks.length, 3)
  assert.ok(chunks.every(({ text }) => text.length <= 6_000))
  assert.ok(chunks.every(({ startLine, endLine }) => startLine === 1 && endLine === 1))
})

test('ranks matching file paths and source terms above unrelated source', () => {
  const [matching] = splitIntoChunks({ path: 'src/auth/session.ts', language: 'TypeScript', content: 'export function createSession() { return true }' })
  const [unrelated] = splitIntoChunks({ path: 'src/ui/button.tsx', language: 'TypeScript React', content: 'export function Button() { return null }' })
  assert.ok(scoreChunk('Where is the auth session created?', matching) > scoreChunk('Where is the auth session created?', unrelated))
})

test('ignores filler words so unrelated text cannot match a generic question', () => {
  const [noise] = splitIntoChunks({ path: 'package-lock.json', language: 'JSON', content: 'bcrypt is a package used for password hashing and Node versions.' })
  assert.equal(scoreChunk('Where is the main application entry point?', noise), 0)
})

test('matches natural authentication questions to auth code and entry-point questions to index files', () => {
  const [auth] = splitIntoChunks({ path: 'controllers/authController.js', language: 'JavaScript', content: 'function checkForAuthentication() { return true }' })
  const [entry] = splitIntoChunks({ path: 'backend/index.js', language: 'JavaScript', content: 'const app = express(); app.listen(3000)' })
  assert.ok(scoreChunk('How does authentication work?', auth) > 0)
  assert.ok(scoreChunk('Where is the main application entry point?', entry) >= 2)
})
