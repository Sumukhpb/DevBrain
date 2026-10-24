const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync, existsSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const mongoUri = process.env.MONGODB_TEST_URI
const options = mongoUri ? {} : { skip: 'Set MONGODB_TEST_URI to run MongoDB persistence tests.' }
let mongoose
let models
let auth
let repositories
let conversations

before(async () => {
  if (!mongoUri) return
  const databaseName = new URL(mongoUri).pathname.slice(1)
  if (!/test/i.test(databaseName)) throw new Error('MONGODB_TEST_URI must point to a database with "test" in its name.')
  process.env.MONGODB_URI = mongoUri
  mongoose = require('mongoose')
  models = require('../dist/db/models.js')
  auth = require('../dist/services/auth.service.js')
  repositories = require('../dist/services/repository.service.js')
  conversations = require('../dist/services/conversation.service.js')
  const { connectDatabase } = require('../dist/db/connection.js')
  await connectDatabase()
  await Promise.all(Object.values(models).map((model) => model.deleteMany({})))
})

after(async () => {
  if (!mongoUri || !mongoose) return
  await mongoose.disconnect()
})

test('registration stores a hash, creates a session, and revokes it on logout', options, async () => {
  const { register, login, getUserForSession, deleteSession } = auth
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

test('a user cannot read another user’s repository by guessing its ID', options, async () => {
  const repository = {
    id: 'private-repository-id', userId: 'owner-a', owner: 'owner', name: 'repo', fullName: 'owner/repo',
    description: null, branch: 'main', commitSha: 'abc123', url: 'https://github.com/owner/repo',
    indexedAt: new Date().toISOString(), files: [{ path: 'src/index.ts', language: 'TypeScript', content: 'secret source' }],
  }
  await models.RepositoryModel.create(repository)
  await assert.rejects(() => repositories.getRepository(repository.id, 'owner-b'), /not found/)
  assert.equal((await repositories.getRepository(repository.id, 'owner-a')).fullName, 'owner/repo')
})

test('conversation history is persisted and scoped to its repository owner', options, async () => {
  const { createConversation, getConversation, listConversations } = conversations
  const conversation = await createConversation('private-repository-id', 'owner-a', 'Where does auth happen?')
  assert.equal(conversation.title, 'Where does auth happen?')
  assert.equal((await listConversations('private-repository-id', 'owner-a'))[0].id, conversation.id)
  assert.equal((await getConversation(conversation.id, 'owner-a')).messages.length, 0)
  await assert.rejects(() => getConversation(conversation.id, 'owner-b'), /not found/)
})

test('legacy JSON data is imported once and the source files are preserved', options, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'devbrain-migration-'))
  try {
    const account = { id: 'legacy-user', email: 'legacy@example.com', salt: 'salt', passwordHash: 'hash', createdAt: new Date().toISOString() }
    const repository = {
      id: 'legacy-repository', userId: account.id, owner: 'owner', name: 'legacy', fullName: 'owner/legacy',
      description: null, branch: 'main', commitSha: 'abc', url: 'https://github.com/owner/legacy',
      indexedAt: new Date().toISOString(), files: [{ path: 'index.js', language: 'JavaScript', content: 'legacy source' }],
    }
    const conversation = {
      id: 'legacy-conversation', userId: account.id, repositoryId: repository.id, title: 'Legacy chat',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      messages: [{ id: 'legacy-message', role: 'user', content: 'hello', citations: [], createdAt: new Date().toISOString() }],
    }
    writeFileSync(path.join(directory, 'accounts.json'), JSON.stringify({ accounts: [account], sessions: [] }))
    writeFileSync(path.join(directory, 'repositories.json'), JSON.stringify([repository]))
    writeFileSync(path.join(directory, 'conversations.json'), JSON.stringify([conversation]))
    process.env.DATA_DIR = directory
    const { migrateJsonStores } = require('../dist/db/migrate-json.js')
    await migrateJsonStores()
    await migrateJsonStores()
    assert.equal(await models.UserModel.countDocuments({ id: account.id }), 1)
    assert.equal(await models.RepositoryModel.countDocuments({ id: repository.id }), 1)
    assert.equal(await models.ConversationModel.countDocuments({ id: conversation.id }), 1)
    assert.equal(await models.MessageModel.countDocuments({ id: 'legacy-message' }), 1)
    assert.equal(existsSync(path.join(directory, 'accounts.json')), true)
  } finally {
    delete process.env.DATA_DIR
    rmSync(directory, { recursive: true, force: true })
  }
})
