import { useState, useEffect } from 'react'
import './App.css'
import TraitPanel from './components/TraitPanel'
import PawImg from './pictures/paw.png'

type DimensionMatch = {
  dimension: number
  sign: string
  contribution: number
  terms: string[]
}

type DogMatch = {
  breed: string
  score: number
  structured_score?: number | null
  text_score?: number | null
  matching_traits?: string[]
  matching_words?: string[]
  positive_dimensions?: DimensionMatch[]
  negative_dimensions?: DimensionMatch[]
  description: string
  temperament: string
  group: string
  grooming: string
  energy: string
  shedding: string
  trainability: string
  demeanor: string
  picture_name?: string | null
  min_height: number | null
  max_height: number | null
  avg_height: number | null
  min_weight: number | null
  max_weight: number | null
  avg_weight: number | null
  min_expectancy: number | null
  max_expectancy: number | null
  avg_expectancy: number | null
}

type MatchResponse = {
  baseline_matches: DogMatch[]
  svd_matches: DogMatch[]
}

function App(): JSX.Element {
  const [useLlm, setUseLlm] = useState<boolean | null>(null)
  const [traitInput, setTraitInput] = useState<Record<string, Array<number | string>>>({})
  const [writeIn, setWriteIn] = useState<string>('')
  const [submittedQuery, setSubmittedQuery] = useState<Record<string, Array<number | string>>>({})
  const [submittedWriteIn, setSubmittedWriteIn] = useState<string>('')
  const [baselineMatches, setBaselineMatches] = useState<DogMatch[]>([])
  const [svdMatches, setSvdMatches] = useState<DogMatch[]>([])
  const [activeMethod, setActiveMethod] = useState<'svd' | 'baseline'>('svd')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [llmResponse, setLlmResponse] = useState<string>('')
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const [aiInput, setAiInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiMode, setAiMode] = useState<'help' | 'explain'>('help')

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => setUseLlm(data.use_llm))
  }, [])

  const cleanLine = (line: string) =>
    line
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim()

  const renderAssistantMessage = (text: string) => (
    <>
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim()
        if (/^\*\s+/.test(trimmed)) {
          return (
            <div key={i} className="ai-bullet">
              <div className="ai-bullet-dot" />
              <div>{trimmed.replace(/^\*\s+/, '')}</div>
            </div>
          )
        }
        return <div key={i}>{trimmed}</div>
      })}
    </>
  )

  const renderWithBoldPrefix = (text: string) => {
    const match = text.match(/^([^:]+:)(.*)$/)
    if (!match) return text
    return <><strong>{match[1]}</strong>{match[2]}</>
  }

  const toggleTraitValue = (trait: string, value: number | string) => {
    setTraitInput((prev) => {
      const current = prev[trait] || []
      if (current.includes(value)) return { ...prev, [trait]: current.filter(v => v !== value) }
      return { ...prev, [trait]: [...current, value] }
    })
  }

  const handleSubmitPreferences = async () => {
    setSubmittedQuery(traitInput)
    setSubmittedWriteIn(writeIn)
    setBaselineMatches([])
    setSvdMatches([])
    setError('')
    setIsLoading(true)
    setLlmResponse('')

    try {
      const response = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traitInput, writeIn }),
      })
      if (!response.ok) throw new Error('Failed to fetch matches')
      const data: MatchResponse = await response.json()
      setBaselineMatches(Array.isArray(data.baseline_matches) ? data.baseline_matches : [])
      setSvdMatches(Array.isArray(data.svd_matches) ? data.svd_matches : [])

      if (useLlm) {
        const ragResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: writeIn || JSON.stringify(traitInput), traitInput, results: data.svd_matches.slice(0, 5) }),
        })
        const ragData = await ragResponse.json()
        setLlmResponse(ragData.response ?? 'No AI explanation returned.')
      }
    } catch (err) {
      console.error(err)
      setError('Something went wrong while finding matches.')
      setBaselineMatches([])
      setSvdMatches([])
    } finally {
      setIsLoading(false)
    }
  }

  const selectedTraitEntries = Object.entries(submittedQuery).filter(([_, v]) => v.length > 0)
  const hasSubmittedInput = selectedTraitEntries.length > 0 || submittedWriteIn.trim() !== ''

  const selectedRanges = (input: Record<string, Array<number | string>>) => {
    const ranges: Record<string, string[]> = {}
    if (input['Height']?.length) ranges['Height'] = input['Height'].map(String)
    if (input['Weight']?.length) ranges['Weight'] = input['Weight'].map(String)
    if (input['Life Expectancy']?.length) ranges['Life Expectancy'] = input['Life Expectancy'].map(String)
    return ranges
  }
  const rangePrefs = selectedRanges(submittedQuery)

  const highlightText = (text: string, terms: string[]) => {
    if (!terms?.length) return text
    let result = text
    terms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi')
      result = result.replace(regex, match => `<mark>${match}</mark>`)
    })
    return <span dangerouslySetInnerHTML={{ __html: result }} />
  }

  const rangeMatches = (trait: 'Height' | 'Weight' | 'Life Expectancy', value: number | null, ranges: Record<string, string[]>) => {
    if (!ranges[trait] || value == null) return false
    return ranges[trait].some(r => {
      const [low, high] = r.split('-').map(Number)
      return !isNaN(low) && !isNaN(high) && value >= low && value <= high
    })
  }

  const traitMatched = (dogValue: string, matchingTraits?: string[]) =>
    !!dogValue && !!matchingTraits?.length && matchingTraits.some(t => dogValue.toLowerCase().includes(t.toLowerCase()))

  const renderTextPill = (value: string, matchingTraits?: string[]) => {
    if (!value?.trim()) return null
    return (
      <span className={`trait-pill${traitMatched(value, matchingTraits) ? ' matched' : ''}`}>
        {value}
      </span>
    )
  }

  const renderDogCard = (dog: DogMatch, showSvd: boolean) => (
    <div className="dog-card" key={dog.breed}>
      <div className="dog-card-layout">
        <div className="dog-image-wrap">
          <img
            src={dog.picture_name ? `/images/${dog.picture_name}` : PawImg}
            alt={dog.breed}
            className="dog-image"
            onError={e => { e.currentTarget.src = PawImg }}
          />
        </div>
        <div className="dog-card-content">
          <div className="dog-card-header">
            <h4>{dog.breed}</h4>
            <span className="match-score">MATCH {Math.round(dog.score * 100)}%</span>
          </div>
          <div className="traits">
            <span className={`trait-pill${rangeMatches('Height', dog.avg_height, rangePrefs) ? ' matched' : ''}`}>
              <strong>Height</strong> {dog.avg_height != null ? Math.round(dog.avg_height) : 'N/A'} cm
            </span>
            <span className={`trait-pill${rangeMatches('Weight', dog.avg_weight, rangePrefs) ? ' matched' : ''}`}>
              <strong>Weight</strong> {dog.avg_weight != null ? Math.round(dog.avg_weight) : 'N/A'} kg
            </span>
            <span className={`trait-pill${rangeMatches('Life Expectancy', dog.avg_expectancy, rangePrefs) ? ' matched' : ''}`}>
              <strong>Life Expectancy</strong> {dog.avg_expectancy ?? 'N/A'} yrs
            </span>
            {renderTextPill(dog.group, dog.matching_traits)}
            {renderTextPill(dog.grooming, dog.matching_traits)}
            {renderTextPill(dog.energy, dog.matching_traits)}
            {renderTextPill(dog.shedding, dog.matching_traits)}
            {renderTextPill(dog.trainability, dog.matching_traits)}
            {renderTextPill(dog.demeanor, dog.matching_traits)}
          </div>
          <p className="dog-temperament">{highlightText(dog.temperament || '', dog.matching_words || [])}</p>
          <p className="dog-description">{highlightText(dog.description || '', dog.matching_words || [])}</p>
          {showSvd && ((dog.positive_dimensions?.length || 0) > 0 || (dog.negative_dimensions?.length || 0) > 0) && (
            <div className="explainability-box">
              <div className="explainability-title">Why this matched in SVD</div>
              {(dog.positive_dimensions?.length || 0) > 0 && (
                <div className="explainability-group">
                  <div className="explainability-subtitle">Positive dimensions</div>
                  <div className="dimension-chip-wrap">
                    {dog.positive_dimensions?.map((dim, i) => (
                      <span key={i} className="dimension-chip positive">Dim {dim.dimension}: {dim.terms.join(', ')}</span>
                    ))}
                  </div>
                </div>
              )}
              {(dog.negative_dimensions?.length || 0) > 0 && (
                <div className="explainability-group">
                  <div className="explainability-subtitle">Negative dimensions</div>
                  <div className="dimension-chip-wrap">
                    {dog.negative_dimensions?.map((dim, i) => (
                      <span key={i} className="dimension-chip negative">Dim {dim.dimension}: {dim.terms.join(', ')}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const currentMatches = activeMethod === 'svd' ? svdMatches : baselineMatches

  const sendAiMessage = async () => {
    if (!aiInput.trim()) return
    const newMessages: { role: 'user' | 'ai'; text: string }[] = [...aiMessages, { role: 'user', text: aiInput }]
    setAiMessages(newMessages)
    setAiInput('')
    setIsAiLoading(true)
    try {
      const res = await fetch('/api/ai-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiInput }),
      })
      const data = await res.json()
      setAiMessages([...newMessages, { role: 'ai', text: data.response || 'No response.' }])
    } catch {
      setAiMessages([...newMessages, { role: 'ai', text: 'Something went wrong.' }])
    } finally {
      setIsAiLoading(false)
    }
  }

  if (useLlm === null) return <></>

  return (
    <>
      {/* Animated background */}
      <div className="bg-blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>
      <div className="floating-paws">
        <span className="fpaw">🐾</span>
        <span className="fpaw">🐾</span>
        <span className="fpaw">🐾</span>
        <span className="fpaw">🐾</span>
        <span className="fpaw">🐾</span>
        <span className="fpaw">🐾</span>
      </div>

      <div className={`full-body-container${useLlm ? ' llm-mode' : ''}`}>

        {/* Header */}
        <header className="site-header">
          <div className="brand">
            <div className="paw-logo">🐾</div>
            <div>
              <div className="brand-name">Paw<span>Match</span></div>
              <div className="brand-tag">Find your perfect companion!</div>
            </div>
          </div>

          <div className="header-controls">
            {/* SVD / No SVD toggle */}
            <div className="method-toggle">
              <button
                className={`method-button${activeMethod === 'svd' ? ' active' : ''}`}
                onClick={() => setActiveMethod('svd')}
              >SVD</button>
              <button
                className={`method-button${activeMethod === 'baseline' ? ' active' : ''}`}
                onClick={() => setActiveMethod('baseline')}
              >No SVD</button>
            </div>

            {useLlm && (
              <button
                className="ai-help-button"
                onClick={() => {
                  setAiMode('help')
                  setShowAiPanel(true)
                  setAiMessages(prev =>
                    prev.length === 0
                      ? [{ role: 'ai', text: "Hi! Tell me about your lifestyle (home size, activity level, shedding tolerance, etc.), and I'll suggest dog traits or breeds that fit you." }]
                      : prev
                  )
                }}
              >Ask AI for Help</button>
            )}
          </div>
        </header>



        {/* Form card */}
        <div className="form-card">
          <TraitPanel
            traitInput={traitInput}
            setTraitInput={() => { }}
            toggleTraitValue={toggleTraitValue}
            writeIn={writeIn}
            setWriteIn={setWriteIn}
            handleSubmitPreferences={handleSubmitPreferences}
          />
        </div>

        {/* Results */}
        <div id="answer-box">

          {/* Preferences preview / empty state */}
          {!hasSubmittedInput && (
            <div className="query-preview-card">
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                  <span style={{ fontSize: 28, opacity: 0.18 }}>🐾</span>
                  <span style={{ fontSize: 36, opacity: 0.25 }}>🐾</span>
                  <span style={{ fontSize: 28, opacity: 0.18 }}>🐾</span>
                </div>
                <div className="query-preview-title">No preferences yet</div>
                <p className="query-preview-text">Select some traits above and click <strong>Find My Match</strong> to discover your ideal breed.</p>
              </div>
            </div>
          )}

          {hasSubmittedInput && !isLoading && currentMatches.length === 0 && !error && (
            <div className="query-preview-card">
              <div style={{ textAlign: 'center', width: '100%' }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
                  Submitted preferences
                </p>
                <div className="query-chips">
                  {submittedWriteIn.trim() && submittedWriteIn.split(',').map((t, i) => (
                    <span key={i} className="query-chip" style={{ animationDelay: `${i * 0.06}s` }}>{t.trim()}</span>
                  ))}
                  {selectedTraitEntries.flatMap(([_, vals]) => vals).map((v, i) => (
                    <span key={`t-${i}`} className="query-chip" style={{ animationDelay: `${i * 0.06}s` }}>{String(v)}</span>
                  ))}
                </div>
                <p style={{ marginTop: 24, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  No matching breeds found. Try fewer or broader preferences.
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="query-preview-card">
              <div style={{ textAlign: 'center' }}>
                <div className="query-preview-title">Finding matches…</div>
                <p className="query-preview-text">Running both methods and preparing your results.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="query-preview-card">
              <div className="query-preview-title">Something went wrong</div>
              <p className="query-preview-text">{error}</p>
            </div>
          )}

          {!isLoading && currentMatches.length > 0 && (
            <div className="results-card">
              {/* Submitted preferences summary */}
              {hasSubmittedInput && (
                <div className="submitted-prefs-bar">
                  <div className="submitted-prefs-title">Submitted Preferences</div>
                  {submittedWriteIn.trim() && (
                    <div className="submitted-prefs-row">
                      <span className="submitted-prefs-key">Inputted Trait(s):</span>
                      <span className="submitted-prefs-val">{submittedWriteIn}</span>
                    </div>
                  )}
                  {selectedTraitEntries.map(([trait, vals]) => (
                    <div className="submitted-prefs-row" key={trait}>
                      <span className="submitted-prefs-key">{trait}:</span>
                      <span className="submitted-prefs-val">{vals.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="comparison-header">
                <h3 className="comparison-title">Top Matches</h3>
                {useLlm && (
                  <button
                    className="ai-explain-button"
                    onClick={() => { setAiMode('explain'); setShowAiPanel(true) }}
                  >Explain with AI</button>
                )}
              </div>
              <p className="comparison-subtitle">
                {activeMethod === 'svd' ? 'SVD-based ranking with positive and negative dimension explanations.' : 'Baseline ranking without SVD.'}
              </p>
              {currentMatches.map((dog, i) => (
                <div key={`${dog.breed}-${activeMethod}-${i}`}>
                  {renderDogCard(dog, activeMethod === 'svd')}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* AI Drawer */}
      {showAiPanel && (
        <div className="ai-overlay" onClick={() => setShowAiPanel(false)}>
          <div className="ai-drawer" onClick={e => e.stopPropagation()}>
            <div className="ai-drawer-header">
              <h3>{aiMode === 'help' ? 'AI Assistant 🐾' : 'AI Explanation 🐾'}</h3>
              <button onClick={() => setShowAiPanel(false)}>✕ Close</button>
            </div>
            <div className="ai-drawer-content">
              {aiMode === 'help' ? (
                <div className="ai-chat">
                  <div className="ai-messages">
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={`ai-message ${msg.role}`}>
                        {renderAssistantMessage(cleanLine(msg.text))}
                      </div>
                    ))}
                    {isAiLoading && <div className="ai-message ai">Thinking…</div>}
                  </div>
                  <div className="ai-input-row">
                    <div className="ai-input-wrapper">
                      <textarea
                        value={aiInput}
                        onChange={e => {
                          setAiInput(e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = e.target.scrollHeight + 'px'
                        }}
                        placeholder="Describe your lifestyle…"
                        rows={1}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage() } }}
                      />
                      <button onClick={sendAiMessage}>Send</button>
                    </div>
                  </div>
                </div>
              ) : llmResponse ? (
                <div className="ai-text-block">
                  {(() => {
                    const lines = llmResponse.split('\n')
                    const elements: JSX.Element[] = []

                    let currentBullets: string[] = []

                    const flushBullets = (key: string) => {
                      if (currentBullets.length) {
                        elements.push(
                          <div key={key}>
                            {currentBullets.map((b, i) => (
                              <div key={i} className="ai-bullet">
                                <div className="ai-bullet-dot" />
                                <div>{renderWithBoldPrefix(cleanLine(b))}</div>
                              </div>
                            ))}
                          </div>
                        )
                        currentBullets = []
                      }
                    }

                    lines.forEach((line, i) => {
                      const t = line.trim()

                      // bullet line
                      if (/^(\*|-|•)\s+/.test(t)) {
                        currentBullets.push(t.replace(/^(\*|-|•)\s+/, ''))
                        return
                      }

                      // flush bullets BEFORE handling new section/content
                      flushBullets(`flush-${i}`)

                      // section header
                      if (t.startsWith('###')) {
                        elements.push(
                          <div key={i} className="ai-section-title">
                            {cleanLine(t)}
                          </div>
                        )
                        return
                      }

                      // normal line
                      if (t) {
                        elements.push(
                          <div key={i} className="ai-line">
                            {renderWithBoldPrefix(cleanLine(t))}
                          </div>
                        )
                      }
                    })

                    // flush any remaining bullets at end
                    flushBullets('final')
                    return elements
                  })()}
                </div>
              ) : <p className="ai-empty">No AI explanation yet.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App