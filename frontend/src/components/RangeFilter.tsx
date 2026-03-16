interface Option {
  label: string
  value: string
}

interface Props {
  label: string
  trait: string
  options: Option[]
  traitInput: Record<string, Array<number | string>>
  toggleTraitValue: (trait: string, value: number | string) => void
}

function RangeFilter({
  trait,
  options,
  traitInput,
  toggleTraitValue
}: Props) {

  return (
    <>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={(traitInput[trait] || []).includes(option.value)}
            onChange={() => toggleTraitValue(trait, option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </>
  )
}

export default RangeFilter