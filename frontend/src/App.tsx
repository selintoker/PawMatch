import { useState, useEffect } from 'react'
import './App.css'
import SearchIcon from './assets/mag.png'
import { Episode } from './types'
import Chat from './Chat'
import TitleImg from './pictures/title.png'

const traits = [
  "Affectionate With Family", "Good With Young Children", "Good With Other Dogs",
  "Shedding Level", "Coat Grooming Frequency", "Drooling Level",
  "Coat Type", "Coat Length", "Playfulness Level", "Energy Level",
];

const coatTypes = ["Corded", "Curly", "Double", "Hairless", "Rough", "Silky", "Smooth", "Wavy", "Wiry"];
const coatLengths = ["Short", "Medium", "Long"];


function App(): JSX.Element {
  const [useLlm, setUseLlm] = useState<boolean | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [traitInput, setTraitInput] = useState<any>({})
  const [writeIn, setWriteIn] = useState<string>('')

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(data => setUseLlm(data.use_llm))
  }, [])

  const handleSearch = async (value: string): Promise<void> => {
    setSearchTerm(value)
    if (value.trim() === '') { setEpisodes([]); return }
    const response = await fetch(`/api/episodes?title=${encodeURIComponent(value)}`)
    const data: Episode[] = await response.json()
    setEpisodes(data)
  }

  const toggleTraitValue = (trait: string, value: number | string) => {

    setTraitInput((prev: any) => {

      const current = prev[trait] || []

      if (current.includes(value)) {
        return { ...prev, [trait]: current.filter((v: any) => v !== value) }
      }

      return { ...prev, [trait]: [...current, value] }

    })
  }


  if (useLlm === null) return <></>

  return (
    <div className={`full-body-container ${useLlm ? 'llm-mode' : ''}`}>

      <div className="dog-border"></div>

      {/* Title */}
      <div className="top-text">
        <img src={TitleImg} className="title-image" alt="PawMatch" />
      </div>

      {/* TRAIT INPUT FORM */}
      <div className="trait-form">

        {/* Optional Write-In */}
        <div className="trait-section">

          <p>Additional Traits</p>

          <input
            type="text"
            placeholder="ex: playful, loyal, quiet apartment dog"
            value={writeIn}
            onChange={(e) => setWriteIn(e.target.value)}
          />

        </div>

        {traits.map((trait) => (
  <div key={trait} className="trait-section">

    <p>{trait}</p>

    <div className="trait-options">
      {[1,2,3,4,5].map((num) => (
        <label key={num}>
          <input
            type="checkbox"
            onChange={() => toggleTraitValue(trait, num)}
          />
          {num}
        </label>
      ))}
    </div>

  </div>
))}

{/* Coat Type */}
<div className="trait-section">

  <p>Coat Type</p>

  <div className="trait-options coat-type-options">
    {coatTypes.map((type) => (
      <label key={type}>
        <input
          type="checkbox"
          onChange={() => toggleTraitValue("Coat Type", type)}
        />
        {type}
      </label>
    ))}
  </div>

</div>


{/* Coat Length */}
<div className="trait-section">

  <p>Coat Length</p>

  <div className="trait-options">
    {coatLengths.map((length) => (
      <label key={length}>
        <input
          type="checkbox"
          onChange={() => toggleTraitValue("Coat Length", length)}
        />
        {length}
      </label>
    ))}
  </div>

</div>

      </div>
      {/* EXISTING RESULTS AREA*/}
      <div id="answer-box">
        {episodes.map((episode, index) => (
          <div key={index} className="episode-item">
            <h3 className="episode-title">{episode.title}</h3>
            <p className="episode-desc">{episode.descr}</p>
            <p className="episode-rating">IMDB Rating: {episode.imdb_rating}</p>
          </div>
        ))}
      </div>

      {/* Chat (only when USE_LLM = True in routes.py) */}
      {useLlm && <Chat onSearchTerm={handleSearch} />}
    </div>
  )
}

export default App
