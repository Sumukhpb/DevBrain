import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Repository = { id: string; fullName: string; description: string | null; branch: string; commitSha: string; indexedAt: string; fileCount: number; url: string; vectorIndexed?: boolean }
type User = { id: string; email: string }
type RepoDetail = Repository & { files: { path: string; language: string }[] }
type Message = { role: 'user' | 'assistant'; content: string; citations?: { filePath: string; startLine: number; endLine: number; url: string }[] }
type SourceFile = { path: string; language: string; content: string; commitSha: string }
type ConversationSummary = { id: string; title: string; updatedAt: string; messageCount: number }
type IndexJob = { state: string; progress: number | object; repository?: Repository; error?: string }
type AiHealth = { provider: string; ready: boolean; status: string; message: string; chatModel?: string }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-DevBrain-Request': '1', ...options?.headers } })
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`)
  return payload
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  if (name === 'github') return <svg {...common}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
  if (name === 'branch') return <svg {...common}><circle cx="6" cy="3" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="21" r="2" /><path d="M6 5v14m12-11a9 9 0 0 1-9 9" /></svg>
  if (name === 'file') return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></svg>
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14m-7-7h14" /></svg>
  if (name === 'arrow') return <svg {...common}><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
  if (name === 'send') return <svg {...common}><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></svg>
  if (name === 'external') return <svg {...common}><path d="M14 3h7v7m0-7-10 10" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
}

function App() {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<RepoDetail | null>(null)
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState('')
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [file, setFile] = useState<SourceFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState('')
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null)
  const [aiChecking, setAiChecking] = useState(false)
  const [failedQuestion, setFailedQuestion] = useState('')

  const checkAiStatus = useCallback(async () => {
    setAiChecking(true)
    try {
      const result = await api<{ ai: AiHealth }>('/health/ai')
      setAiHealth(result.ai)
    } catch {
      setAiHealth({ provider: 'AI provider', ready: false, status: 'unreachable', message: 'Could not check AI provider status. Confirm the API server is running, then try again.' })
    } finally { setAiChecking(false) }
  }, [])

  const refresh = async () => {
    const result = await api<{ repositories: Repository[] }>('/repositories')
    setRepositories(result.repositories)
  }

  function selectRepository(id: string) {
    setSelectedId(id)
    setDetail(null)
    setMessages([])
    setFile(null)
    setConversationId('')
    setConversations([])
    setError('')
    setFailedQuestion('')
  }

  useEffect(() => {
    let active = true
    api<{ user: User }>('/auth/me')
      .then(({ user: currentUser }) => { if (active) setUser(currentUser) })
      .catch(() => {})
      .finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!user) return
    let active = true
    api<{ repositories: Repository[] }>('/repositories')
      .then(({ repositories: loaded }) => { if (active) setRepositories(loaded) })
      .catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [user])
  useEffect(() => {
    if (!selectedId) return
    let active = true
    Promise.all([
      api<{ repository: RepoDetail }>(`/repositories/${selectedId}`),
      api<{ conversations: ConversationSummary[] }>(`/conversations?repositoryId=${encodeURIComponent(selectedId)}`),
    ]).then(async ([{ repository }, { conversations: savedConversations }]) => {
      if (!active) return
      setDetail(repository); setConversations(savedConversations)
      if (savedConversations[0]) {
        setConversationId(savedConversations[0].id)
        const saved = await api<{ conversation: { messages: Message[] } }>(`/conversations/${savedConversations[0].id}`)
        if (active) setMessages(saved.conversation.messages)
      }
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    const initialCheck = window.setTimeout(() => { void checkAiStatus() }, 0)
    const interval = window.setInterval(() => { void checkAiStatus() }, 30_000)
    return () => { window.clearTimeout(initialCheck); window.clearInterval(interval) }
  }, [selectedId, checkAiStatus])

  const visibleFiles = useMemo(() => (detail?.files ?? []).filter((item) => item.path.toLowerCase().includes(search.toLowerCase())).slice(0, 100), [detail, search])

  async function handleImport(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setImportProgress(0); setImportStatus('')
    try {
      const { jobId } = await api<{ jobId: string }>('/repositories', { method: 'POST', body: JSON.stringify({ url, branch: branch || undefined }) })
      setImportStatus('Repository indexing queued…')
      const deadline = Date.now() + 20 * 60_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000))
        const { job } = await api<{ job: IndexJob }>(`/jobs/${jobId}`)
        if (typeof job.progress === 'number') setImportProgress(job.progress)
        if (job.state === 'waiting' || job.state === 'delayed' || job.state === 'paused') setImportStatus('Waiting for an indexing worker…')
        else if (job.state === 'active') setImportStatus('Fetching and indexing source files…')
        else if (job.state === 'failed') throw new Error(job.error || 'Repository indexing failed after retrying.')
        else if (job.state === 'completed' && job.repository) {
          await refresh(); selectRepository(job.repository.id); setUrl(''); setBranch(''); setShowImport(false); return
        }
      }
      throw new Error('Indexing is taking longer than expected. The worker may still finish; check Redis and the worker terminal.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import repository.') } finally { setBusy(false); setImportStatus(''); setImportProgress(0) }
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<{ user: User }>(`/auth/${authMode}`, { method: 'POST', body: JSON.stringify({ email: authEmail, password: authPassword }) })
      setUser(result.user); setAuthPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.') } finally { setBusy(false) }
  }

  async function handleLogout() {
    try { await api('/auth/logout', { method: 'POST' }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign out while the API is unavailable.'); return }
    setUser(null); selectRepository(''); setRepositories([])
  }

  async function openFile(path: string) {
    if (!detail) return
    try {
      const result = await api<{ file: SourceFile }>(`/repositories/${detail.id}/files?path=${encodeURIComponent(path)}`)
      setFile(result.file); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load file.') }
  }

  async function ask(event: FormEvent) {
    event.preventDefault(); if (!detail || !question.trim() || busy) return
    const asked = question.trim(); setQuestion(''); setFailedQuestion(''); setMessages((current) => [...current, { role: 'user', content: asked }]);
    await submitQuestion(asked)
  }

  async function submitQuestion(asked: string) {
    if (!detail) return
    setBusy(true); setError('')
    try {
      let targetId = conversationId
      if (!targetId) {
        const created = await api<{ conversation: ConversationSummary }>('/conversations', { method: 'POST', body: JSON.stringify({ repositoryId: detail.id, title: asked }) })
        targetId = created.conversation.id; setConversationId(targetId)
      }
      const result = await api<{ answer: string; citations: Message['citations'] }>(`/conversations/${targetId}/messages`, { method: 'POST', body: JSON.stringify({ question: asked }) })
      setMessages((current) => [...current, { role: 'assistant', content: result.answer, citations: result.citations }])
      setFailedQuestion('')
      try {
        const updated = await api<{ conversations: ConversationSummary[] }>(`/conversations?repositoryId=${encodeURIComponent(detail.id)}`)
        setConversations(updated.conversations)
      } catch { /* The answer succeeded; refreshing the conversation list is best-effort. */ }
      void checkAiStatus()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not answer that question.'
      setError(message); setFailedQuestion(asked)
      void checkAiStatus()
    } finally { setBusy(false) }
  }

  async function retryFailedQuestion() {
    if (!failedQuestion || busy) return
    const retryQuestionText = failedQuestion
    setFailedQuestion('')
    await submitQuestion(retryQuestionText)
  }

  async function openConversation(id: string) {
    setFailedQuestion(''); setError('')
    setConversationId(id)
    try {
      const saved = await api<{ conversation: { messages: Message[] } }>(`/conversations/${id}`)
      setMessages(saved.conversation.messages)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load conversation.') }
  }

  if (authLoading) return <div className="auth-loading"><span className="brand-mark"><Icon name="spark" size={20} /></span><span>Checking your session…</span></div>

  if (!user) return <div className="auth-shell"><div className="auth-art"><a className="brand" href="#login"><span className="brand-mark"><Icon name="spark" size={20} /></span><span>devbrain<span className="brand-period">.</span></span></a><div className="auth-art-main"><div className="eyebrow"><span className="eyebrow-line" /> CODEBASE INTELLIGENCE</div><h1>Every codebase<br />has a <span>story.</span></h1><p>Trace the connections. Understand the architecture. Get answers grounded in the code itself.</p><div className="auth-code-card"><div><i /><i /><i /><span>src / services / auth.ts</span></div><pre><span className="code-purple">export async function</span> <span className="code-green">authenticate</span>(user) {'{'}<br />  <span className="code-purple">const</span> session = <span className="code-blue">await</span> createSession(user)<br />  <span className="code-purple">return</span> {'{'} user, session {'}'}<br />{'}'}</pre><span className="auth-code-caption"><Icon name="spark" size={13} /> A clearer view of the code you work with</span></div></div><div className="auth-art-footer">PRIVATE WORKSPACE <span>·</span> REPOSITORIES STAY YOURS</div></div><div className="auth-form-side"><form className="auth-form" onSubmit={handleAuth}><div className="auth-form-kicker">YOUR WORKSPACE</div><h2>{authMode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p>{authMode === 'register' ? 'Start exploring code with context.' : 'Sign in to continue to your repositories.'}</p><label>Email address<input autoFocus autoComplete="email" type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} type="password" minLength={authMode === 'register' ? 12 : undefined} maxLength={128} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder={authMode === 'register' ? 'At least 12 characters' : 'Your password'} /></label>{error && <div className="auth-error"><Icon name="alert" size={15} /> {error}</div>}<button className="button-primary auth-submit" disabled={busy}>{busy ? <><span className="spinner" /> Please wait…</> : <>{authMode === 'register' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={16} /></>}</button><div className="auth-toggle">{authMode === 'register' ? 'Already have an account?' : 'New to DevBrain?'} <button type="button" onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setError('') }}>{authMode === 'register' ? 'Sign in' : 'Create an account'}</button></div><div className="auth-security"><span><Icon name="branch" size={13} /> PRIVATE REPOSITORY SPACE</span><span>Passwords are securely hashed</span></div></form></div></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); selectRepository('') }}><span className="brand-mark"><Icon name="spark" size={20} /></span><span>devbrain<span className="brand-period">.</span></span></a>
      <div className="workspace-label">WORKSPACE <span className="workspace-dot" /></div>
      <button className={`nav-link ${!selectedId ? 'active' : ''}`} onClick={() => selectRepository('')}><span className="nav-glyph">⌂</span>Overview</button>
      <div className="repo-heading"><span>YOUR REPOSITORIES</span><button aria-label="Add repository" onClick={() => setShowImport(true)}><Icon name="plus" size={16} /></button></div>
      <div className="repo-nav-list">{repositories.map((repo) => <button key={repo.id} className={`repo-nav ${selectedId === repo.id ? 'active' : ''}`} onClick={() => selectRepository(repo.id)}><span className="repo-mini"><Icon name="github" size={14} /></span><span>{repo.fullName.split('/').pop()}</span><span className="repo-nav-count">{repo.fileCount}</span></button>)}</div>
      <button className="add-repo-sidebar" onClick={() => setShowImport(true)}><Icon name="plus" size={15} /> Add repository</button>
      <div className="sidebar-bottom"><div className="user-avatar">{user.email.slice(0, 1).toUpperCase()}</div><div className="user-copy"><strong>{user.email}</strong><span>Personal workspace</span></div><button className="signout-button" onClick={handleLogout} title="Sign out" aria-label="Sign out">↗</button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{detail?.fullName ?? 'Overview'}</strong></div><div className="topbar-right"><span className="local-badge"><span /> PERSONAL WORKSPACE</span><button className="avatar-small" onClick={handleLogout} title={`Sign out ${user.email}`}>{user.email.slice(0, 1).toUpperCase()}</button></div></header>
      {error && <div className="global-error"><Icon name="alert" size={17} /><span>{error}</span>{failedQuestion && <button className="retry-question" onClick={retryFailedQuestion} disabled={busy}>{busy ? 'Retrying…' : 'Retry question'}</button>}<button onClick={() => { setError(''); setFailedQuestion('') }} aria-label="Dismiss error">×</button></div>}

      {!detail ? <section className="overview-page">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> CODEBASE INTELLIGENCE</div><h1>Understand any<br /><span>codebase, faster.</span></h1><p className="welcome-description">Bring a repository into focus. Explore its structure, trace how things work, and ask questions grounded in the source.</p></div><div className="welcome-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-center"><Icon name="spark" size={28} /></div><span className="orbit-node node-a">{'{ }'}</span><span className="orbit-node node-b">⌘</span><span className="orbit-node node-c">&lt;/&gt;</span></div></div>
        <div className="import-card"><div className="import-icon"><Icon name="github" size={22} /></div><div className="import-card-copy"><strong>Start with a GitHub repository</strong><span>Import a public repository to explore its source and ask questions.</span></div><button className="button-primary" onClick={() => setShowImport(true)}><Icon name="plus" size={17} /> Add repository</button></div>
        <div className="section-header"><div><h2>Your repositories</h2><p>Codebases in your workspace</p></div><span className="count-pill">{repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'}</span></div>
        {repositories.length ? <div className="repository-grid">{repositories.map((repo) => <button className="repository-card" key={repo.id} onClick={() => selectRepository(repo.id)}><div className="repo-card-top"><span className="repo-card-icon"><Icon name="github" size={18} /></span><span className="indexed-status"><i /> {repo.vectorIndexed ? 'Semantic search' : 'Text search'}</span></div><strong>{repo.fullName}</strong><p>{repo.description || 'No repository description provided.'}</p><div className="repo-card-footer"><span><Icon name="file" size={14} /> {repo.fileCount} files</span><span><Icon name="branch" size={14} /> {repo.branch}</span><Icon name="arrow" size={16} /></div></button>)}</div> : <div className="empty-state"><div className="empty-icon"><Icon name="github" size={23} /></div><strong>Your workspace is ready</strong><span>Import a public repository to start exploring its code.</span></div>}
        <div className="how-row"><span>HOW IT WORKS</span><div><b>01</b> Import source <i /> <b>02</b> Explore files <i /> <b>03</b> Ask with context</div></div>
      </section> : <section className="repo-page">
        <div className="repo-page-header"><div className="repo-title-row"><span className="repo-title-icon"><Icon name="github" size={20} /></span><div><div className="eyebrow">REPOSITORY</div><h1>{detail.fullName}</h1></div><a className="external-link" href={detail.url} target="_blank" rel="noreferrer" title="Open on GitHub"><Icon name="external" size={17} /></a></div><p className="repo-description">{detail.description || 'No repository description provided.'}</p><div className="repo-meta"><span className="meta-chip"><Icon name="branch" size={14} /> {detail.branch}</span><span className="meta-chip"><Icon name="file" size={14} /> {detail.fileCount} source files</span><span className="commit-meta">commit <code>{detail.commitSha.slice(0, 7)}</code></span><span className="indexed-status"><i /> Indexed</span></div></div>
        <div className="repo-workspace"><section className="files-panel"><div className="panel-header"><div><span className="panel-kicker">SOURCE EXPLORER</span><h2>Files <span>{detail.fileCount}</span></h2></div><Icon name="file" size={17} /></div><label className="file-search"><Icon name="search" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter files..." /></label><div className="file-list">{visibleFiles.map((item) => <button className={`file-row ${file?.path === item.path ? 'selected' : ''}`} key={item.path} onClick={() => openFile(item.path)}><span className="file-type-dot">{item.language.slice(0, 1)}</span><span title={item.path}>{item.path}</span></button>)}{!visibleFiles.length && <div className="files-empty">No files match that filter.</div>}</div></section>
          <section className="center-panel">{file ? <><div className="viewer-header"><div><span className="panel-kicker">SOURCE FILE</span><h2>{file.path}</h2></div><span className="language-pill">{file.language}</span></div><pre className="code-viewer">{file.content.split(/\r?\n/).map((line, index) => <div className="code-line" key={index}><span>{index + 1}</span><code>{line || ' '}</code></div>)}</pre></> : <div className="chat-panel"><div className="chat-heading"><span className="ai-orb"><Icon name="spark" size={20} /></span><div><span className="panel-kicker">REPOSITORY ASSISTANT</span><h2>Ask about this codebase</h2></div><div className="conversation-controls">{aiHealth && <span className={`ai-health-pill ${aiHealth.ready ? 'ready' : 'unavailable'}`} title={aiHealth.message}>{aiHealth.provider === 'ollama' ? 'Ollama' : aiHealth.provider} {aiHealth.status === 'configured' ? 'configured' : aiHealth.ready ? 'ready' : 'unavailable'}</span>}{conversations.length > 0 && <select className="history-select" aria-label="Conversation history" value={conversationId} onChange={(event) => openConversation(event.target.value)}>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</select>}<button className="new-chat-button" onClick={() => { setConversationId(''); setMessages([]); setFailedQuestion(''); setError('') }}><Icon name="plus" size={13} /> New chat</button></div></div>{aiHealth && !aiHealth.ready && <div className="ai-status-banner" role="status"><Icon name="alert" size={15} /><span>{aiHealth.message}</span><button type="button" onClick={() => { void checkAiStatus() }} disabled={aiChecking}>{aiChecking ? 'Checking…' : 'Check again'}</button></div>}<div className="chat-content">{messages.length === 0 ? <div className="chat-empty"><span className="chat-empty-icon"><Icon name="spark" size={21} /></span><h3>Curious about something?</h3><p>Ask about the architecture, a function, or how a feature works. Answers use retrieved repository files.</p><div className="suggestion-list"><button onClick={() => setQuestion('Give me an overview of this repository architecture')}>Give me an overview of the architecture <Icon name="arrow" size={14} /></button><button onClick={() => setQuestion('Where is the main application entry point?')}>Where does the app start? <Icon name="arrow" size={14} /></button><button onClick={() => setQuestion('How is configuration handled in this project?')}>How is configuration handled? <Icon name="arrow" size={14} /></button></div></div> : <div className="message-list">{messages.map((message, index) => <article className={`message ${message.role}`} key={index}><span className="message-avatar">{message.role === 'user' ? 'Y' : <Icon name="spark" size={15} />}</span><div className="message-body"><span className="message-label">{message.role === 'user' ? 'YOU' : 'DEVBRAIN'}</span><p>{message.content}</p>{message.citations?.map((citation) => <a className="citation" href={citation.url} target="_blank" rel="noreferrer" key={`${citation.filePath}:${citation.startLine}`}><Icon name="file" size={13} /> {citation.filePath}<span>L{citation.startLine}–{citation.endLine}</span><Icon name="external" size={12} /></a>)}</div></article>)}{busy && <div className="thinking"><span /><span /><span /> Searching indexed source…</div>}</div>}</div><form className="question-form" onSubmit={ask}><textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} placeholder="Ask a question about this repository..." rows={2} /><div className="question-form-bottom"><span><kbd>↵</kbd> to ask <span className="keyboard-sep">·</span> <kbd>shift ↵</kbd> new line</span><button disabled={!question.trim() || busy} aria-label="Send question"><Icon name="send" size={16} /></button></div></form></div>}</section></div>
        <div className="repo-footnote"><Icon name="alert" size={14} /> {detail.vectorIndexed ? 'Semantic retrieval is active for this repository. Answers cite the indexed commit.' : 'Text-based retrieval is active. Local Ollama can answer questions without an API key; add QDRANT_URL to enable semantic search.'}</div>
      </section>}
    </main>

    {showImport && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setShowImport(false) }}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => !busy && setShowImport(false)} aria-label="Close" disabled={busy}>×</button><span className="modal-icon"><Icon name="github" size={23} /></span><div className="eyebrow">ADD TO WORKSPACE</div><h2 id="modal-title">Import a repository</h2><p>Connect a public GitHub repository. DevBrain will read a bounded set of source files and record the exact revision.</p><form onSubmit={handleImport}><label>Repository URL<input autoFocus type="url" required placeholder="https://github.com/owner/repository" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} /></label><label>Branch <span className="optional-label">OPTIONAL</span><input placeholder="Default branch" value={branch} onChange={(e) => setBranch(e.target.value)} disabled={busy} /></label><div className="import-note"><Icon name="alert" size={15} /> Public repositories only. Source files are stored in the local server data directory.</div>{importStatus && <div className="import-note" aria-live="polite"><Icon name="alert" size={15} /> {importStatus} ({importProgress}%)</div>}{error && <div className="modal-error">{error}</div>}<button className="button-primary modal-submit" disabled={busy}>{busy ? <><span className="spinner" /> {importStatus || 'Importing source…'} ({importProgress}%)</> : <>Import repository <Icon name="arrow" size={16} /></>}</button></form></section></div>}
  </div>
}

export default App
