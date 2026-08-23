import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { settings, update } = useSettings();
  const navigate = useNavigate();

  const [applicant, setApplicant] = useState(settings.applicant);

  const save = () => update({ applicant });

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Profile</h2>
          <p>Applicant details used when pre-filling LinkedIn Easy Apply forms.</p>
        </div>
      </div>

      <div className="card">
        <h3>Account</h3>
        <div className="grid-2">
          <div className="form-field">
            <label>Name</label>
            <input value={user?.name || ""} disabled />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input value={user?.email || ""} disabled />
          </div>
        </div>
        <p className="field-hint">
          Signed in via your account — authentication is handled automatically, no manual API key needed.
        </p>
      </div>

      <div className="card">
        <h3>Applicant Info (for Easy Apply)</h3>
        <div className="grid-2">
          <div className="form-field">
            <label>First name</label>
            <input
              value={applicant.first_name}
              onChange={(e) => setApplicant({ ...applicant, first_name: e.target.value })}
              onBlur={save}
            />
          </div>
          <div className="form-field">
            <label>Last name</label>
            <input
              value={applicant.last_name}
              onChange={(e) => setApplicant({ ...applicant, last_name: e.target.value })}
              onBlur={save}
            />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input
              value={applicant.email}
              onChange={(e) => setApplicant({ ...applicant, email: e.target.value })}
              onBlur={save}
            />
          </div>
          <div className="form-field">
            <label>Phone</label>
            <input
              value={applicant.phone}
              onChange={(e) => setApplicant({ ...applicant, phone: e.target.value })}
              onBlur={save}
            />
          </div>
        </div>
      </div>

      <button className="btn-logout" style={{ width: 200 }} onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}