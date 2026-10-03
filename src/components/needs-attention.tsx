import Link from "next/link";
import { Panel } from "./ui";
import type { AttentionItem } from "@/lib/ux";
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <Panel title="Needs Your Attention">
      {items.length ? (
        <ul className="attention-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={item.critical ? "attention-critical" : ""}
            >
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              <Link href={item.href} className="button secondary">
                {item.action}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          You’re all caught up. No finance issues need your attention.
        </p>
      )}
    </Panel>
  );
}
