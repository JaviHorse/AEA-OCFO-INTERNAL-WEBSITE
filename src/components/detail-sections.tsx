"use client";
import { useId, useState } from "react";
export function DetailSections({
  sections,
}: {
  sections: { title: string; content: React.ReactNode }[];
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  return (
    <div className="detail-sections">
      <div role="tablist" aria-label="Request sections" className="admin-tabs">
        {sections.map((section, i) => (
          <button
            key={section.title}
            id={`${id}-tab-${i}`}
            className={selected === i ? "active" : ""}
            role="tab"
            aria-selected={selected === i}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={selected === i ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight"
                  ? (i + 1) % sections.length
                  : e.key === "ArrowLeft"
                    ? (i + sections.length - 1) % sections.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? sections.length - 1
                        : null;
              if (next !== null) {
                e.preventDefault();
                setSelected(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {section.title}
          </button>
        ))}
      </div>
      {sections.map((section, i) => (
        <div
          key={section.title}
          id={`${id}-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${i}`}
          hidden={selected !== i}
          tabIndex={0}
        >
          {section.content}
        </div>
      ))}
    </div>
  );
}
