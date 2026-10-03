"use client";
import { useState } from "react";
export function AuditTable({
  records,
}: {
  records: Record<string, unknown>[];
}) {
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [date, setDate] = useState("");
  const filtered = records.filter(
    (r) =>
      String(r.actor_user_id ?? "").includes(actor) &&
      String(r.entity_type).includes(entity) &&
      String(r.action).toLowerCase().includes(action.toLowerCase()) &&
      (!date || String(r.created_at).slice(0, 10) === date),
  );
  return (
    <>
      <div className="table-filters">
        <input
          aria-label="Actor"
          placeholder="Actor ID"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />
        <input
          aria-label="Entity"
          placeholder="Entity"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        />
        <input
          aria-label="Action"
          placeholder="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <input
          aria-label="Audit date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  {new Date(String(r.created_at)).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                  })}
                </td>
                <td>{String(r.actor_user_id)}</td>
                <td>{String(r.action)}</td>
                <td>{String(r.entity_type)}</td>
                <td>
                  <details>
                    <summary>View audit record</summary>
                    <pre style={{ whiteSpace: "pre-wrap", maxWidth: 400 }}>
                      {JSON.stringify(
                        {
                          old: r.old_data,
                          new: r.new_data,
                          metadata: r.metadata,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
