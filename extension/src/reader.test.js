import { describe, expect, it } from "vitest";
import { jobLink, readJobs, siteFor } from "./reader.js";

function page(html) {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  );
}

const NAUKRI = `
<div class="list">
  <article class="jobTuple" data-job-id="1">
    <a class="title" href="https://www.naukri.com/job-listings-python-developer-orbit-labs-pune-3-to-5-years-311024000001?src=srp">Python Developer</a>
    <div><a class="comp-name" href="https://www.naukri.com/orbit-labs-jobs-careers-1">Orbit Labs</a></div>
    <span class="exp">3-5 Yrs</span><span class="sal">Not disclosed</span><span class="loc">Pune</span>
    <span class="posted">2 days ago</span>
    <a href="https://www.naukri.com/job-listings-python-developer-orbit-labs-pune-3-to-5-years-311024000001">Apply</a>
  </article>
  <article class="jobTuple" data-job-id="2">
    <a class="title" href="/job-listings-data-engineer-kite-mumbai-311024000002">Data Engineer</a>
    <div>Kite Analytics</div><span>Mumbai, Maharashtra</span><span>Just now</span>
  </article>
  <a href="https://www.naukri.com/python-jobs">See more Python jobs</a>
</div>`;

describe("siteFor / jobLink", () => {
  it("knows the supported sites and nothing else", () => {
    expect(siteFor("https://www.naukri.com/python-jobs")).toBe("naukri");
    expect(siteFor("https://in.indeed.com/jobs?q=python")).toBe("indeed");
    expect(siteFor("https://www.glassdoor.co.in/Job/index.htm")).toBe("glassdoor");
    expect(siteFor("https://evil.example/naukri.com")).toBeNull();
  });

  it("turns tracking and site links into one canonical job link", () => {
    expect(
      jobLink(
        "linkedin",
        "/jobs/view/senior-dev-at-acme-4012345678/?trk=x",
        "https://www.linkedin.com/jobs/search",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4012345678");
    expect(
      jobLink("indeed", "/rc/clk?jk=abc123def4567890&from=serp", "https://in.indeed.com/jobs?q=x"),
    ).toBe("https://in.indeed.com/viewjob?jk=abc123def4567890");
    expect(
      jobLink(
        "glassdoor",
        "/job-listing/backend-acme-JV_KO0,7.htm?jl=1009512345678&pos=1",
        "https://www.glassdoor.co.in/Job/x.htm",
      ),
    ).toBe("https://www.glassdoor.co.in/partner/jobListing.htm?jobListingId=1009512345678");
    expect(
      jobLink("naukri", "https://www.naukri.com/python-jobs", "https://www.naukri.com/"),
    ).toBeNull();
    expect(jobLink("naukri", "javascript:alert(1)", "https://www.naukri.com/")).toBeNull();
  });
});

describe("readJobs", () => {
  it("reads each card: title, company, place, posted — once per job", () => {
    const { site, jobs } = readJobs(page(NAUKRI), "https://www.naukri.com/python-jobs-in-pune");
    expect(site).toBe("naukri");
    expect(jobs).toHaveLength(2);
    const [py, de] = jobs;
    expect(py).toMatchObject({
      title: "Python Developer",
      company: "Orbit Labs",
      location: "Pune",
      posted: "2 days ago",
    });
    expect(py.url).toBe(
      "https://www.naukri.com/job-listings-python-developer-orbit-labs-pune-3-to-5-years-311024000001",
    );
    expect(de).toMatchObject({
      title: "Data Engineer",
      company: "Kite Analytics",
      location: "Mumbai, Maharashtra",
    });
    expect(de.url.startsWith("https://www.naukri.com/job-listings-data-engineer")).toBe(true);
  });

  it("reads a job detail page from its JSON-LD", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Backend Engineer",
      hiringOrganization: { "@type": "Organization", name: "Acme" },
      jobLocation: { address: { addressLocality: "Bengaluru", addressCountry: "IN" } },
      datePosted: "2026-10-30",
      description: "<p>Build <b>APIs</b>.</p><img src=x onerror=alert(1)>",
    };
    const doc = page(
      `<script type="application/ld+json">${JSON.stringify(ld)}</script><h1>Backend Engineer</h1>`,
    );
    const { jobs } = readJobs(
      doc,
      "https://www.glassdoor.co.in/job-listing/backend-acme-JV_KO0,7.htm?jl=1009512345678",
    );
    expect(jobs).toEqual([
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Bengaluru, IN",
        url: "https://www.glassdoor.co.in/partner/jobListing.htm?jobListingId=1009512345678",
        posted: "2026-10-30",
        description: "Build APIs.",
      },
    ]);
  });

  it("finds nothing on unsupported sites", () => {
    expect(readJobs(page(NAUKRI), "https://example.com/jobs")).toEqual({ site: null, jobs: [] });
  });
});
