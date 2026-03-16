import React from "react"

interface Props {
  label: string
  trait: string
  options: string[]
  traitInput: Record<string, Array<number | string>>
  setTraitInput: React.Dispatch<
    React.SetStateAction<Record<string, Array<number | string>>>
  >
}

function DropdownFilter({
  label,
  trait,
  options,
  traitInput,
  setTraitInput
}: Props) {

  const value = (traitInput[trait] || [])[0] || ""

  return (
    <div className="trait-section-dropdown">

      <p>{label}</p>

      <select
        value={value}
        onChange={(e) =>
          setTraitInput((prev) => ({
            ...prev,
            [trait]: e.target.value ? [e.target.value] : []
          }))
        }
      >

        <option value="">Select</option>

        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}

      </select>

    </div>
  )
}

export default DropdownFilter