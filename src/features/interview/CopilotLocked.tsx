/** Live Copilot when the account doesn't include it: what it is and how to get it (F7.1). */
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { IconTile, PageHeader } from "../../components/PageKit";
import { InterviewNav } from "./parts";
import "./interview.css";

const POINTS = [
  { icon: "mic" as const, text: "Hears the interviewer's questions from your call tab or mic." },
  { icon: "sparkle" as const, text: "Drafts answers from your resume and approved story bank." },
  { icon: "eyeOff" as const, text: "Says “not sure” instead of making things up." },
];

export function CopilotLocked({ reason }: { reason: string }) {
  return (
    <div className="iv-page">
      <PageHeader
        eyebrow="Live interview help"
        title="Live Copilot"
        sub="Suggested answers to the interviewer's questions, from your own resume and stories, while you talk."
      />
      <InterviewNav />
      <section className="card kit-card iv-locked" role="alert">
        <IconTile icon="lock" tone="muted" size="lg" />
        <h3>Live Copilot isn&apos;t available</h3>
        <p>{reason}</p>
        <ul className="iv-locked-points">
          {POINTS.map((p) => (
            <li key={p.text}>
              <Icon name={p.icon} size={16} />
              {p.text}
            </li>
          ))}
        </ul>
        <Link to="/interview" className="btn-run iv-icon-btn">
          <Icon name="mic" size={15} />
          Practice instead
        </Link>
      </section>
    </div>
  );
}
