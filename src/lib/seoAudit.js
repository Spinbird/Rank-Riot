export const runSeoAudit = async (domain) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(`/api/seo-audit?domain=${encodeURIComponent(domain)}`, {
      signal: controller.signal,
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Could not fetch audit data. Try another domain.')
    }
    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Audit timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
