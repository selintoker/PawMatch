interface Props {
  trait: string
  options: string[]
  traitInput: Record<string, Array<number | string>>
  toggleTraitValue: (trait: string, value: number | string) => void
}

function CheckboxFilter({ trait, options, traitInput, toggleTraitValue }: Props) {
  return (
    <>
      {options.map((opt) => (
        <label key={opt}>
          <input
            type="checkbox"
            checked={(traitInput[trait] || []).includes(opt)}
            onChange={() => toggleTraitValue(trait, opt)}
          />
          <span>{opt}</span>
        </label>
      ))}
    </>
  )
}

export default CheckboxFilter