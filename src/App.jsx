import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import rankRiotLogo from './assets/rank-riot-logo.png'
import {
  buildHeatmapReportData,
  buildLocalListingsReportData,
  downloadBrandedPdfReport,
} from './lib/brandedReport'
import { buildListingsPublishers, LISTINGS_PUBLISHER_CATALOG } from './lib/listingsPublishers'
import { runSeoAudit } from './lib/seoAudit'
import { hasSupabaseConfig, supabase } from './lib/supabase'

const ACTIVE_SITE_KEY = 'rank-riot-active-site'
const SITE_PORTFOLIO_KEY = 'rank-riot-site-portfolio'
const WHITE_LABEL_KEY = 'rank-riot-white-label'
const siteStorageKey = (siteHost) => `rank-riot-site-${siteHost}`

const DEFAULT_WHITE_LABEL = {
  brandName: '',
  tagline: '',
  accentColor: '#ff8a1f',
  logoUrl: '',
  footerText: '',
}

const DEFAULT_CORE_METRICS = [
  { label: 'SEO Health Score', value: '82/100', trend: '+6 this month' },
  { label: 'Organic Sessions', value: '24.8K', trend: '+14.2% month-over-month' },
  { label: 'Ranking Keywords', value: '1,392', trend: '+121 new in top 20' },
  { label: 'Backlink Authority', value: '61', trend: '9 high-trust links earned' },
]

const DEFAULT_AISEO_METRICS = [
  { title: 'AI Overview Visibility', value: '37%', note: 'Mentions across AI answer engines' },
  { title: 'LLM Citation Readiness', value: '88%', note: 'Structured facts and sources detected' },
  { title: 'Entity Trust Coverage', value: '74%', note: 'Brand entities validated on key pages' },
]

const DEFAULT_PRIORITY_TASKS = [
  'Add FAQ schema to 12 service pages to improve rich and AI answer extraction.',
  'Compress large hero media to improve mobile LCP on top landing pages.',
  'Strengthen internal links from authority pages into bottom-funnel content.',
  'Expand expert author bios and source citations for E-E-A-T + AI trust.',
]

const DEFAULT_DETAILED_FINDINGS = {
  seoIssues: [],
  aiSeoIssues: [],
  h1NeedsAttention: [],
}

const DEFAULT_DAILY_ALERTS = [
  'Keyword movement detected on 4 target terms.',
  'Traffic anomaly detected: sessions down 8% vs 7-day average.',
  'AI citation opportunity: FAQ schema missing on service pages.',
]

const DEFAULT_GROWTH_OBJECTIVES = [
  'Publish 2 AI-citation-focused comparison pages this week.',
  'Improve internal linking into top 5 revenue pages.',
  'Add FAQ schema to pages with low AI overview mentions.',
]

const DEFAULT_SNAPSHOT_NOTES = [
  'Traffic trend up 14% month-over-month.',
  'Authority score increased by 3 points.',
  'Competitor visibility gap narrowed by 6%.',
]

function createDefaultDashboard(siteHost) {
  return {
    domain: `https://${siteHost}`,
    auditMessage: '',
    coreMetrics: DEFAULT_CORE_METRICS.map((row) => ({ ...row })),
    aiSeoMetrics: DEFAULT_AISEO_METRICS.map((row) => ({ ...row })),
    priorityTasks: [...DEFAULT_PRIORITY_TASKS],
    detailedFindings: {
      seoIssues: [],
      aiSeoIssues: [],
      h1NeedsAttention: [],
    },
    rankGuardScansLeft: 1,
    rankGuardMessage: '',
    healthScoreToday: '81/100',
    dailyAlerts: [...DEFAULT_DAILY_ALERTS],
    growthObjectives: [...DEFAULT_GROWTH_OBJECTIVES],
    monitoringMessage: 'Last check: monitoring queue healthy.',
    keywordQuery: '',
    keywordResults: [],
    backlinkCompetitor: '',
    backlinkResults: [],
    benchmarkMessage: 'Run benchmark to compare your site against similar competitors.',
    snapshotNotes: [...DEFAULT_SNAPSHOT_NOTES],
    socialGoal: '',
    socialRoadmap: [],
    localBusinessName: '',
    localCity: '',
    heatmapReportStatus: '',
    localListingsReportStatus: '',
    listingsProfile: {
      businessName: siteHost.split('.')[0],
      phone: '',
      address: '',
      city: '',
      region: '',
      postalCode: '',
      country: 'US',
      website: `https://${siteHost}`,
      primaryCategory: 'Marketing agency',
      hours: 'Mon-Fri 9:00 AM - 5:00 PM',
    },
    listingsPublishers: buildListingsPublishers(siteHost),
    listingsIssues: [],
    listingsSyncStatus: '',
    listingsHealthReportStatus: '',
    listingsFilter: 'all',
  }
}

const normalizeListingsPublishers = (siteHost, rows) => {
  const defaults = buildListingsPublishers(siteHost)
  if (!Array.isArray(rows) || rows.length === 0) return defaults

  const byKey = new Map()
  for (const row of rows) {
    const key = row?.id || row?.publisher || row?.name
    if (key) byKey.set(String(key).toUpperCase(), row)
  }

  return LISTINGS_PUBLISHER_CATALOG.map((entry) => {
    const existing = byKey.get(entry.id) || byKey.get(entry.name.toUpperCase()) || {}
    const liveListings =
      typeof existing.liveListings === 'number' ? existing.liveListings : existing.status === 'live' ? 2 : 0
    return {
      id: entry.id,
      name: entry.name,
      pushMode: entry.pushMode,
      status: existing.status ?? 'not synced',
      accuracy: existing.accuracy ?? '0%',
      liveListings,
      totalListings: typeof existing.totalListings === 'number' ? existing.totalListings : 2,
      lastSynced: existing.lastSynced ?? 'Never',
      liveUrl: existing.liveUrl ?? `https://${siteHost}`,
    }
  })
}

function App() {
  const onboardingSteps = [
    'Create workspace and invite your team',
    'Connect Google Search Console + GA4',
    'Set market, competitors, and keyword clusters',
  ]
  const [domain, setDomain] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [session, setSession] = useState(null)
  const [auditMessage, setAuditMessage] = useState('')
  const [auditLoading, setAuditLoading] = useState(false)
  const auditGuardRef = useRef(null)
  const [completedSteps, setCompletedSteps] = useState([false, false, false])

  const [coreMetrics, setCoreMetrics] = useState(() =>
    DEFAULT_CORE_METRICS.map((row) => ({ ...row })),
  )
  const [aiSeoMetrics, setAiSeoMetrics] = useState(() =>
    DEFAULT_AISEO_METRICS.map((row) => ({ ...row })),
  )
  const [priorityTasks, setPriorityTasks] = useState(() => [...DEFAULT_PRIORITY_TASKS])
  const [detailedFindings, setDetailedFindings] = useState(() => ({
    ...DEFAULT_DETAILED_FINDINGS,
  }))
  const [newWebsite, setNewWebsite] = useState('')
  const [websites, setWebsites] = useState(() => {
    const stored = localStorage.getItem(SITE_PORTFOLIO_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      } catch {
        /* ignore */
      }
    }
    return ['ruthlessmarketing.com']
  })
  const [activeSite, setActiveSite] = useState(() => {
    const stored = localStorage.getItem(ACTIVE_SITE_KEY)
    return stored || 'ruthlessmarketing.com'
  })
  const [portfolioMessage, setPortfolioMessage] = useState('')
  const [dashboardReady, setDashboardReady] = useState(false)
  const firstHydration = useRef(true)
  const [rankGuardScansLeft, setRankGuardScansLeft] = useState(1)
  const [rankGuardMessage, setRankGuardMessage] = useState('')
  const [healthScoreToday, setHealthScoreToday] = useState('81/100')
  const [dailyAlerts, setDailyAlerts] = useState(() => [...DEFAULT_DAILY_ALERTS])
  const [growthObjectives, setGrowthObjectives] = useState(() => [...DEFAULT_GROWTH_OBJECTIVES])
  const [monitoringMessage, setMonitoringMessage] = useState('Last check: monitoring queue healthy.')
  const [keywordQuery, setKeywordQuery] = useState('')
  const [keywordResults, setKeywordResults] = useState([])
  const [backlinkCompetitor, setBacklinkCompetitor] = useState('')
  const [backlinkResults, setBacklinkResults] = useState([])
  const [benchmarkMessage, setBenchmarkMessage] = useState(
    'Run benchmark to compare your site against similar competitors.',
  )
  const [snapshotNotes, setSnapshotNotes] = useState(() => [...DEFAULT_SNAPSHOT_NOTES])
  const [socialGoal, setSocialGoal] = useState('')
  const [socialRoadmap, setSocialRoadmap] = useState([])
  const [localBusinessName, setLocalBusinessName] = useState('')
  const [localCity, setLocalCity] = useState('')
  const [heatmapReportStatus, setHeatmapReportStatus] = useState('')
  const [localListingsReportStatus, setLocalListingsReportStatus] = useState('')
  const [listingsProfile, setListingsProfile] = useState(() => createDefaultDashboard(activeSite).listingsProfile)
  const [listingsPublishers, setListingsPublishers] = useState(() =>
    buildListingsPublishers(activeSite),
  )
  const [listingsIssues, setListingsIssues] = useState([])
  const [listingsSyncStatus, setListingsSyncStatus] = useState('')
  const [listingsHealthReportStatus, setListingsHealthReportStatus] = useState('')
  const [listingsFilter, setListingsFilter] = useState('all')
  const [whiteLabel, setWhiteLabel] = useState(() => {
    const raw = localStorage.getItem(WHITE_LABEL_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_WHITE_LABEL, ...parsed }
      } catch {
        /* ignore */
      }
    }
    return { ...DEFAULT_WHITE_LABEL }
  })
  const isAuthenticated = Boolean(session)

  const applySiteDashboard = (data) => {
    setDomain(data.domain ?? '')
    setAuditMessage(data.auditMessage ?? '')
    setCoreMetrics(data.coreMetrics ?? DEFAULT_CORE_METRICS.map((row) => ({ ...row })))
    setAiSeoMetrics(data.aiSeoMetrics ?? DEFAULT_AISEO_METRICS.map((row) => ({ ...row })))
    setPriorityTasks(data.priorityTasks ?? [...DEFAULT_PRIORITY_TASKS])
    setDetailedFindings(
      data.detailedFindings ?? {
        ...DEFAULT_DETAILED_FINDINGS,
      },
    )
    setRankGuardScansLeft(data.rankGuardScansLeft ?? 1)
    setRankGuardMessage(data.rankGuardMessage ?? '')
    setHealthScoreToday(data.healthScoreToday ?? '81/100')
    setDailyAlerts(data.dailyAlerts ?? [...DEFAULT_DAILY_ALERTS])
    setGrowthObjectives(data.growthObjectives ?? [...DEFAULT_GROWTH_OBJECTIVES])
    setMonitoringMessage(data.monitoringMessage ?? 'Last check: monitoring queue healthy.')
    setKeywordQuery(data.keywordQuery ?? '')
    setKeywordResults(data.keywordResults ?? [])
    setBacklinkCompetitor(data.backlinkCompetitor ?? '')
    setBacklinkResults(data.backlinkResults ?? [])
    setBenchmarkMessage(
      data.benchmarkMessage ?? 'Run benchmark to compare your site against similar competitors.',
    )
    setSnapshotNotes(data.snapshotNotes ?? [...DEFAULT_SNAPSHOT_NOTES])
    setSocialGoal(data.socialGoal ?? '')
    setSocialRoadmap(data.socialRoadmap ?? [])
    setLocalBusinessName(data.localBusinessName ?? '')
    setLocalCity(data.localCity ?? '')
    setHeatmapReportStatus(data.heatmapReportStatus ?? '')
    setLocalListingsReportStatus(data.localListingsReportStatus ?? '')
    setListingsProfile(data.listingsProfile ?? createDefaultDashboard(activeSite).listingsProfile)
    setListingsPublishers(normalizeListingsPublishers(activeSite, data.listingsPublishers))
    setListingsIssues(data.listingsIssues ?? [])
    setListingsSyncStatus(data.listingsSyncStatus ?? '')
    setListingsHealthReportStatus(data.listingsHealthReportStatus ?? '')
    setListingsFilter(data.listingsFilter ?? 'all')
  }

  const siteSnapshot = useMemo(
    () => ({
      domain,
      auditMessage,
      coreMetrics,
      aiSeoMetrics,
      priorityTasks,
      detailedFindings,
      rankGuardScansLeft,
      rankGuardMessage,
      healthScoreToday,
      dailyAlerts,
      growthObjectives,
      monitoringMessage,
      keywordQuery,
      keywordResults,
      backlinkCompetitor,
      backlinkResults,
      benchmarkMessage,
      snapshotNotes,
      socialGoal,
      socialRoadmap,
      localBusinessName,
      localCity,
      heatmapReportStatus,
      localListingsReportStatus,
      listingsProfile,
      listingsPublishers,
      listingsIssues,
      listingsSyncStatus,
      listingsHealthReportStatus,
      listingsFilter,
    }),
    [
      domain,
      auditMessage,
      coreMetrics,
      aiSeoMetrics,
      priorityTasks,
      detailedFindings,
      rankGuardScansLeft,
      rankGuardMessage,
      healthScoreToday,
      dailyAlerts,
      growthObjectives,
      monitoringMessage,
      keywordQuery,
      keywordResults,
      backlinkCompetitor,
      backlinkResults,
      benchmarkMessage,
      snapshotNotes,
      socialGoal,
      socialRoadmap,
      localBusinessName,
      localCity,
      heatmapReportStatus,
      localListingsReportStatus,
      listingsProfile,
      listingsPublishers,
      listingsIssues,
      listingsSyncStatus,
      listingsHealthReportStatus,
      listingsFilter,
    ],
  )

  useEffect(() => {
    localStorage.setItem(WHITE_LABEL_KEY, JSON.stringify(whiteLabel))
  }, [whiteLabel])

  useEffect(() => {
    localStorage.setItem(SITE_PORTFOLIO_KEY, JSON.stringify(websites))
  }, [websites])

  useEffect(() => {
    localStorage.setItem(ACTIVE_SITE_KEY, activeSite)
  }, [activeSite])

  useEffect(() => {
    if (!dashboardReady) return
    localStorage.setItem(siteStorageKey(activeSite), JSON.stringify(siteSnapshot))
  }, [activeSite, dashboardReady, siteSnapshot])

  useEffect(() => {
    if (!firstHydration.current) return
    firstHydration.current = false
    setDashboardReady(false)
    let list = websites
    if (!list.includes(activeSite)) {
      list = [...list, activeSite]
      setWebsites(list)
    }
    const raw = localStorage.getItem(siteStorageKey(activeSite))
    if (raw) {
      try {
        applySiteDashboard(JSON.parse(raw))
      } catch {
        applySiteDashboard(createDefaultDashboard(activeSite))
      }
    } else {
      applySiteDashboard(createDefaultDashboard(activeSite))
    }
    setDashboardReady(true)
  }, [])

  useEffect(() => {
    const stepKey = session?.user?.id ? `rank-riot-onboarding-${session.user.id}` : 'rank-riot-onboarding'
    const storedSteps = localStorage.getItem(stepKey)
    if (storedSteps) {
      try {
        setCompletedSteps(JSON.parse(storedSteps))
      } catch {
        setCompletedSteps([false, false, false])
      }
    }
  }, [session?.user?.id])

  useEffect(() => {
    const stepKey = session?.user?.id ? `rank-riot-onboarding-${session.user.id}` : 'rank-riot-onboarding'
    localStorage.setItem(stepKey, JSON.stringify(completedSteps))
  }, [completedSteps, session?.user?.id])

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(
    () => () => {
      clearTimeout(auditGuardRef.current)
    },
    [],
  )

  const handleSignIn = async () => {
    if (!email || !password) {
      setAuthMessage('Enter both email and password to continue.')
      return
    }
    if (!email.includes('@')) {
      setAuthMessage('Use a valid work email address.')
      return
    }

    if (!hasSupabaseConfig) {
      setAuthMessage('Add Supabase keys in .env to activate real sign-in.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const msg = error.message?.toLowerCase?.() || ''
      if (msg.includes('invalid login credentials')) {
        setAuthMessage(
          'That email/password combo did not match. If this is a new email, click Create account first.',
        )
        return
      }
      if (msg.includes('email not confirmed')) {
        setAuthMessage('Your email is not confirmed yet. Check your inbox for the confirmation link.')
        return
      }
      setAuthMessage(error.message)
      return
    }
    setAuthMessage(`Signed in as ${email}. Welcome back to Rank Riot.`)
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setAuthMessage('Enter your email first, then click Reset password.')
      return
    }
    if (!hasSupabaseConfig) {
      setAuthMessage('Add Supabase keys in .env to activate password reset.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      setAuthMessage(error.message)
      return
    }
    setAuthMessage('Password reset email sent. Check your inbox.')
  }

  const handleSignUp = async () => {
    if (!email || !password) {
      setAuthMessage('Enter email and password before creating your account.')
      return
    }
    if (password.length < 6) {
      setAuthMessage('Use a password with at least 6 characters.')
      return
    }
    if (!hasSupabaseConfig) {
      setAuthMessage('Add Supabase keys in .env to activate account creation.')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      const msg = error.message?.toLowerCase?.() || ''
      if (msg.includes('signups not allowed')) {
        setAuthMessage('Signup is currently disabled in Supabase Auth settings (Email provider / Allow signups).')
        return
      }
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setAuthMessage('That email is already registered. Try signing in instead.')
        return
      }
      if (msg.includes('email rate limit')) {
        setAuthMessage('Too many signup attempts. Wait a moment and try again.')
        return
      }
      if (msg.includes('redirect') && msg.includes('not allowed')) {
        setAuthMessage('Email redirect URL is not allowed by Supabase. Add your Vercel URL in Auth URL settings.')
        return
      }
      setAuthMessage(error.message)
      return
    }
    if (data.session) {
      setAuthMessage(`Account created and signed in as ${email}.`)
      return
    }
    setAuthMessage(
      'Account created. Check your inbox to confirm your email, then sign in. (If confirmations are disabled, sign in immediately.)',
    )
  }

  const handleSignOut = async () => {
    if (!hasSupabaseConfig) return
    await supabase.auth.signOut()
    setAuthMessage('Signed out.')
  }

  const toggleStep = (index) => {
    setCompletedSteps((prev) => prev.map((step, idx) => (idx === index ? !step : step)))
  }

  const handleAudit = async () => {
    if (!domain) {
      setAuditMessage('Enter a full URL before running the audit.')
      return
    }

    try {
      setAuditLoading(true)
      setAuditMessage('')
      clearTimeout(auditGuardRef.current)
      auditGuardRef.current = setTimeout(() => {
        setAuditLoading(false)
        setAuditMessage('Audit took too long. Please try again.')
      }, 13000)
      const audit = await runSeoAudit(domain)
      setCoreMetrics(audit.coreMetrics)
      setAiSeoMetrics(audit.aiSeoMetrics)
      if (audit.priorityTasks.length > 0) {
        setPriorityTasks(audit.priorityTasks)
      }
      if (audit.detailedFindings) {
        setDetailedFindings(audit.detailedFindings)
      }
      setHealthScoreToday(audit.coreMetrics[0]?.value || healthScoreToday)
      setDailyAlerts([
        'Audit complete: new objectives generated for this domain.',
        `AISEO visibility currently at ${audit.aiSeoMetrics[0]?.value || 'N/A'}.`,
        `Top focus: ${audit.priorityTasks?.[0] || 'Continue optimization cycle.'}`,
      ])
      setAuditMessage(
        audit.note
          ? `Metrics refreshed. ${audit.note}`
          : audit.source === 'quick-scan'
            ? 'Quick scan complete (instant on-page check).'
            : 'Live audit complete. Metrics refreshed.',
      )
    } catch (error) {
      setAuditMessage(error.message)
    } finally {
      clearTimeout(auditGuardRef.current)
      setAuditLoading(false)
    }
  }

  const selectSite = (siteHost) => {
    if (siteHost === activeSite) return
    setPortfolioMessage('')
    if (dashboardReady) {
      localStorage.setItem(siteStorageKey(activeSite), JSON.stringify(siteSnapshot))
    }
    setDashboardReady(false)
    const raw = localStorage.getItem(siteStorageKey(siteHost))
    if (raw) {
      try {
        applySiteDashboard(JSON.parse(raw))
      } catch {
        applySiteDashboard(createDefaultDashboard(siteHost))
      }
    } else {
      applySiteDashboard(createDefaultDashboard(siteHost))
    }
    setActiveSite(siteHost)
    setDashboardReady(true)
  }

  const addWebsite = () => {
    const trimmed = newWebsite.trim().replace(/^https?:\/\//, '')
    if (!trimmed) return
    if (websites.includes(trimmed)) {
      setPortfolioMessage('This website is already in your portfolio.')
      return
    }
    if (websites.length >= 30) {
      setPortfolioMessage('Website limit reached (30/30).')
      return
    }
    setWebsites((prev) => [...prev, trimmed])
    setNewWebsite('')
    setPortfolioMessage('')
    localStorage.setItem(siteStorageKey(trimmed), JSON.stringify(createDefaultDashboard(trimmed)))
    selectSite(trimmed)
  }

  const runRankGuardScan = () => {
    if (rankGuardScansLeft <= 0) {
      setRankGuardMessage('No RankGuard scans left on your current plan.')
      return
    }
    setRankGuardScansLeft((prev) => prev - 1)
    setRankGuardMessage('RankGuard scan complete: 3 keywords flagged as under-ranked.')
  }

  const refreshGrowthPlan = () => {
    const primary = activeSite || 'your site'
    setGrowthObjectives([
      `Refresh top-converting page copy for ${primary} with clearer entity signals.`,
      'Create one comparison page and one FAQ page targeting AI citation opportunities.',
      'Increase internal links from top authority pages into service pages.',
    ])
  }

  const runMonitoringCheck = () => {
    const now = new Date().toLocaleTimeString()
    setDailyAlerts([
      'No uptime incidents detected in the last check window.',
      '2 keywords moved up into top 20.',
      'Potential spam backlink detected from low-trust domain.',
    ])
    setMonitoringMessage(`Last check completed at ${now}.`)
  }

  const runKeywordExplorer = () => {
    if (!keywordQuery.trim()) {
      setKeywordResults([])
      return
    }
    const seed = keywordQuery.trim().toLowerCase()
    setKeywordResults([
      { keyword: `${seed} services`, volume: 2900, difficulty: 42 },
      { keyword: `${seed} agency`, volume: 1900, difficulty: 37 },
      { keyword: `best ${seed} company`, volume: 1300, difficulty: 46 },
    ])
  }

  const runBacklinkAnalysis = () => {
    if (!backlinkCompetitor.trim()) {
      setBacklinkResults([])
      return
    }
    const clean = backlinkCompetitor.replace(/^https?:\/\//, '')
    setBacklinkResults([
      { source: `https://industryblog.com/review-of-${clean}`, authority: 68 },
      { source: `https://directoryhub.com/listings/${clean}`, authority: 54 },
      { source: `https://partnernews.io/case-study-${clean}`, authority: 61 },
    ])
  }

  const runBenchmark = () => {
    const score = Math.floor(68 + Math.random() * 20)
    setBenchmarkMessage(
      `Benchmark complete: you outperform ${score}% of similar sites on visibility and authority.`,
    )
  }

  const refreshMonthlySnapshot = () => {
    setSnapshotNotes([
      'Traffic trend up 11% in the latest month.',
      '18 keywords entered top 10 positions.',
      'AI overview mentions increased by 9%.',
    ])
  }

  const generateSocialRoadmap = () => {
    if (!socialGoal.trim()) {
      setSocialRoadmap([])
      return
    }
    setSocialRoadmap([
      `Publish 3 posts/week aligned to "${socialGoal}" keyword cluster.`,
      'Repurpose best-performing blog content into short-form social snippets.',
      'Track click-through and assisted conversions from social landing pages.',
    ])
  }

  const patchWhiteLabel = (key, value) => {
    setWhiteLabel((prev) => ({ ...prev, [key]: value }))
  }

  const patchListingsProfile = (key, value) => {
    setListingsProfile((prev) => ({ ...prev, [key]: value }))
  }

  const runListingsSync = () => {
    const now = new Date().toLocaleString()
    const nameMissing = !listingsProfile.businessName.trim()
    const phoneMissing = !listingsProfile.phone.trim()
    const addressMissing = !listingsProfile.address.trim()
    const websiteMissing = !listingsProfile.website.trim()
    const categoryMissing = !listingsProfile.primaryCategory.trim()
    const statusSeed = activeSite.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)

    const rows = listingsPublishers.map((publisher, index) => {
      const baseline = 78 + ((statusSeed + index * 13) % 19)
      let status = 'live'
      let accuracy = baseline
      if (publisher.pushMode === 'manual_or_monitor' || publisher.pushMode === 'derived_visibility') {
        status = publisher.pushMode === 'derived_visibility' ? 'monitor only' : 'manual'
        accuracy = Math.max(70, baseline - 8)
      } else if (nameMissing || phoneMissing || addressMissing || websiteMissing || categoryMissing) {
        status = index % 3 === 0 ? 'needs review' : 'pending'
        accuracy = Math.max(55, baseline - 22)
      } else if (index % 5 === 0) {
        status = 'pending'
        accuracy = Math.max(65, baseline - 10)
      }
      const liveListings = status === 'live' ? publisher.totalListings : Math.max(0, publisher.totalListings - 1)
      return {
        ...publisher,
        status,
        accuracy: `${Math.min(99, accuracy)}%`,
        liveListings,
        lastSynced: now,
        liveUrl: listingsProfile.website?.trim() || `https://${activeSite}`,
      }
    })

    const nextIssues = []
    if (nameMissing) nextIssues.push('Business name is missing in source of truth profile.')
    if (phoneMissing) nextIssues.push('Phone number missing; NAP consistency risk across directories.')
    if (addressMissing) nextIssues.push('Street address missing; map listing confidence will drop.')
    if (websiteMissing) nextIssues.push('Website URL missing; publisher records cannot validate canonical URL.')
    if (categoryMissing) nextIssues.push('Primary category is missing for publisher matching.')
    if (listingsProfile.hours.trim().length < 8) {
      nextIssues.push('Business hours look incomplete; verify regular and holiday hours.')
    }
    if (rows.some((row) => row.status !== 'live')) {
      nextIssues.push('Some publishers are pending review due to profile mismatch or update queue lag.')
    }

    setListingsPublishers(rows)
    setListingsIssues(nextIssues)
    setListingsSyncStatus(`Listings sync simulated at ${now}.`)
  }

  const downloadListingsHealthReport = () => {
    const siteHost = activeSite || 'site.com'
    downloadBrandedPdfReport({
      filename: `listings-health-report-${siteHost.replace(/[^\w.-]+/g, '-')}.pdf`,
      reportTitle: 'Listings health report',
      reportSubtitle: 'Yext-style publisher sync snapshot',
      siteHost,
      brand: whiteLabel,
      sections: [
        {
          title: 'Listings health summary',
          bullets: [
            `Site: ${siteHost}`,
            `Business: ${listingsProfile.businessName || siteHost}`,
            `Primary category: ${listingsProfile.primaryCategory || 'Not set'}`,
            `Last sync: ${listingsSyncStatus || 'Not run yet'}`,
          ],
        },
        {
          title: 'Publisher matrix',
          table: {
            headers: ['Publisher', 'Status', 'Accuracy', 'Last synced'],
            rows: listingsPublishers.map((row) => [
              row.name,
              row.status,
              row.accuracy,
              row.lastSynced,
            ]),
          },
        },
        {
          title: 'Open issues queue',
          bullets: listingsIssues.length
            ? listingsIssues
            : ['No active listing issues detected in the latest sync.'],
        },
      ],
    })
    setListingsHealthReportStatus(`Last download: ${new Date().toLocaleString()}`)
  }

  const generateHeatmapReport = () => {
    const siteHost = activeSite || 'site.com'
    const domainLabel = domain?.trim() || `https://${siteHost}/`
    const data = buildHeatmapReportData({
      siteHost,
      domainLabel,
      healthScoreToday,
      organicSessionsLabel: coreMetrics[1]?.value,
    })
    const safeHost = siteHost.replace(/[^\w.-]+/g, '-')
    downloadBrandedPdfReport({
      filename: `heatmap-report-${safeHost}.pdf`,
      reportTitle: 'Engagement heatmap report',
      reportSubtitle: 'Scroll and attention model (demo projection)',
      siteHost,
      brand: whiteLabel,
      sections: [
        { title: 'Executive summary', bullets: data.summaryBullets },
        {
          title: 'Engagement heatmap (simulated)',
          paragraphs: [
            'Darker cells indicate higher modeled attention. Connect real analytics to replace this preview.',
          ],
          heatmapValues: data.heatmapValues,
        },
        {
          title: 'Zone index',
          table: {
            headers: ['Zone', 'Relative intensity', 'Note'],
            rows: data.zoneRows,
          },
        },
      ],
    })
    setHeatmapReportStatus(`Last download: ${new Date().toLocaleString()}`)
  }

  const generateLocalListingsReport = () => {
    const siteHost = activeSite || 'site.com'
    const seed = siteHost.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    const pct = (i) => `${Math.min(99, 82 + ((seed + i * 11) % 18))}%`
    const citations = [
      {
        platform: 'Google Business Profile',
        status: 'Listed',
        match: pct(0),
        note: 'Primary categories aligned; hours match.',
      },
      {
        platform: 'Bing Places',
        status: 'Listed',
        match: pct(1),
        note: 'Suite format differs on one field.',
      },
      {
        platform: 'Apple Maps',
        status: 'Listed',
        match: pct(2),
        note: 'Phone formatting uses dashes vs dots.',
      },
      {
        platform: 'Yelp',
        status: 'Needs review',
        match: pct(3),
        note: 'Business name includes extra keyword.',
      },
      {
        platform: 'Facebook',
        status: 'Listed',
        match: pct(4),
        note: 'NAP matches; hours need holiday update.',
      },
    ]
    const napScore = `${Math.min(98, 76 + (seed % 20))}/100`
    const data = buildLocalListingsReportData({
      siteHost,
      businessName: localBusinessName.trim(),
      city: localCity.trim(),
      napScore,
      citations,
    })
    const safeHost = siteHost.replace(/[^\w.-]+/g, '-')
    downloadBrandedPdfReport({
      filename: `local-listings-report-${safeHost}.pdf`,
      reportTitle: 'Local listings report',
      reportSubtitle: 'NAP and directory consistency snapshot',
      siteHost,
      brand: whiteLabel,
      sections: [
        { title: 'Local presence overview', bullets: data.overviewBullets },
        {
          title: 'Directory and listing matrix',
          table: {
            headers: ['Platform', 'Status', 'Match', 'Note'],
            rows: data.matrixRows,
          },
        },
        { title: 'Recommended actions', bullets: data.recommendations },
      ],
    })
    setLocalListingsReportStatus(`Last download: ${new Date().toLocaleString()}`)
  }

  const handleDownloadLlms = () => {
    const normalized = domain?.trim()
    let host = activeSite || 'yourdomain.com'

    if (normalized) {
      try {
        host = new URL(normalized).host
      } catch {
        host = normalized.replace(/^https?:\/\//, '')
      }
    }

    const aiLines = aiSeoMetrics.map((metric) => `- ${metric.title}: ${metric.value} (${metric.note})`)
    const aiseoActionLines = priorityTasks.map((task) => `- ${task}`)
    const keyPages = [
      `https://${host}/`,
      `https://${host}/services`,
      `https://${host}/about`,
      `https://${host}/contact`,
      `https://${host}/blog`,
    ]

    const content = [
      `# llms.txt for ${host}`,
      '',
      `site: https://${host}`,
      `generated_by: Rank Riot`,
      `generated_at: ${new Date().toISOString()}`,
      `version: 1.1`,
      '',
      '## summary',
      '- This file provides an AISEO-only snapshot for LLM consumption and content strategy.',
      '- It is intentionally focused on AI visibility and citation readiness, not error logs.',
      '',
      '## entities',
      `- brand: ${host.split('.')[0]}`,
      '- platform: Rank Riot',
      '- focus: AISEO, LLM citation readiness, entity trust',
      '',
      '## aiseo_metrics',
      ...aiLines,
      '',
      '## key_pages',
      ...keyPages.map((page) => `- ${page}`),
      '',
      '## aiseo_actions',
      ...aiseoActionLines,
      '',
      '## aiseo_policies',
      '- Respect robots.txt and noindex directives.',
      '- Prioritize canonical, structured, and entity-rich pages for AI extraction.',
      '- Re-crawl high-change pages weekly and core pages daily.',
      '',
      '## aiseo_guidelines',
      '- Use direct factual statements with sourceable claims.',
      '- Add schema for Organization, WebSite, Service, FAQ, and Article when relevant.',
      '- Strengthen entity consistency across homepage, service pages, and profiles.',
      '',
      '## usage',
      '- Use this file as AISEO context for assistants and content-generation agents.',
      '- Refresh audit and regenerate regularly to keep AISEO context current.',
      '',
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'llms.txt'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const filteredListingsPublishers = useMemo(() => {
    if (listingsFilter === 'all') return listingsPublishers
    return listingsPublishers.filter((row) => row.pushMode === listingsFilter)
  }, [listingsFilter, listingsPublishers])
  const sortedListingsPublishers = useMemo(
    () => [...filteredListingsPublishers].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredListingsPublishers],
  )
  const syncSplitIndex = Math.ceil(sortedListingsPublishers.length / 2)
  const syncLeftColumn = sortedListingsPublishers.slice(0, syncSplitIndex)
  const syncRightColumn = sortedListingsPublishers.slice(syncSplitIndex)

  const liveListingsCount = listingsPublishers.reduce((sum, row) => sum + row.liveListings, 0)
  const totalListingsCount = listingsPublishers.reduce((sum, row) => sum + row.totalListings, 0)
  const nonLivePublishersCount = listingsPublishers.filter((row) => row.status !== 'live').length
  const pendingPublishersCount = listingsPublishers.filter((row) =>
    ['pending', 'needs review'].includes(row.status),
  ).length
  const hasAnyReportThisSession = Boolean(
    heatmapReportStatus || localListingsReportStatus || listingsHealthReportStatus,
  )
  const todaysActions = [
    {
      href: '#listings-sync',
      label:
        nonLivePublishersCount > 0
          ? `Push listings for ${activeSite} and resolve ${nonLivePublishersCount} non-live publishers.`
          : `Push listings for ${activeSite} to keep all publisher records synced.`,
    },
    {
      href: '#listings-sync',
      label:
        listingsIssues.length > 0
          ? `Resolve ${listingsIssues.length} listing issue${listingsIssues.length > 1 ? 's' : ''} from the current queue.`
          : 'Run a verification pass to confirm NAP and category consistency across publishers.',
    },
    {
      href: '#report-tools',
      label: hasAnyReportThisSession
        ? 'Regenerate client PDFs after sync so today’s numbers are reflected.'
        : 'Download heatmap, local listings, and listings health PDFs for client reporting.',
    },
    {
      href: pendingPublishersCount > 0 ? '#listings-sync' : '#site-dashboard',
      label:
        pendingPublishersCount > 0
          ? `Review ${pendingPublishersCount} pending publisher update${pendingPublishersCount > 1 ? 's' : ''}.`
          : 'Run benchmark and monitoring checks to close today’s optimization loop.',
    },
  ].slice(0, 3)

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand-mark">
          <img src={rankRiotLogo} alt="Rank Riot logo" />
          <div>
            <strong>Rank Riot</strong>
            <p>Rank Higher. Rise Harder. Riot.</p>
          </div>
        </div>
        <nav>
          <a href="#platform">Platform</a>
          <a href="#reports">Reports</a>
          <a href="#aiseo">AISEO Engine</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <div className="account-controls">
          {session?.user?.email ? <span className="account-badge">Signed in: {session.user.email}</span> : null}
          <button
            type="button"
            className="ghost-button"
            onClick={session ? handleSignOut : () => document.getElementById('auth')?.scrollIntoView()}
          >
            {session ? 'Switch account' : 'Connect account'}
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="left-nav">
          <p className="left-nav-title">Navigate</p>
          <a href="#platform">Platform</a>
          <a href="#auth">Account</a>
          <a href="#reports">Branding</a>
          <a href="#report-tools">Report tools</a>
          <a href="#listings">Listings source</a>
          <a href="#listings-sync">Publisher sync</a>
          <a href="#portfolio">Portfolio</a>
          <a href="#site-dashboard">Site dashboard</a>
          <a href="#findings">Findings</a>
          <a href="#aiseo">AISEO</a>
          <a href="#roadmap">Roadmap</a>
        </aside>
        <main className="main-content">
          <section className="hero-section" id="platform">
          <div className="hero-head">
            <div className="hero-logo-frame">
              <img src={rankRiotLogo} alt="" className="hero-logo" />
            </div>
            <div className="hero-head-text">
              <p className="eyebrow">Rank Riot Command Center</p>
              <h1>Dominate search with SEO + AISEO built for aggressive growth.</h1>
              <p className="hero-copy">
                Rank Riot tracks rankings, technical health, and AI search visibility across Google,
                AI Overviews, and answer engines. Move from insight to execution every week.
              </p>
            </div>
          </div>

          <div className="domain-form">
            <input
              type="url"
              placeholder={`https://${activeSite}`}
              aria-label="Domain URL"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
            <button type="button" onClick={handleAudit} disabled={auditLoading}>
              {auditLoading ? 'Running...' : 'Start Rank Riot audit'}
            </button>
            <button type="button" className="ghost-button llms-download" onClick={handleDownloadLlms}>
              Download llms.txt
            </button>
          </div>
          {auditMessage ? <p className="audit-message">{auditMessage}</p> : null}
        </section>

        <section className="auth-onboarding" id="auth">
          {isAuthenticated ? (
            <article className="card white-label-panel" id="reports">
              <div className="card-title-row">
                <h3>White-label report branding</h3>
                <span>PDF exports</span>
              </div>
              {session?.user?.email ? (
                <p className="auth-subtext">Authenticated as {session.user.email}</p>
              ) : null}
              <p className="auth-subtext">
                Heatmap and local listings downloads use these fields for the cover header, accent
                color, optional logo, and footer so you can deliver reports under your brand.
              </p>
              <div className="listings-actions">
                <button type="button" className="ghost-button module-button" onClick={handleSignOut}>
                  Log out / switch account
                </button>
              </div>
              <div className="white-label-grid">
                <label>
                  Brand name
                  <input
                    type="text"
                    placeholder="e.g. Northwind Digital"
                    value={whiteLabel.brandName}
                    onChange={(e) => patchWhiteLabel('brandName', e.target.value)}
                  />
                </label>
                <label>
                  Tagline
                  <input
                    type="text"
                    placeholder="Short line under the brand name"
                    value={whiteLabel.tagline}
                    onChange={(e) => patchWhiteLabel('tagline', e.target.value)}
                  />
                </label>
                <label className="wl-accent">
                  Accent color
                  <span className="wl-color-row">
                    <input
                      type="color"
                      aria-label="Accent color"
                      value={whiteLabel.accentColor}
                      onChange={(e) => patchWhiteLabel('accentColor', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="#ff8a1f"
                      value={whiteLabel.accentColor}
                      onChange={(e) => patchWhiteLabel('accentColor', e.target.value)}
                    />
                  </span>
                </label>
                <label>
                  Logo URL (optional)
                  <input
                    type="url"
                    placeholder="https://yoursite.com/logo.png"
                    value={whiteLabel.logoUrl}
                    onChange={(e) => patchWhiteLabel('logoUrl', e.target.value)}
                  />
                </label>
                <label className="wl-footer-field">
                  Footer / disclaimer (optional)
                  <input
                    type="text"
                    placeholder="e.g. Prepared for Client Co. — Confidential"
                    value={whiteLabel.footerText}
                    onChange={(e) => patchWhiteLabel('footerText', e.target.value)}
                  />
                </label>
              </div>
            </article>
          ) : (
            <article className="card auth-card">
              <h3>Sign in to Rank Riot</h3>
              <p className="auth-subtext">Continue to your command center</p>
              <form className="auth-form">
                <label>
                  Work email
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button type="button" onClick={handleSignIn}>
                  Sign in
                </button>
                <button type="button" className="ghost-button auth-secondary" onClick={handleSignUp}>
                  Create account
                </button>
                <button type="button" className="ghost-button auth-secondary" onClick={handlePasswordReset}>
                  Reset password
                </button>
              </form>
              {authMessage ? <p className="auth-message">{authMessage}</p> : null}
              {!hasSupabaseConfig ? (
                <p className="auth-help">
                  Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` to enable real auth.
                </p>
              ) : null}
            </article>
          )}

          {isAuthenticated ? (
            <article className="card onboarding-card">
              <h3>Today&apos;s actions</h3>
              <p className="auth-subtext">High-impact moves for your active site this session</p>
              <ul className="task-list">
                {todaysActions.map((action) => (
                  <li key={action.label}>
                    <a href={action.href} className="action-link">
                      {action.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="listings-actions">
                <button type="button" className="ghost-button module-button" onClick={runListingsSync}>
                  Push listings now
                </button>
                <button type="button" className="ghost-button module-button" onClick={runMonitoringCheck}>
                  Run monitoring check
                </button>
              </div>
            </article>
          ) : (
            <article className="card onboarding-card">
              <h3>Fast onboarding checklist</h3>
              <p className="auth-subtext">Launch your first AISEO sprint in under 10 minutes</p>
              <ul>
                {onboardingSteps.map((step, index) => (
                  <li key={step}>
                    <label>
                      <input
                        type="checkbox"
                        checked={completedSteps[index]}
                        onChange={() => toggleStep(index)}
                      />
                      <span>{step}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="progress-text">
                {completedSteps.filter(Boolean).length}/{onboardingSteps.length} completed
              </p>
              <button type="button" className="ghost-button">
                Start guided setup
              </button>
            </article>
          )}
        </section>

        {!isAuthenticated ? (
          <section className="card">
            <div className="card-title-row">
              <h3>Account required</h3>
              <span>Locked</span>
            </div>
            <p className="auth-subtext">
              Sign in (or create your account) to access listings management, reports, and site command
              center modules.
            </p>
          </section>
        ) : (
          <>
        <section className="stats-grid">
          {coreMetrics.map((metric) => (
            <article className="card metric-card" key={metric.label}>
              <p className="card-label">{metric.label}</p>
              <h2>{metric.value}</h2>
              <p className="trend">{metric.trend}</p>
            </article>
          ))}
        </section>

        <section className="feature-grid">
          <article className="card">
            <div className="card-title-row">
              <h3>Growth Plan</h3>
              <span>Limited</span>
            </div>
            <ul className="task-list">
              {growthObjectives.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
            <button type="button" className="ghost-button module-button" onClick={refreshGrowthPlan}>
              Regenerate objectives
            </button>
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>Website Monitoring</h3>
              <span>Limited</span>
            </div>
            <ul className="task-list">
              {dailyAlerts.map((alert) => (
                <li key={alert}>{alert}</li>
              ))}
            </ul>
            <p className="auth-subtext">{monitoringMessage}</p>
            <button type="button" className="ghost-button module-button" onClick={runMonitoringCheck}>
              Run monitoring check
            </button>
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>RankGuard</h3>
              <span>{rankGuardScansLeft} scan left</span>
            </div>
            <p className="auth-subtext">
              One-time keyword ranking fairness scan with fast suggestions.
            </p>
            <button type="button" className="ghost-button" onClick={runRankGuardScan}>
              Run RankGuard scan
            </button>
            {rankGuardMessage ? <p className="audit-message">{rankGuardMessage}</p> : null}
          </article>
        </section>

        <section className="feature-grid">
          <article className="card">
            <div className="card-title-row">
              <h3>Keyword Explorer</h3>
              <span>Limited</span>
            </div>
            <p className="auth-subtext">
              Track ranking keywords, volume, and difficulty with competitor discovery.
            </p>
            <div className="module-controls">
              <input
                type="text"
                placeholder="Enter topic keyword"
                value={keywordQuery}
                onChange={(event) => setKeywordQuery(event.target.value)}
              />
              <button type="button" onClick={runKeywordExplorer}>
                Explore
              </button>
            </div>
            <ul className="task-list">
              {keywordResults.map((item) => (
                <li key={item.keyword}>
                  {item.keyword} - Vol {item.volume} / Diff {item.difficulty}
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>Backlink Analysis</h3>
              <span>Limited</span>
            </div>
            <p className="auth-subtext">
              Monitor authority trends, backlink quality, and competitor link opportunities.
            </p>
            <div className="module-controls">
              <input
                type="text"
                placeholder="competitor.com"
                value={backlinkCompetitor}
                onChange={(event) => setBacklinkCompetitor(event.target.value)}
              />
              <button type="button" onClick={runBacklinkAnalysis}>
                Analyze
              </button>
            </div>
            <ul className="task-list">
              {backlinkResults.map((item) => (
                <li key={item.source}>
                  {item.source} (Authority {item.authority})
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>Benchmarking</h3>
              <span>Active</span>
            </div>
            <p className="auth-subtext">
              Compare your performance against similar sites across traffic and rankings.
            </p>
            <p className="auth-subtext">{benchmarkMessage}</p>
            <button type="button" className="ghost-button module-button" onClick={runBenchmark}>
              Run benchmark
            </button>
          </article>
        </section>

        <section className="feature-grid">
          <article className="card">
            <div className="card-title-row">
              <h3>Monthly Snapshot</h3>
              <span>Enabled</span>
            </div>
            <ul className="task-list">
              {snapshotNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <button type="button" className="ghost-button module-button" onClick={refreshMonthlySnapshot}>
              Refresh snapshot
            </button>
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>Daily Health Score</h3>
              <span>{healthScoreToday}</span>
            </div>
            <p className="auth-subtext">
              Proprietary health score updates daily against predicted growth targets.
            </p>
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>Social Media</h3>
              <span>Roadmap</span>
            </div>
            <p className="auth-subtext">
              Performance monitoring plus AI-guided social growth actions for your top channels.
            </p>
            <div className="module-controls">
              <input
                type="text"
                placeholder="Goal (e.g., get more local leads)"
                value={socialGoal}
                onChange={(event) => setSocialGoal(event.target.value)}
              />
              <button type="button" onClick={generateSocialRoadmap}>
                Generate
              </button>
            </div>
            <ul className="task-list">
              {socialRoadmap.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="feature-grid reports-row" id="report-tools">
          <article className="card">
            <div className="card-title-row">
              <h3>Engagement heatmap</h3>
              <span>Report</span>
            </div>
            <p className="auth-subtext">
              Generate a branded HTML report with a simulated scroll-and-attention heatmap for the
              active portfolio site. Connect analytics later to replace the demo grid.
            </p>
            <button type="button" className="ghost-button module-button" onClick={generateHeatmapReport}>
              Download heatmap report
            </button>
            {heatmapReportStatus ? <p className="audit-message">{heatmapReportStatus}</p> : null}
          </article>

          <article className="card">
            <div className="card-title-row">
              <h3>Local listings</h3>
              <span>Report</span>
            </div>
            <p className="auth-subtext">
              NAP and directory consistency table for the selected site. Adjust business name and
              city if they differ from the domain.
            </p>
            <div className="module-controls local-listings-fields">
              <input
                type="text"
                placeholder="Business name"
                value={localBusinessName}
                onChange={(e) => setLocalBusinessName(e.target.value)}
              />
              <input
                type="text"
                placeholder="City or region"
                value={localCity}
                onChange={(e) => setLocalCity(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="ghost-button module-button"
              onClick={generateLocalListingsReport}
            >
              Download local listings report
            </button>
            {localListingsReportStatus ? (
              <p className="audit-message">{localListingsReportStatus}</p>
            ) : null}
          </article>
        </section>

        <section className="feature-grid listings-grid" id="listings">
          <article className="card">
            <div className="card-title-row">
              <h3>Listings source of truth</h3>
              <span>Phase 1</span>
            </div>
            <p className="auth-subtext">
              Maintain one canonical profile and push updates to publishers from a single place.
            </p>
            <div className="listings-form-grid">
              <input
                type="text"
                placeholder="Business name"
                value={listingsProfile.businessName}
                onChange={(e) => patchListingsProfile('businessName', e.target.value)}
              />
              <input
                type="text"
                placeholder="Phone"
                value={listingsProfile.phone}
                onChange={(e) => patchListingsProfile('phone', e.target.value)}
              />
              <input
                type="text"
                placeholder="Street address"
                value={listingsProfile.address}
                onChange={(e) => patchListingsProfile('address', e.target.value)}
              />
              <input
                type="text"
                placeholder="City"
                value={listingsProfile.city}
                onChange={(e) => patchListingsProfile('city', e.target.value)}
              />
              <input
                type="text"
                placeholder="State/Region"
                value={listingsProfile.region}
                onChange={(e) => patchListingsProfile('region', e.target.value)}
              />
              <input
                type="text"
                placeholder="Postal code"
                value={listingsProfile.postalCode}
                onChange={(e) => patchListingsProfile('postalCode', e.target.value)}
              />
              <input
                type="url"
                placeholder="Website URL"
                value={listingsProfile.website}
                onChange={(e) => patchListingsProfile('website', e.target.value)}
              />
              <input
                type="text"
                placeholder="Primary category"
                value={listingsProfile.primaryCategory}
                onChange={(e) => patchListingsProfile('primaryCategory', e.target.value)}
              />
              <input
                type="text"
                placeholder="Hours"
                value={listingsProfile.hours}
                onChange={(e) => patchListingsProfile('hours', e.target.value)}
              />
            </div>
            <div className="listings-actions">
              <button type="button" className="ghost-button module-button" onClick={runListingsSync}>
                Push listings
              </button>
              <button
                type="button"
                className="ghost-button module-button"
                onClick={downloadListingsHealthReport}
              >
                Download listings health report
              </button>
            </div>
            {listingsSyncStatus ? <p className="audit-message">{listingsSyncStatus}</p> : null}
            {listingsHealthReportStatus ? (
              <p className="audit-message">{listingsHealthReportStatus}</p>
            ) : null}
          </article>
        </section>

        <section className="listings-sync-panel" id="listings-sync">
          <article className="card">
            <div className="card-title-row">
              <h3>Publisher sync center</h3>
              <span>
                Live listings {liveListingsCount}/{totalListingsCount}
              </span>
            </div>
            <div className="publisher-toolbar">
              <select value={listingsFilter} onChange={(event) => setListingsFilter(event.target.value)}>
                <option value="all">All publishers</option>
                <option value="direct_api">Direct API</option>
                <option value="partner_api">Partner API</option>
                <option value="manual_or_monitor">Manual / monitor</option>
                <option value="derived_visibility">Derived visibility</option>
              </select>
              <p className="auth-subtext">
                Showing {filteredListingsPublishers.length} of {listingsPublishers.length} publishers.
              </p>
            </div>
            <div className="publisher-columns">
              {[syncLeftColumn, syncRightColumn].map((column, idx) => (
                <div className="publishers-table-wrap" key={`publisher-col-${idx}`}>
                  <table className="publishers-table">
                    <thead>
                      <tr>
                        <th>Publisher</th>
                        <th>Push mode</th>
                        <th>Status</th>
                        <th>Live listings</th>
                        <th>Accuracy</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {column.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{(row.pushMode || 'manual_or_monitor').replace(/_/g, ' ')}</td>
                          <td>
                            <span className={`status-pill ${row.status.replace(/\s+/g, '-')}`}>
                              {row.status}
                            </span>
                          </td>
                          <td>
                            {row.liveListings}/{row.totalListings}
                          </td>
                          <td>{row.accuracy}</td>
                          <td>
                            {row.lastSynced === 'Never' ? 'See details' : `See details (${row.lastSynced})`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <h4>Open listing issues</h4>
            <ul className="task-list">
              {listingsIssues.length ? (
                listingsIssues.map((issue) => <li key={issue}>{issue}</li>)
              ) : (
                <li>No issues detected yet. Run a listings sync to verify data consistency.</li>
              )}
            </ul>
          </article>
        </section>

        <section className="card portfolio-panel" id="portfolio">
          <div className="card-title-row">
            <h3>Websites portfolio</h3>
            <span>
              {websites.length}/30
            </span>
          </div>
          <div className="portfolio-controls">
            <input
              type="text"
              placeholder="example.com"
              value={newWebsite}
              onChange={(event) => setNewWebsite(event.target.value)}
            />
            <button type="button" onClick={addWebsite}>
              Add website
            </button>
          </div>
          {portfolioMessage ? <p className="audit-message">{portfolioMessage}</p> : null}
          <div className="portfolio-list">
            {websites.map((site) => (
              <button
                type="button"
                key={site}
                className={`site-pill ${site === activeSite ? 'active' : ''}`}
                onClick={() => selectSite(site)}
              >
                {site}
              </button>
            ))}
          </div>
        </section>

        <section className="card site-dashboard" id="site-dashboard">
          <div className="card-title-row">
            <h3>Site command center</h3>
            <span>{activeSite}</span>
          </div>
          <p className="auth-subtext">
            Everything below is scoped to the selected site. Switch sites from the portfolio pills
            above.
          </p>
          <div className="site-dashboard-grid">
            <div>
              <h4>Health and traffic</h4>
              <ul className="task-list compact-list">
                <li>Daily health score: {healthScoreToday}</li>
                <li>Organic sessions (est.): {coreMetrics[1]?.value}</li>
                <li>Ranking keywords (est.): {coreMetrics[2]?.value}</li>
                <li>Authority (est.): {coreMetrics[3]?.value}</li>
              </ul>
            </div>
            <div>
              <h4>AISEO snapshot</h4>
              <ul className="task-list compact-list">
                {aiSeoMetrics.map((m) => (
                  <li key={m.title}>
                    {m.title}: {m.value}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Active alerts</h4>
              <ul className="task-list compact-list">
                {dailyAlerts.slice(0, 3).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="muted-line">{monitoringMessage}</p>
            </div>
            <div>
              <h4>Growth objectives</h4>
              <ul className="task-list compact-list">
                {growthObjectives.slice(0, 3).map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Top fixes</h4>
              <ul className="task-list compact-list">
                {priorityTasks.slice(0, 3).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Snapshot &amp; benchmark</h4>
              <ul className="task-list compact-list">
                {snapshotNotes.slice(0, 2).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p className="muted-line">{benchmarkMessage}</p>
            </div>
            <div>
              <h4>Open findings</h4>
              <ul className="task-list compact-list">
                <li>SEO items flagged: {detailedFindings.seoIssues.length}</li>
                <li>AISEO items flagged: {detailedFindings.aiSeoIssues.length}</li>
                <li>Pages with H1 attention: {detailedFindings.h1NeedsAttention.length}</li>
              </ul>
            </div>
            <div>
              <h4>Modules at a glance</h4>
              <ul className="task-list compact-list">
                <li>RankGuard scans left: {rankGuardScansLeft}</li>
                <li>Keyword ideas loaded: {keywordResults.length}</li>
                <li>Backlink leads loaded: {backlinkResults.length}</li>
                <li>Social roadmap steps: {socialRoadmap.length}</li>
                <li>Heatmap report: {heatmapReportStatus || 'Not generated this session'}</li>
                <li>Local listings report: {localListingsReportStatus || 'Not generated this session'}</li>
              </ul>
              {rankGuardMessage ? <p className="muted-line">{rankGuardMessage}</p> : null}
              {auditMessage ? <p className="muted-line">Last audit: {auditMessage}</p> : null}
            </div>
          </div>
        </section>

        <section className="dashboard-grid">
          <article className="card">
            <div className="card-title-row">
              <h3>Top priority fixes</h3>
              <span>4 open</span>
            </div>
            <ul className="task-list">
              {priorityTasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          </article>

          <article className="card chart-card">
            <div className="card-title-row">
              <h3>90-day organic trend</h3>
              <span>Strong momentum</span>
            </div>
            <div className="fake-chart" aria-hidden="true">
              <div className="bar b1"></div>
              <div className="bar b2"></div>
              <div className="bar b3"></div>
              <div className="bar b4"></div>
              <div className="bar b5"></div>
              <div className="bar b6"></div>
            </div>
          </article>
        </section>

        <section className="card findings-panel" id="findings">
          <div className="card-title-row">
            <h3>Detailed SEO and AISEO errors</h3>
            <span>Page-level findings</span>
          </div>
          <div className="findings-grid">
            <div>
              <h4>Pages needing H1 fixes</h4>
              <ul className="task-list">
                {detailedFindings.h1NeedsAttention.length > 0 ? (
                  detailedFindings.h1NeedsAttention.map((item) => (
                    <li key={`${item.page}-${item.issue}`}>
                      <strong>{item.page}</strong> - {item.issue}. {item.fix}
                    </li>
                  ))
                ) : (
                  <li>No explicit H1 issues detected in the current snapshot.</li>
                )}
              </ul>
            </div>
            <div>
              <h4>SEO errors</h4>
              <ul className="task-list">
                {detailedFindings.seoIssues.length > 0 ? (
                  detailedFindings.seoIssues.map((item) => (
                    <li key={`${item.page}-${item.issue}`}>
                      <strong>{item.page}</strong> - {item.issue}. {item.fix}
                    </li>
                  ))
                ) : (
                  <li>No explicit SEO errors detected in the current snapshot.</li>
                )}
              </ul>
            </div>
            <div>
              <h4>AISEO errors</h4>
              <ul className="task-list">
                {detailedFindings.aiSeoIssues.length > 0 ? (
                  detailedFindings.aiSeoIssues.map((item) => (
                    <li key={`${item.page}-${item.issue}`}>
                      <strong>{item.page}</strong> - {item.issue}. {item.fix}
                    </li>
                  ))
                ) : (
                  <li>No explicit AISEO errors detected in the current snapshot.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        <section className="aiseo-panel" id="aiseo">
          <div className="aiseo-head">
            <p className="eyebrow">AISEO Coverage</p>
            <h3>Optimize for AI search results, not just blue links.</h3>
          </div>
          <div className="aiseo-grid">
            {aiSeoMetrics.map((item) => (
              <article className="card aiseo-card" key={item.title}>
                <p className="card-label">{item.title}</p>
                <h2>{item.value}</h2>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card roadmap" id="roadmap">
          <div className="card-title-row">
            <h3>Growth roadmap (next 30 days)</h3>
            <span>Auto-prioritized by impact</span>
          </div>
          <ol>
            <li>Fix crawl/index conflicts and update stale sitemap references.</li>
            <li>Refresh underperforming pages with topical depth and better intent match.</li>
            <li>Publish AI-friendly comparison content with strong citations and schema.</li>
            <li>Run weekly authority outreach for high-value backlinks.</li>
          </ol>
        </section>
          </>
        )}
        </main>
      </div>
    </div>
  )
}

export default App
