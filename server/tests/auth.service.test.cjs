const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const dataDirectory = mkdtempSync(path.join(__dirname, 'tmp-'))
process.env.DATA_DIR = dataDirectory
const { register, login, getUserForSession, deleteSession } = require('../dist/services/auth.service.js')
const { getRepository } = require('../dist/services/repository.service.js')
const { createConversation, getConversation, listConversations } = require('../dist/services/conversation.service.js')

after(() => rmSync(dataDirectory, { recursive: true, force: true }))

test('registration stores a hash, creates a session, and revokes it on logout', async () => {
  const session = await register('Dev@example.com', 'a long secure passphrase')
  assert.equal(session.user.email, 'dev@example.com')
  assert.equal('passwordHash' in session.user, false)
  assert.equal((await getUserForSession(session.token)).id, session.user.id)
  await assert.rejects(() => register('dev@example.com', 'another long passphrase'), /already exists/)
  await assert.rejects(() => login('dev@example.com', 'incorrect password'), /incorrect/)
  const loggedIn = await login('DEV@example.com', 'a long secure passphrase')
  assert.equal(loggedIn.user.id, session.user.id)
  await deleteSession(loggedIn.token)
  assert.equal(await getUserForSession(loggedIn.token), null)
})

test('a user cannot read another user’s repository by guessing its ID', async () => {
  const repository = {
    id: 'private-repository-id', userId: 'owner-a', owner: 'owner', name: 'repo', fullName: 'owner/repo',
    description: null, branch: 'main', commitSha: 'abc123', url: 'https://github.com/owner/repo',
    indexedAt: new Date().toISOString(), files: [{ path: 'src/index.ts', language: 'TypeScript', content: 'secret source' }],
  }
  writeFileSync(path.join(dataDirectory, 'repositories.json'), JSON.stringify([repository]))
  await assert.rejects(() => getRepository(repository.id, 'owner-b'), /not found/)
  assert.equal((await getRepository(repository.id, 'owner-a')).fullName, 'owner/repo')
})

test('conversation history is persisted and scoped to its repository owner', async () => {
  const conversation = await createConversation('private-repository-id', 'owner-a', 'Where does auth happen?')
  assert.equal(conversation.title, 'Where does auth happen?')
  assert.equal((await listConversations('private-repository-id', 'owner-a'))[0].id, conversation.id)
  assert.equal((await getConversation(conversation.id, 'owner-a')).messages.length, 0)
  await assert.rejects(() => getConversation(conversation.id, 'owner-b'), /not found/)
})
