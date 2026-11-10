import { useEffect, useRef, useState } from 'react'
import { useDoc, useUI, simulate } from '../doc/store'
import { helpText, plan, type Step } from '../ai/agent'
import { uid } from '../doc/types'
import { PRESETS } from '../doc/presets'
import { useT } from '../i18n'

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  source?: 'local' | 'llm'
  raw?: string
}

type Proposal = { id: string; steps: Step[] }

const QUICK_KEYS = ['chat.quick1', 'chat.quick2', 'chat.quick3', 'chat.quick4', 'chat.quick5']

export function ChatPanel() {
  const t = useT()
  const doc = useDoc((s) => s.doc)
  const commitMany = useDoc((s) => s.commitMany)
  const setPreview = useUI((s) => s.setPreview)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, proposal])

  // keep the preview in sync if the user edits underneath a pending proposal
  useEffect(() => {
    if (!proposal) return
    setPreview(simulate(doc, proposal.steps.map((s) => s.recipe)))
  }, [doc, proposal, setPreview])

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || busy) return
    // read from the store: the doc may have changed since this closure was made
    const current = useDoc.getState().doc
    setInput('')
    setMessages((m) => [...m, { id: uid('m'), role: 'user', text }])
    setBusy(true)
    try {
      const result = await plan(text, current, import.meta.env.VITE_AI_API_KEY)
      setMessages((m) => [
        ...m,
        { id: uid('m'), role: 'assistant', text: result.reply, source: result.source, raw: result.raw },
      ])
      if (result.steps.length) {
        setProposal({ id: uid('p'), steps: result.steps })
        setPreview(simulate(current, result.steps.map((s) => s.recipe)))
      } else {
        setProposal(null)
        setPreview(null)
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: uid('m'), role: 'assistant', text: t('chat.error', { msg: (err as Error).message }) },
      ])
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!proposal) return
    commitMany(
      proposal.steps.map((s) => s.recipe),
      'hist.ai',
    )
    setMessages((m) => [
      ...m,
      { id: uid('m'), role: 'assistant', text: t('chat.applied', { n: proposal.steps.length }) },
    ])
    setProposal(null)
    setPreview(null)
  }

  const discard = () => {
    setMessages((m) => [...m, { id: uid('m'), role: 'assistant', text: t('chat.discarded') }])
    setProposal(null)
    setPreview(null)
  }

  const presetList = Object.keys(PRESETS)
    .map((k) => t(`preset.${k}`))
    .join(' · ')

  return (
    <aside className="chat">
      <div className="chat-head">
        <span className="chat-title">{t('chat.title')}</span>
        <span className={`tag ${import.meta.env.VITE_AI_API_KEY ? 'tag-llm' : 'tag-local'}`}>
          {import.meta.env.VITE_AI_API_KEY ? 'LLM' : t('chat.local')}
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="msg msg-assistant">
            <div className="msg-bubble">
              {t('chat.greeting')}
              {'\n\n'}
              {helpText()}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-bubble">
              {m.text}
              {m.raw ? <pre className="msg-raw">{m.raw}</pre> : null}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg msg-assistant">
            <div className="msg-bubble typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {proposal && (
          <div className="proposal">
            <div className="proposal-head">{t('chat.pending')}</div>
            <ol className="proposal-steps">
              {proposal.steps.map((s, i) => (
                <li key={i}>
                  <code>{s.tool}</code> {s.title}
                </li>
              ))}
            </ol>
            <div className="proposal-actions">
              <button className="primary" onClick={apply}>
                {t('chat.apply', { n: proposal.steps.length })}
              </button>
              <button className="ghost" onClick={discard}>
                {t('chat.discard')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="chat-quick">
        {QUICK_KEYS.map((k) => (
          <button key={k} className="chip" disabled={busy} onClick={() => send(t(k))}>
            {t(k)}
          </button>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          placeholder={t('chat.placeholder')}
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          {t('chat.send')}
        </button>
      </form>

      <div className="chat-foot">{t('chat.presetsAvailable', { list: presetList })}</div>
    </aside>
  )
}
