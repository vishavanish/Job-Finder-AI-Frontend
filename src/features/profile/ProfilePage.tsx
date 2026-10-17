/**
 * Profile & Resume (spec §6.7): resume versions with an AI parse to review,
 * job preferences, applicant info for apply forms and optional EEO answers.
 * Everything is stored on the server — nothing here lives in the browser.
 */
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "../../lib/api/errors";
import { useAuth } from "../../context/AuthContext";
import { getPreferences, getProfile, profileKeys } from "./profileApi";
import { ResumeSection } from "./ResumeSection";
import { ApplicantSection, EeoSection, PreferencesSection } from "./ProfileSections";
import "./profile.css";

export default function ProfilePage() {
  const { user } = useAuth();
  const profile = useQuery({ queryKey: profileKeys.profile, queryFn: getProfile });
  const prefs = useQuery({ queryKey: profileKeys.preferences, queryFn: getPreferences });

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h2>Profile and resume</h2>
          <p>
            {user?.email ? `Signed in as ${user.email}. ` : ""}Your resume is what every job is
            scored against; your preferences shape every search.
          </p>
        </div>
      </div>

      <ResumeSection />

      {(profile.isLoading || prefs.isLoading) && (
        <p className="empty-state" role="status">
          Loading your profile…
        </p>
      )}
      {(profile.isError || prefs.isError) && (
        <p className="login-error" role="alert">
          {errorMessage(profile.error ?? prefs.error, "Couldn't load your profile.")}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void profile.refetch();
              void prefs.refetch();
            }}
          >
            Try again
          </button>
        </p>
      )}
      {prefs.data && <PreferencesSection initial={prefs.data} />}
      {profile.data && (
        <>
          <ApplicantSection profile={profile.data} />
          <EeoSection profile={profile.data} />
        </>
      )}
    </div>
  );
}
