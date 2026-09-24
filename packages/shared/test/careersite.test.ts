import { describe, expect, it } from "vitest";
import {
  balancedElement,
  enrichCareerJob,
  fetchCareerSite,
  guessFromJobUrl,
  parseCareerJobPage,
  parseRssFeed,
  type Company,
  type FetchFn,
} from "../src/index.ts";

const co = (atsKey: string): Company => ({ id: "c", name: "C", ats: "careersite", atsKey, segment: "pharma", active: true });

// Shaped like jobs.bayer.com/sitemap.xml (SuccessFactors Career Site Builder RSS).
const RSS = `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Bayer</title>
<item><title>Associate Scientist, Cell Biology (Cambridge, MA, US)</title><description>&lt;p&gt;Bachelor&amp;apos;s degree in biology. Apply by October 15, 2026.&lt;/p&gt;</description><link>https://jobs.bayer.com/job/Cambridge-Associate-Scientist/1400000001/</link><guid isPermaLink="false">1400000001</guid><g:id>1400000001</g:id><g:expiration_date>2026-10-24</g:expiration_date><g:employer>Bayer</g:employer><g:job_function>Research &amp; Development</g:job_function><g:location>Cambridge, MA, US</g:location></item>
<item><title>Spécialiste Logistique (F/H/NB) - Trèbes (Trebes, Aude, FR)</title><description><![CDATA[<p>Logistique</p>]]></description><link>https://jobs.bayer.com/job/Trebes-Specialiste/1437881633/</link><guid isPermaLink="false">1437881633</guid><g:id>1437881633</g:id><g:location>Trebes, Aude, FR</g:location></item>
</channel></rss>`;

// Shaped like careers.abbvie.com/en/vacanciessitemap.xml
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://careers.abbvie.com/en/job/veteran-skillbridge-program-intern-in-north-chicago-il-jid-2680</loc><lastmod>2026-09-01T06:44:46Z</lastmod></url>
<url><loc>https://careers.abbvie.com/en/job/engineering-intern-6-months-internship-in-campoverde-lazio-jid-7175</loc></url>
<url><loc>https://careers.abbvie.com/en/about-us</loc></url>
</urlset>`;

const JSONLD_PAGE = `<html><head><script type="application/ld+json">{"@context":"http://schema.org","@type":"JobPosting","datePosted":"2026-04-30T23:57:53+00:00",
"description":"<p>Summer 2027 internship. <b>Qualifications</b></p><ul><li>Pursuing a BS in Biology</li></ul>","employmentType":["Full-time"],
"jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"North Chicago, IL"}}],
"title":"Veteran SkillBridge Program Intern","baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","minValue":25,"maxValue":32,"unitText":"HOUR"}},
"validThrough":"2126-04-30T23:57:53+00:00"}</script></head><body>x</body></html>`;

// Shaped like a jobs.boehringer-ingelheim.com job page (SuccessFactors microdata, no JSON-LD).
const MICRODATA_PAGE = `<html><head><meta property="og:title" content="SR Scientist, Clinical"></head><body>
<div class="jobDisplayShell" itemscope="itemscope" itemtype="http://schema.org/JobPosting"><span itemprop="jobLocation" itemscope="" itemtype="http://schema.org/Place"><span itemprop="address" itemscope="" itemtype="http://schema.org/PostalAddress"><meta itemprop="addressLocality" content="Athens, GA"><meta itemprop="addressRegion" content="Unit"><meta itemprop="addressCountry" content="Ge"></span></span><meta itemprop="datePosted" content="Thu Sep 03 02:00:00 UTC 2026">
<h1><span itemprop="title" data-careersite-propertyid="title">SR Scientist, Clinical
    </span></h1>
<span itemprop="description"><span class="jobdescription"><div><p>Responsible for studies.</p><span>nested</span><ul><li>Master's degree with ten (10) years of experience</li></ul></div></span></span>
<div class="footer">Similar jobs: Director of Everything</div></body></html>`;

describe("careers site: feeds", () => {
  it("reads a SuccessFactors RSS feed (title without the location suffix, country from the location)", () => {
    const jobs = parseRssFeed(co("https://jobs.bayer.com/sitemap.xml"), RSS);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      externalId: "1400000001",
      title: "Associate Scientist, Cell Biology",
      url: "https://jobs.bayer.com/job/Cambridge-Associate-Scientist/1400000001/",
      locations: ["Cambridge, MA, US"],
      country: "US",
      department: "Research & Development",
    });
    expect(jobs[0]!.descriptionText).toContain("Bachelor's degree in biology");
    expect(jobs[1]).toMatchObject({ title: "Spécialiste Logistique (F/H/NB) - Trèbes", country: "FR", descriptionText: "Logistique" });
  });

  it("guesses title and place from AbbVie-style links", () => {
    expect(guessFromJobUrl("https://careers.abbvie.com/en/job/veteran-skillbridge-program-intern-in-north-chicago-il-jid-2680")).toEqual({
      title: "Veteran Skillbridge Program Intern",
      locations: ["North Chicago, IL"],
    });
    expect(guessFromJobUrl("https://careers.abbvie.com/en/job/engineering-intern-6-months-internship-in-campoverde-lazio-jid-7175").locations).toEqual(["Campoverde Lazio"]);
    expect(guessFromJobUrl("https://jobs.boehringer-ingelheim.com/job/Athens%2C-GA-SR-Scientist%2C-Clinical-Unit/1401923733/").title).toBe("Athens, GA SR Scientist, Clinical Unit");
  });

  it("fetches a sitemap: job pages only, one request, complete", async () => {
    const fetch: FetchFn = async () => ({ status: 200, json: async () => ({}), text: async () => SITEMAP });
    const res = await fetchCareerSite({ fetch, userAgent: "t" }, co("https://careers.abbvie.com/en/vacanciessitemap.xml"));
    expect(res.jobs.map((j) => j.externalId)).toEqual([
      "https://careers.abbvie.com/en/job/veteran-skillbridge-program-intern-in-north-chicago-il-jid-2680",
      "https://careers.abbvie.com/en/job/engineering-intern-6-months-internship-in-campoverde-lazio-jid-7175",
    ]);
    expect(res).toMatchObject({ complete: true, requests: 1 });
    expect(res.jobs[0]!.descriptionText).toBeUndefined(); // read from the job page later
  });

  it("follows a sitemap index", async () => {
    const index = `<sitemapindex><sitemap><loc>https://x.com/jobs-1.xml</loc></sitemap></sitemapindex>`;
    const fetch: FetchFn = async (url) => ({ status: 200, json: async () => ({}), text: async () => (url.endsWith("jobs-1.xml") ? SITEMAP : index) });
    const res = await fetchCareerSite({ fetch, userAgent: "t" }, co("https://x.com/sitemap.xml"));
    expect(res.jobs).toHaveLength(2);
    expect(res.requests).toBe(2);
  });

  it("refuses an empty feed instead of closing every job", async () => {
    const fetch: FetchFn = async () => ({ status: 200, json: async () => ({}), text: async () => "<urlset></urlset>" });
    await expect(fetchCareerSite({ fetch, userAgent: "t" }, co("https://x.com/sitemap.xml"))).rejects.toThrow(/no job links/);
  });
});

describe("careers site: job pages", () => {
  it("reads JSON-LD JobPosting", () => {
    const d = parseCareerJobPage(JSONLD_PAGE);
    expect(d).toMatchObject({
      title: "Veteran SkillBridge Program Intern",
      locations: ["North Chicago, IL"],
      postedAt: "2026-04-30T23:57:53.000Z",
      employmentTypeText: "Full-time",
      salary: { min: 25, max: 32, period: "hour", currency: "USD" },
    });
    expect(d.descriptionText).toContain("Pursuing a BS in Biology");
  });

  it("reads SuccessFactors microdata (and ignores junk region/country)", () => {
    const d = parseCareerJobPage(MICRODATA_PAGE);
    expect(d.title).toBe("SR Scientist, Clinical");
    expect(d.locations).toEqual(["Athens, GA"]);
    expect(d.country).toBeUndefined();
    expect(d.postedAt).toBe("2026-09-03T02:00:00.000Z");
    expect(d.descriptionText).toContain("ten (10) years of experience");
    expect(d.descriptionText).not.toContain("Director of Everything"); // stops at the end of the description
  });

  it("balancedElement handles nested tags", () => {
    const html = `<div><span class="a">x<span>y</span>z</span><span>after</span></div>`;
    expect(balancedElement(html, html.indexOf('<span class="a">'))).toBe(`<span class="a">x<span>y</span>z</span>`);
  });

  it("enrich replaces the guessed title and location", async () => {
    const fetch: FetchFn = async () => ({ status: 200, json: async () => ({}), text: async () => JSONLD_PAGE });
    const job = await enrichCareerJob({ fetch, userAgent: "t" }, co("https://x"), {
      companyId: "c",
      externalId: "u",
      title: "Veteran Skillbridge Program Intern",
      url: "https://careers.abbvie.com/en/job/x-jid-1",
      locations: [],
      remote: false,
      postedAt: null,
    });
    expect(job).toMatchObject({ title: "Veteran SkillBridge Program Intern", locations: ["North Chicago, IL"], postedAt: "2026-04-30T23:57:53.000Z" });
    expect(job.detailHints?.salary).toMatchObject({ min: 25, max: 32 });
  });
});
