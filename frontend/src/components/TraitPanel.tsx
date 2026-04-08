import RangeFilter from "./RangeFilter"
import CheckboxFilter from "./CheckboxFilter"

const heightRanges = [
  { label: "Small (0-30 cm)", value: "0-30" },
  { label: "Medium (30-55 cm)", value: "30-55" },
  { label: "Large (55-75 cm)", value: "55-75" },
  { label: "Giant (75+ cm)", value: "75-200" }
]

const weightRanges = [
  { label: "Toy (0-7 kg)", value: "0-7" },
  { label: "Small (7-15 kg)", value: "7-15" },
  { label: "Medium (15-30 kg)", value: "15-30" },
  { label: "Large (30-50 kg)", value: "30-50" },
  { label: "Giant (50+ kg)", value: "50-200" }
]

const lifeRanges = [
  { label: "Short (0-10 years)", value: "0-10" },
  { label: "Average (10-13 years)", value: "10-13" },
  { label: "Long (13-16 years)", value: "13-16" },
  { label: "Very Long (16+ years)", value: "16-25" }
]

const groups = [
  "Foundation Stock Service",
  "Herding Group",
  "Hound Group",
  "Miscellaneous Class",
  "Non-Sporting Group",
  "Sporting Group",
  "Terrier Group",
  "Toy Group",
  "Working Group"
]

const groomingOptions = [
  "Occasional Bath/Brush",
  "Weekly Brushing",
  "2-3 Times a Week Brushing",
  "Daily Brushing",
  "Professional Only"
]

const sheddingOptions = [
  "Infrequent",
  "Occasional",
  "Seasonal",
  "Regularly",
  "Frequent"
]

const energyOptions = [
  "Couch Potato",
  "Calm",
  "Regular Exercise",
  "Energetic",
  "Needs Lots of Activity"
]

const trainabilityOptions = [
  "Easy Training",
  "Eager to Please",
  "Agreeable",
  "Independent",
  "May be Stubborn"
]

const demeanorOptions = [
  "Friendly",
  "Outgoing",
  "Alert/Responsive",
  "Reserved with Strangers",
  "Aloof/Wary"
]

function TraitPanel({
  traitInput,
  toggleTraitValue,
  writeIn,
  setWriteIn,
  handleSubmitPreferences
}: any) {

  return (
    <div className="trait-form">

      {/* Row 1: Text input */}
      <div className="trait-section-card">
        <p className="trait-section-label">Input traits</p>
        <textarea
          className="write-in-input"
          placeholder="ex: playful, loyal, quiet"
          value={writeIn}
          onChange={(e) => setWriteIn(e.target.value)}
          rows={2}
        />
      </div>

      {/* Row 2: Height + Weight + Life Expectancy */}
      <div className="trait-form-grid-3">
        <div className="trait-section-card">
          <p className="trait-section-label">Height</p>
          <div className="trait-options">
            <RangeFilter
              label=""
              trait="Height"
              options={heightRanges}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>

        <div className="trait-section-card">
          <p className="trait-section-label">Weight</p>
          <div className="trait-options">
            <RangeFilter
              label=""
              trait="Weight"
              options={weightRanges}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>

        <div className="trait-section-card">
          <p className="trait-section-label">Life expectancy</p>
          <div className="trait-options">
            <RangeFilter
              label=""
              trait="Life Expectancy"
              options={lifeRanges}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>
      </div>

      {/* Row 3: Breed Group + Energy Level + Demeanor */}
      <div className="trait-form-grid-3">
        <div className="trait-section-card">
          <p className="trait-section-label">Breed group</p>
          <div className="trait-options">
            <CheckboxFilter
              trait="Group"
              options={groups}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>

        <div className="trait-section-card">
          <p className="trait-section-label">Energy level</p>
          <div className="trait-options">
            <CheckboxFilter
              trait="Energy Level"
              options={energyOptions}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>

        <div className="trait-section-card">
          <p className="trait-section-label">Demeanor</p>
          <div className="trait-options">
            <CheckboxFilter
              trait="Demeanor"
              options={demeanorOptions}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>
      </div>

      {/* Row 4: Grooming + Trainability + Shedding */}
      <div className="trait-form-grid-3">
        <div className="trait-section-card">
          <p className="trait-section-label">Grooming</p>
          <div className="trait-options">
            <CheckboxFilter
              trait="Grooming Frequency"
              options={groomingOptions}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>

        <div className="trait-section-card">
          <p className="trait-section-label">Trainability</p>
          <div className="trait-options">
            <CheckboxFilter
              trait="Trainability"
              options={trainabilityOptions}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>

        <div className="trait-section-card">
          <p className="trait-section-label">Shedding</p>
          <div className="trait-options">
            <CheckboxFilter
              trait="Shedding"
              options={sheddingOptions}
              traitInput={traitInput}
              toggleTraitValue={toggleTraitValue}
            />
          </div>
        </div>
      </div>

      <button className="submit-button" onClick={handleSubmitPreferences}>
        Find matches
      </button>

    </div>
  )
}

export default TraitPanel