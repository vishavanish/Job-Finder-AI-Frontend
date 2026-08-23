import { useState } from "react";

export default function ChipEditor({ items, onChange, placeholder = "Add item..." }) {
  const [value, setValue] = useState("");

  const add = () => {
    const trimmed = value.trim();
    if (!trimmed || items.includes(trimmed)) {
      setValue("");
      return;
    }
    onChange([...items, trimmed]);
    setValue("");
  };

  const remove = (item) => {
    onChange(items.filter((i) => i !== item));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <div className="chip-input-row">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="btn-add" onClick={add}>
          Add
        </button>
      </div>
      <div className="chip-list">
        {items.length === 0 && <span className="field-hint">Nothing added yet.</span>}
        {items.map((item) => (
          <span className="chip" key={item}>
            {item}
            <button type="button" onClick={() => remove(item)} aria-label={`Remove ${item}`}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
