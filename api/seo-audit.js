const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)))
const toPercent = (rawScore) => clampScore((rawScore ?? 0) * 100)

const extractHighlights = (lhr) => {
  const audits = lhr?.audits ?? {}
  const opportunities = [
    audits['largest-contentful-paint'],
    audits['cumulative-layout-shift'],
    audits['unused-javascript'],
    audits['render-blocking-resources'],
  ]

  return opportunities
    .filter(Boolean)
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 4)
    .map((item) => item.title)
}

const emptyFindings = {
  seoIssues: [],
  aiSeoIssues: [],
  h1NeedsAttention: [],
}

const buildPayloadFromScores = ({ seoScore, perfScore, priorityTasks, source, detailedFindings }) => {
  const sessionsEstimate = Math.round(12000 + seoScore * 210 + perfScore * 140)
  const keywordsEstimate = Math.round(300 + seoScore * 9)
  const authorityEstimate = clampScore(35 + Math.round((seoScore + perfScore) / 6))

  return {
    source,
    detailedFindings: detailedFindings || emptyFindings,
    coreMetrics: [
      {
        label: 'SEO Health Score',
        value: `${seoScore}/100`,
        trend: source === 'pagespeed' ? 'Live pull from PageSpeed' : 'Quick on-page scan (instant)',
      },
      {
        label: 'Organic Sessions',
        value: sessionsEstimate.toLocaleString(),
        trend: 'Estimated from SEO and performance signals',
      },
      {
        label: 'Ranking Keywords',
        value: keywordsEstimate.toLocaleString(),
        trend: 'Estimated visibility footprint',
      },
      {
        label: 'Backlink Authority',
        value: `${authorityEstimate}`,
        trend: 'Modeled authority estimate',
      },
    ],
    aiSeoMetrics: [
      {
        title: 'AI Overview Visibility',
        value: `${clampScore(Math.round(seoScore * 0.44))}%`,
        note: 'Projected visibility from content and technical quality',
      },
      {
        title: 'LLM Citation Readiness',
        value: `${clampScore(Math.round((seoScore + perfScore) / 2))}%`,
        note: 'Technical + content reliability signal',
      },
      {
        title: 'Entity Trust Coverage',
        value: `${clampScore(Math.round(seoScore * 0.72))}%`,
        note: 'Entity confidence modeled from audit factors',
      },
    ],
    priorityTasks:
      priorityTasks.length > 0
        ? priorityTasks
        : ['Review core on-page signals and run a full Lighthouse audit when available.'],
  }
}

const fetchWithTimeout = async (url, timeoutMs, init = {}) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

const probeCommonPages = async (baseUrl) => {
  const paths = ['/', '/services', '/about', '/contact', '/blog']
  const checks = await Promise.all(
    paths.map(async (path) => {
      const target = new URL(path, baseUrl).toString()
      try {
        const res = await fetchWithTimeout(target, 2200, {
          redirect: 'follow',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; RankRiotQuickScan/1.0; +https://rank-riot.vercel.app)',
            Accept: 'text/html,application/xhtml+xml',
          },
        })
        const html = await res.text()
        const slice = html.slice(0, 120_000)
        const h1Count = (slice.match(/<h1\b/gi) || []).length
        return { page: target, ok: res.ok, status: res.status, h1Count }
      } catch {
        return { page: target, ok: false, status: 0, h1Count: -1 }
      }
    }),
  )

  const h1NeedsAttention = checks
    .filter((item) => item.ok && item.h1Count !== 1)
    .map((item) => ({
      page: item.page,
      issue: item.h1Count === 0 ? 'Missing H1' : `Multiple H1 tags (${item.h1Count})`,
      fix: 'Use exactly one descriptive H1 aligned to search intent.',
    }))

  const availabilityIssues = checks
    .filter((item) => !item.ok)
    .slice(0, 3)
    .map((item) => ({
      page: item.page,
      issue: item.status ? `HTTP ${item.status}` : 'Unavailable',
      fix: 'Verify route publishing, redirects, and crawl accessibility.',
    }))

  return { h1NeedsAttention, availabilityIssues }
}

const runQuickHeuristicAudit = async (pageUrl) => {
  const start = Date.now()
  const res = await fetchWithTimeout(
    pageUrl.toString(),
    4000,
    {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; RankRiotQuickScan/1.0; +https://rank-riot.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    },
  )

  const ms = Date.now() - start
  const html = await res.text()
  const slice = html.slice(0, 250_000)

  const titleMatch = slice.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''
  const descMatch = slice.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  )
  const desc = descMatch ? descMatch[1].trim() : ''
  const h1Count = (slice.match(/<h1\b/gi) || []).length
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(slice)
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(slice)
  const hasOg = /<meta[^>]+property=["']og:title["']/i.test(slice)
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(slice)

  let score = 0
  const tasks = []

  if (res.ok) score += 22
  else tasks.push(`Homepage returned HTTP ${res.status}. Fix availability for crawlers and users.`)

  if (title.length >= 10 && title.length <= 70) score += 18
  else if (title.length > 0) {
    score += 8
    tasks.push('Tune the title tag length (aim for ~30–60 characters with primary intent).')
  } else tasks.push('Add a unique <title> tag on the homepage.')

  if (desc.length >= 50 && desc.length <= 170) score += 18
  else if (desc.length > 0) {
    score += 8
    tasks.push('Improve meta description length and clarity (aim ~120–155 characters).')
  } else tasks.push('Add a compelling meta description for the homepage.')

  if (h1Count === 1) score += 12
  else if (h1Count === 0) tasks.push('Add exactly one clear H1 that matches the page intent.')
  else tasks.push('Use a single primary H1; demote extra headings to H2/H3.')

  if (hasCanonical) score += 10
  else tasks.push('Add a canonical URL to reduce duplicate-content ambiguity.')

  if (hasViewport) score += 8
  else tasks.push('Add a viewport meta tag for proper mobile rendering.')

  if (hasOg) score += 6
  else tasks.push('Add Open Graph tags to improve sharing previews and AI context.')

  if (hasJsonLd) score += 10
  else tasks.push('Add structured data (JSON-LD) for key entities and FAQs where relevant.')

  if (ms < 1500) score += 8
  else if (ms < 3500) score += 4
  else tasks.push(`First response was slow (~${Math.round(ms / 1000)}s). Improve server and asset performance.`)

  const seoScore = clampScore(score)
  const perfScore = clampScore(55 - Math.min(40, Math.round((ms - 500) / 120)))

  const pageProbe = await probeCommonPages(pageUrl)

  return buildPayloadFromScores({
    seoScore,
    perfScore,
    priorityTasks: tasks.slice(0, 6),
    source: 'quick-scan',
    detailedFindings: {
      seoIssues: pageProbe.availabilityIssues,
      aiSeoIssues: [
        {
          page: pageUrl.toString(),
          issue: hasJsonLd ? 'No critical AISEO markup issue found on homepage.' : 'Missing JSON-LD',
          fix: hasJsonLd
            ? 'Continue expanding structured data to service and blog pages.'
            : 'Add Organization, WebSite, and FAQ/Service schema where relevant.',
        },
        ...(hasOg
          ? []
          : [
              {
                page: pageUrl.toString(),
                issue: 'Missing Open Graph title metadata',
                fix: 'Add og:title/og:description/og:image to improve snippet and AI context.',
              },
            ]),
      ],
      h1NeedsAttention: pageProbe.h1NeedsAttention,
    },
  })
}

export default async function handler(req, res) {
  const domain = req.query.domain

  if (!domain) {
    return res.status(400).json({ error: 'Missing required domain parameter.' })
  }

  let url
  try {
    url = new URL(domain)
  } catch {
    return res.status(400).json({ error: 'Domain must be a full URL like https://example.com.' })
  }

  const apiKey = process.env.PAGESPEED_API_KEY
  const buildEndpoint = ({ strategy, categories }) =>
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' +
    `url=${encodeURIComponent(url.toString())}` +
    `&strategy=${encodeURIComponent(strategy)}` +
    categories.map((category) => `&category=${encodeURIComponent(category)}`).join('') +
    (apiKey ? `&key=${encodeURIComponent(apiKey)}` : '')

  const tryPageSpeed = async () => {
    const endpoint = buildEndpoint({ strategy: 'mobile', categories: ['SEO'] })
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5500)
    try {
      const response = await fetch(endpoint, { signal: controller.signal })
      const data = await response.json()
      if (!response.ok) {
        const reason = data?.error?.message || 'Failed to retrieve PageSpeed results.'
        throw new Error(reason)
      }
      const categories = data?.lighthouseResult?.categories ?? {}
      const seoScore = toPercent(categories?.seo?.score)
      const perfScore =
        categories?.performance?.score != null
          ? toPercent(categories.performance.score)
          : clampScore(Math.round(seoScore * 0.82))

      const audits = data?.lighthouseResult?.audits ?? {}
      const seoIssues = Object.values(audits)
        .filter((audit) => typeof audit?.score === 'number' && audit.score < 0.9)
        .slice(0, 5)
        .map((audit) => ({
          page: url.toString(),
          issue: audit.title || 'SEO audit issue',
          fix: audit.description || 'Review this audit item and apply recommended fix.',
        }))

      return buildPayloadFromScores({
        seoScore,
        perfScore,
        priorityTasks: extractHighlights(data?.lighthouseResult),
        source: 'pagespeed',
        detailedFindings: {
          seoIssues,
          aiSeoIssues: [
            {
              page: url.toString(),
              issue: 'AISEO deep page mapping not available in PageSpeed mode.',
              fix: 'Run fallback quick scan or add crawler integration for page-level AISEO diagnostics.',
            },
          ],
          h1NeedsAttention: [],
        },
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  try {
    try {
      const payload = await tryPageSpeed()
      return res.status(200).json(payload)
    } catch (firstError) {
      const quick = await runQuickHeuristicAudit(url)
      return res.status(200).json({
        ...quick,
        note:
          firstError?.name === 'AbortError' || firstError?.message?.includes('timed')
            ? 'PageSpeed was slow or hit a platform time limit. Showing instant quick-scan results.'
            : 'PageSpeed unavailable. Showing instant quick-scan results.',
      })
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Audit provider timed out. Please retry in a few seconds.' })
    }
    return res.status(500).json({ error: 'Audit service unavailable. Please try again in a moment.' })
  }
}
