import { useEffect, useState } from "react";
import { listApplications, getGmailStatus, updateApplicationStatus } from "../api/client.js";

export default function ApplicationsPage() {
  const [gmailConnected, setGmailConnected] = useState(null); // null = checking
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [updatingId, setUpdatingId] = useState(null);
  const limit = 20;

  const checkGmail = async () => {
    try {
      const { data } = await getGmailStatus();
      setGmailConnected(data.all_connected);
      return data.all_connected;
    } catch {
      setGmailConnected(false);
      return false;
    }
  };

  const load = async (newOffset = offset) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await listApplications({ limit, offset: newOffset });
      setRows(data.applications);
      setTotal(data.total);
      setOffset(newOffset);
    } catch (err) {
      setError(err.authError || err.rateLimitError || err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkGmail().then((connected) => {
      // Load applications regardless of Gmail status — Gmail only affects
      // auto status-updates, not whether the applications list itself works.
      load(0);
    });
  }, []);

  const statusTone = (status) => {
    if (!status) return "job-score mid";
    if (status.startsWith("open_failed")) return "job-score low";
    if (status === "rejected") return "job-score low";
    if (status === "interview_invite" || status === "assessment_invite") return "job-score";
    if (status.includes("easy_apply_form_filled") || status === "submitted") return "job-score";
    return "job-score mid";
  };

  const handleMarkApplied = async (row) => {
  setUpdatingId(row.id);
  try {
    await updateApplicationStatus(row.id, "submitted");
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: "submitted", status_source: "manual" } : r))
    );
  } catch (err) {
    setError(err.authError || err.rateLimitError || err?.response?.data?.detail || err.message);
  } finally {
    setUpdatingId(null);
  }
};

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Applications</h2>
          <p>Jobs the /apply flow attempted to open or pre-fill — not confirmation of a submitted application.</p>
        </div>
      </div>

      {gmailConnected === false && (
        <div className="card">
          <h3>Gmail not connected</h3>
          <p className="field-hint">
            Connect Gmail so replies (rejections, interview invites) update statuses here automatically.
            Run <code>python app/scripts/gmail_authorize.py primary</code> on the server, then refresh this page.
            You can still track applications manually below in the meantime.
          </p>
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="card">
        <h3>History ({total})</h3>
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No applications logged yet — use Apply on the Run &amp; Results page.</div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.url}-${i}`}>
                    <td>{r.date}</td>
                    <td>
                      <div className="job-title-cell">{r.title}</div>
                      <div className="job-company-cell">{r.company}</div>
                    </td>
                    <td><span className="source-badge">{r.source}</span></td>
                    <td>
                      <span className={statusTone(r.status)}>{r.status}</span>
                      {r.status_source && (
                        <span className="field-hint" style={{ marginLeft: 6 }}>
                          ({r.status_source})
                        </span>
                      )}
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <a href={r.url} target="_blank" rel="noreferrer" className="btn-small">View</a>
                      {r.status !== "submitted" && r.status_source !== "manual" && (
                        <button
                          className="btn-small"
                          disabled={updatingId === r.id}
                          onClick={() => handleMarkApplied(r)}
                        >
                          {updatingId === r.id ? "Saving..." : "Mark Applied"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="run-bar" style={{ marginTop: 14 }}>
              <button className="btn-small" disabled={offset === 0} onClick={() => load(Math.max(0, offset - limit))}>
                ← Prev
              </button>
              <button className="btn-small" disabled={offset + limit >= total} onClick={() => load(offset + limit)}>
                Next →
              </button>
              <span className="field-hint">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}