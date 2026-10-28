// Synthetic fixtures that mirror each publisher's markup structure (verified 2026-10-28).
// Content is invented for testing; no publisher text is reproduced.

export const VATICAN_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Vatican News</title><link>https://www.vaticannews.va/en.html</link>
<item><title><![CDATA[Pope Leo announces consistory for new cardinals]]></title>
<link>https://www.vaticannews.va/en/pope/news/2026-10/test-consistory.html?utm_source=rss</link>
<description><![CDATA[<p>The Holy Father announced a <b>consistory</b> in a test fixture.</p>]]></description>
<pubDate>Wed, 28 Oct 2026 10:00:00 +0100</pubDate></item>
<item><title><![CDATA[Regional conference on peace held abroad]]></title>
<link>https://www.vaticannews.va/en/world/news/2026-10/test-peace.html</link>
<description><![CDATA[A routine international fixture.]]></description>
<pubDate>Wed, 28 Oct 2026 09:00:00 +0100</pubDate></item>
<item><title></title><link>https://www.vaticannews.va/en/broken.html</link></item>
</channel></rss>`;

export const ALBERTA_HTML = `<html><body>
<div class="goa-news--listings"><ul>
<li><time datetime="2026-10-27T15:30:00Z">October 27, 2026</time><a href="https://www.alberta.ca/announcements.cfm?xID=TEST1">Separate school funding policy update</a></li>
</ul></div>
<div id="block-newsfeedblock"><ul class="goa-news goa-news--release">
<li><div class="goa-date">Oct 27, 2026</div><div class="goa-title"><a href=https://www.alberta.ca/announcements.cfm?xID=TEST1>Separate school funding policy update</a></div><div class="goa-text"><p>Alberta&rsquo;s government announces new legislation affecting separate school funding.</p></div></li>
<li><div class="goa-date">Oct 26, 2026</div><div class="goa-title"><a href=https://www.alberta.ca/announcements.cfm?xID=TEST2>Highway resurfacing schedule</a></div><div class="goa-text"><p>Crews will resurface lanes.</p></div></li>
</ul></div></body></html>`;

export const COVENANT_HTML = `<html><body><div class="view-content">
<div class="views-row"><article class="node"><div class="content-wrapper">
<h2><a href="/news-and-events/news/test-safety"><span>Misericordia installs new safety systems</span></a></h2>
<p>Fixture lede about a safety change at an Edmonton hospital.</p>
<div class="categories"><a href="/taxonomy/term/1">Safety</a></div>
<p class="published"><p class="date">October 27, 2026</p></p></div></article></div>
<div class="views-row"><article class="node"><div class="content-wrapper">
<h2><a href="/news-and-events/news/test-meet"><span>Meet a test nurse</span></a></h2>
<p>Profile fixture.</p><p class="date">October 20, 2026</p></div></article></div>
</div></body></html>`;

export const ECSD_LISTING = `<html><body><div class="row news-wrapper">
<article><div class="news-item"><a class="format-card" href="/news/test-opening"><div class="news-text"><div class="news-title">Grand opening of a test Catholic school</div></div></a></div></article>
<article><div class="news-item"><a class="format-card" href="/news/test-budget"><div class="news-text"><div class="news-title">Board approves test budget</div></div></a></div></article>
<article><div class="news-item"><a class="format-card" href="/news/test-opening"><div class="news-text"><div class="news-title">Grand opening of a test Catholic school</div></div></a></div></article>
</div></body></html>`;

/** Mirrors ECSD's JSON-LD, including raw newlines inside string values (invalid strict JSON). */
export const ecsdArticle = (published: string) => `<html><head>
<meta name="description" content="Meta description fallback.">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "
      Grand opening of a test Catholic school
  ",
  "datePublished": "${published}",
  "dateModified": "2026-10-15 17:26:08.715247 +0000 UTC",
  "description": "Fixture description of the opening."
}
</script></head><body></body></html>`;
