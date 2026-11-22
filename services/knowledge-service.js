const { DIMENSION_ORDER, RIASEC } = require('../data/riasec')
const careers = require('../data/knowledge/careers')
const cases = require('../data/knowledge/cases')

function getDimension(code) {
  return DIMENSION_ORDER.includes(code) ? RIASEC[code] : null
}

function listDimensions() {
  return DIMENSION_ORDER.map(getDimension)
}

function listCareers(code) {
  const dimension = getDimension(code)
  return dimension ? careers.filter((career) => career.dimension === dimension.code) : careers.slice()
}

function getCareer(id) {
  return careers.find((career) => career.id === id) || null
}

function listCases() {
  return cases.slice()
}

function getCase(id) {
  return cases.find((entry) => entry.id === id) || null
}

function getTypeRepresentatives(dimensions) {
  return dimensions
    .filter((item) => item && getDimension(item.code) && Number.isFinite(item.rawScore))
    .sort((a, b) => b.rawScore - a.rawScore || DIMENSION_ORDER.indexOf(a.code) - DIMENSION_ORDER.indexOf(b.code))
    .flatMap(({ code }) => {
      const entry = cases.find((item) => item.activityDimension === code)
      const dimension = getDimension(code)
      if (!entry) return []
      const { id, name, avatar, relevance } = entry
      return [{ id, name, avatar, relevance, typeLabel: `${code} · ${dimension.name}`, color: dimension.color }]
    })
}

module.exports = { getDimension, listDimensions, listCareers, getCareer, listCases, getCase, getTypeRepresentatives }
