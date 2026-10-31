/**
 * Job Finder capture — reads the jobs that are already on the page the user is looking at.
 *
 * No requests, no clicking, no scrolling: only the DOM the site has already shown. Two ways in:
 *   1. JSON-LD `JobPosting` blocks (job detail pages publish them for search engines);
 *   2. links to job pages (the same link rules as the backend's alert-email parser), each with the short
 *      lines of its own card: title, company, place, posted.
 * Pure functions of (document, page URL) so they can be unit-tested with saved pages.
 */

export const MAX_JOBS = 100;

/** site key -> page hosts + how a job link looks + its canonical form (matches backend extension.SITES). */
export const SITES = {
  naukri: {
    hosts: ["naukri.com"],
    link: /^https:\/\/(?:www\.)?naukri\.com\/job-listings-[\w%-]+/i,
    canon: (m) => m[0],
  },
  foundit: {
    hosts: ["foundit.in", "foundit.com", "monsterindia.com"],
    link: /^https:\/\/(?:www\.)?(?:foundit\.(?:in|com)|monsterindia\.com)\/job\/[\w%-]+/i,
    canon: (m) => m[0],
  },
  glassdoor: {
    hosts: ["glassdoor.com", "glassdoor.co.in", "glassdoor.co.uk", "glassdoor.ca"],
    link: /^https:\/\/(?:www\.)?(glassdoor\.(?:com|co\.in|co\.uk|ca))\/(?:job-listing\/[^?#]+\?(?:[^#]*?&)?jl=(\d+)|partner\/jobListing\.htm\?(?:[^#]*?&)?jobListingId=(\d+))/i,
    canon: (m) =>
      `https://www.${m[1].toLowerCase()}/partner/jobListing.htm?jobListingId=${m[2] || m[3]}`,
  },
  linkedin: {
    hosts: ["linkedin.com"],
    link: /^https:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[\w-]*?-)?(\d{6,})/i,
    canon: (m) => `https://www.linkedin.com/jobs/view/${m[1]}`,
  },
  indeed: {
    hosts: ["indeed.com", "indeed.co.in", "indeed.co.uk"],
    link: /^https:\/\/([\w-]+\.)?(indeed\.(?:com|co\.in|co\.uk))\/[^#]*?[?&](?:jk|vjk)=([0-9a-f]{8,})/i,
    canon: (m) => `https://${m[1] || "www."}${m[2].toLowerCase()}/viewjob?jk=${m[3]}`,
  },
};

const GENERIC =
  /^(apply|apply now|easy apply|quick apply|view( job| details)?|see (job|more)|know more|save|saved|share|hide|report|promoted|new|actively hiring|\d+ (new )?jobs?.*|view all.*|.{0,2})$/i;
const LOCATION =
  /^(remote|hybrid|on-?site|work from home|wfh)$|^[A-Z][A-Za-z.\- ]{1,30}(?:\s*[,/()]\s*[A-Z][A-Za-z.\- ]{1,30}){0,4}\)?$/;
const NOT_LOCATION =
  /\b(yrs?|years?|lpa|lakh|salary|posted|ago|apply|days?|hours?|not disclosed|reviews?|rating|★|\d\.\d)\b/i;
const POSTED =
  /\b(just now|today|yesterday|\d+\+?\s*(?:minute|min|hour|hr|day|week|month)s?\s*ago|posted\s+.+|\d+\s*[dhw]\b)/i;
const SALARYISH =
  /(₹|\$|€|£|\blpa\b|\blakh|\bper (year|month|annum)|\bk\b\s*-|\d+\s*-\s*\d+\s*yrs?)/i;

/** Which supported site a page belongs to, or null. */
export function siteFor(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, site] of Object.entries(SITES)) {
    if (site.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return key;
  }
  return null;
}

/** A link (or a tracking link wrapping one) -> the canonical job URL on this site, or null. */
export function jobLink(site, href, base) {
  let abs;
  try {
    abs = new URL(href, base).href;
  } catch {
    return null;
  }
  const candidates = [abs];
  try {
    candidates.push(decodeURIComponent(abs));
  } catch {
    /* not double-encoded */
  }
  for (const c of candidates) {
    const m = SITES[site].link.exec(c);
    if (m) return SITES[site].canon(m);
    const inner = /[?&](?:url|u|dest|target)=(https?[^&]+)/i.exec(c);
    if (inner) {
      try {
        const m2 = SITES[site].link.exec(decodeURIComponent(inner[1]));
        if (m2) return SITES[site].canon(m2);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

/** Visible-ish text lines of an element: one line per text-bearing element, in order. */
function lines(el) {
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const tag = parent ? parent.tagName : "";
    if (tag !== "SCRIPT" && tag !== "STYLE" && tag !== "NOSCRIPT") {
      const text = clean(node.textContent);
      if (text) {
        if (out.length && parent && parent === out[out.length - 1].parent) {
          out[out.length - 1].text = clean(`${out[out.length - 1].text} ${text}`);
        } else out.push({ text, parent });
      }
    }
    node = walker.nextNode();
  }
  return out.map((l) => l.text);
}

/** The smallest ancestor that looks like this job's own card (holds only this job's link). */
function cardOf(anchor, site, base) {
  let el = anchor;
  let best = anchor;
  for (let i = 0; i < 7 && el.parentElement; i += 1) {
    el = el.parentElement;
    const links = new Set();
    for (const a of el.querySelectorAll("a[href]")) {
      const u = jobLink(site, a.getAttribute("href"), base);
      if (u) links.add(u);
      if (links.size > 1) return best;
    }
    const len = clean(el.textContent).length;
    if (len > 2500) return best;
    best = el;
    if (
      /^(LI|ARTICLE)$/.test(el.tagName) ||
      el.hasAttribute("data-job-id") ||
      el.hasAttribute("data-jk")
    )
      return el;
  }
  return best;
}

function fromCard(anchor, site, base, url) {
  const label = clean(
    anchor.getAttribute("aria-label") || anchor.textContent || anchor.getAttribute("title"),
  );
  const card = cardOf(anchor, site, base);
  const ls = lines(card).filter((l) => l.length <= 160);
  let title = label && !GENERIC.test(label) && label.length <= 160 ? label : "";
  if (!title) {
    const heading = card.querySelector("h1,h2,h3,h4,[class*='title' i]");
    title = clean(heading && heading.textContent);
  }
  if (!title || GENERIC.test(title)) return null;
  const rest = ls.filter((l) => l !== title && !l.startsWith(title) && !GENERIC.test(l));
  const company =
    rest.find((l) => !POSTED.test(l) && !SALARYISH.test(l) && !/^\d/.test(l) && l.length <= 80) ||
    "";
  const location =
    rest.find(
      (l) => l !== company && l.length <= 80 && LOCATION.test(l) && !NOT_LOCATION.test(l),
    ) || "";
  const posted = (rest.find((l) => POSTED.test(l) && l.length <= 40) || "").slice(0, 60);
  return { title, company, location, url, posted, description: "" };
}

function fromJsonLd(doc, site, pageUrl) {
  const out = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try {
      data = JSON.parse(s.textContent || "");
    } catch {
      continue;
    }
    const items = [].concat(data && data["@graph"] ? data["@graph"] : data);
    for (const item of items) {
      if (!item || item["@type"] !== "JobPosting" || !item.title) continue;
      const place = [].concat(item.jobLocation || [])[0];
      const addr = (place && place.address) || {};
      const location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .map((x) => (typeof x === "object" && x ? x.name : x))
        .filter(Boolean)
        .join(", ");
      const own = jobLink(site, item.url || pageUrl, pageUrl) || jobLink(site, pageUrl, pageUrl);
      if (!own) continue;
      const org = item.hiringOrganization;
      // DOMParser documents are inert (no scripts, no image loads), unlike setting innerHTML.
      const description = clean(
        new DOMParser().parseFromString(String(item.description || ""), "text/html").body
          .textContent,
      ).slice(0, 5000);
      out.push({
        title: clean(item.title),
        company: clean(typeof org === "object" && org ? org.name : org),
        location: location || (item.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
        url: own,
        posted: clean(item.datePosted),
        description,
      });
    }
  }
  return out;
}

/** Every job on the page, de-duplicated by link, at most MAX_JOBS. */
export function readJobs(doc, pageUrl) {
  const site = siteFor(pageUrl);
  if (!site) return { site: null, jobs: [] };
  const jobs = new Map();
  for (const job of fromJsonLd(doc, site, pageUrl)) jobs.set(job.url, job);
  for (const a of doc.querySelectorAll("a[href]")) {
    if (jobs.size >= MAX_JOBS) break;
    const url = jobLink(site, a.getAttribute("href"), pageUrl);
    if (!url) continue;
    const prev = jobs.get(url);
    if (prev && prev.title) continue;
    const job = fromCard(a, site, pageUrl, url);
    if (!job) continue;
    // A JSON-LD copy of the same job wins field by field; the card fills what it lacks.
    const keep = prev ? Object.fromEntries(Object.entries(prev).filter(([, v]) => v)) : {};
    jobs.set(url, { ...job, ...keep });
  }
  return { site, jobs: [...jobs.values()].filter((j) => j.title).slice(0, MAX_JOBS) };
}
