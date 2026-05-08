import { jsPDF } from 'jspdf'

function sanitizeAccentColor(hex) {
  const t = String(hex ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return t
  return '#ff8a1f'
}

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i)
  }
  return Math.abs(h)
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildHeatmapReportData({
  siteHost,
  domainLabel,
  healthScoreToday,
  organicSessionsLabel,
}) {
  const seed = hashString(`${siteHost}|heatmap`)
  const rnd = mulberry32(seed)
  const heatmapRows = 7
  const heatmapCols = 14
  const heatmapValues = []
  for (let r = 0; r < heatmapRows; r += 1) {
    const row = []
    for (let c = 0; c < heatmapCols; c += 1) {
      row.push(0.15 + rnd() * 0.85)
    }
    heatmapValues.push(row)
  }

  const page = domainLabel || `https://${siteHost}/`
  const health = healthScoreToday || '—'
  const organic = organicSessionsLabel || '—'

  return {
    summaryBullets: [
      `Modeled engagement for ${siteHost} using scroll-depth zones and interaction weighting (demo projection).`,
      `Primary landing page reviewed: ${page}`,
      `Health score context: ${health}; organic scale reference: ${organic}`,
    ],
    heatmapValues,
    zoneRows: [
      ['Above the fold', 'High', 'Hero and primary CTA capture most modeled attention.'],
      ['Mid page', 'Medium', 'Service blocks and proof sections show steady engagement.'],
      ['Footer', 'Lower', 'Consider sticky CTAs or in-content prompts for secondary conversions.'],
    ],
  }
}

export function buildLocalListingsReportData({
  siteHost,
  businessName,
  city,
  napScore,
  citations,
}) {
  const biz = businessName || siteHost.split('.')[0]
  const loc = city || 'Primary market'
  return {
    overviewBullets: [
      `${biz} — ${siteHost}`,
      `Primary locality: ${loc}`,
      `NAP consistency score (modeled): ${String(napScore)}`,
    ],
    matrixRows: citations.map((row) => [row.platform, row.status, row.match, row.note]),
    recommendations: [
      'Align business name, address, and phone across Google Business Profile, Bing Places, and Apple Maps.',
      'Audit category selection and service areas for duplicate or conflicting entries.',
      'Add localized schema (LocalBusiness) on the canonical location page.',
    ],
  }
}

function hexToRgb(hex) {
  const normalized = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  const value = normalized.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

function ensureSpace(doc, y, neededHeight, margin, lineHeight) {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + neededHeight <= pageHeight - margin) return y
  doc.addPage()
  return margin + lineHeight
}

function drawSectionTitle(doc, text, y, accent, margin, lineHeight) {
  y = ensureSpace(doc, y, lineHeight * 2, margin, lineHeight)
  doc.setTextColor(accent.r, accent.g, accent.b)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(text, margin, y)
  doc.setTextColor(22, 27, 40)
  doc.setFont('helvetica', 'normal')
  return y + lineHeight
}

function drawBullets(doc, bullets, y, margin, maxWidth, lineHeight) {
  for (const bullet of bullets) {
    const lines = doc.splitTextToSize(`- ${bullet}`, maxWidth)
    y = ensureSpace(doc, y, lines.length * lineHeight + 2, margin, lineHeight)
    doc.text(lines, margin, y)
    y += lines.length * lineHeight + 2
  }
  return y + 2
}

function drawParagraphs(doc, paragraphs, y, margin, maxWidth, lineHeight) {
  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, maxWidth)
    y = ensureSpace(doc, y, lines.length * lineHeight + 3, margin, lineHeight)
    doc.text(lines, margin, y)
    y += lines.length * lineHeight + 3
  }
  return y + 1
}

function drawTable(doc, table, y, margin, maxWidth, lineHeight) {
  const colCount = table.headers.length
  const colWidth = maxWidth / colCount
  const drawRow = (cells, isHeader = false) => {
    const lineSets = cells.map((cell) => doc.splitTextToSize(String(cell), colWidth - 6))
    const rowHeight = Math.max(...lineSets.map((set) => set.length)) * lineHeight + 6
    y = ensureSpace(doc, y, rowHeight + 2, margin, lineHeight)
    if (isHeader) {
      doc.setFillColor(236, 240, 248)
      doc.rect(margin, y - lineHeight + 1, maxWidth, rowHeight, 'F')
      doc.setFont('helvetica', 'bold')
    }
    for (let i = 0; i < colCount; i += 1) {
      const x = margin + i * colWidth
      doc.rect(x, y - lineHeight + 1, colWidth, rowHeight)
      doc.text(lineSets[i], x + 3, y + 2)
    }
    if (isHeader) doc.setFont('helvetica', 'normal')
    y += rowHeight
  }
  drawRow(table.headers, true)
  for (const row of table.rows) drawRow(row, false)
  return y + 4
}

function drawHeatmap(doc, heatmapValues, y, accent, margin, maxWidth, lineHeight) {
  const rows = heatmapValues.length
  const cols = heatmapValues[0]?.length || 0
  if (!rows || !cols) return y
  const cellGap = 1.2
  const cellSize = Math.min((maxWidth - cellGap * (cols - 1)) / cols, 8.5)
  const boxWidth = cols * cellSize + (cols - 1) * cellGap
  const boxHeight = rows * cellSize + (rows - 1) * cellGap
  y = ensureSpace(doc, y, boxHeight + lineHeight * 3, margin, lineHeight)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const intensity = heatmapValues[r][c]
      const alpha = 0.2 + intensity * 0.8
      const fill = {
        r: Math.round(245 - (245 - accent.r) * alpha),
        g: Math.round(247 - (247 - accent.g) * alpha),
        b: Math.round(252 - (252 - accent.b) * alpha),
      }
      doc.setFillColor(fill.r, fill.g, fill.b)
      const x = margin + c * (cellSize + cellGap)
      const cellY = y + r * (cellSize + cellGap)
      doc.rect(x, cellY, cellSize, cellSize, 'F')
    }
  }
  return y + boxHeight + lineHeight + 2
}

export function downloadBrandedPdfReport({
  filename,
  reportTitle,
  reportSubtitle,
  siteHost,
  brand,
  sections,
}) {
  const accent = sanitizeAccentColor(brand?.accentColor)
  const accentRgb = hexToRgb(accent)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2
  const lineHeight = 5.2

  let y = margin
  const brandName = brand?.brandName?.trim() || 'SEO report'
  const tagline = brand?.tagline?.trim() || ''
  const footer = brand?.footerText?.trim() || ''

  doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b)
  doc.rect(margin, y, maxWidth, 2.3, 'F')
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(22, 27, 40)
  doc.text(brandName, margin, y)
  y += lineHeight
  if (tagline) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(95, 105, 130)
    doc.text(doc.splitTextToSize(tagline, maxWidth), margin, y)
    y += lineHeight
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(22, 27, 40)
  y += 3
  doc.text(reportTitle, margin, y)
  y += lineHeight
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(95, 105, 130)
  if (reportSubtitle) {
    doc.text(doc.splitTextToSize(reportSubtitle, maxWidth), margin, y)
    y += lineHeight
  }
  doc.text(`Site: ${siteHost}`, margin, y)
  y += lineHeight
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y)
  y += lineHeight + 2

  doc.setDrawColor(220, 225, 236)
  doc.line(margin, y, margin + maxWidth, y)
  y += lineHeight

  doc.setTextColor(22, 27, 40)
  doc.setFontSize(11)
  for (const section of sections) {
    y = drawSectionTitle(doc, section.title, y, accentRgb, margin, lineHeight)
    if (section.paragraphs?.length) {
      y = drawParagraphs(doc, section.paragraphs, y, margin, maxWidth, lineHeight)
    }
    if (section.bullets?.length) {
      y = drawBullets(doc, section.bullets, y, margin, maxWidth, lineHeight)
    }
    if (section.heatmapValues?.length) {
      y = drawHeatmap(doc, section.heatmapValues, y, accentRgb, margin, maxWidth, lineHeight)
    }
    if (section.table) {
      y = drawTable(doc, section.table, y, margin, maxWidth, lineHeight)
    }
    y += 3
  }

  if (footer) {
    y = ensureSpace(doc, y, lineHeight * 3, margin, lineHeight)
    doc.setDrawColor(220, 225, 236)
    doc.line(margin, y, margin + maxWidth, y)
    y += lineHeight
    doc.setFontSize(9.5)
    doc.setTextColor(95, 105, 130)
    doc.text(doc.splitTextToSize(footer, maxWidth), margin, y)
  }

  doc.save(filename)
}
