import { fmt } from './format.js'

// Turns a cell's numbers into the plain-English sentence shown at the top of the panel.
export function buildVerdict(cell, varDef) {
  const per = Math.abs(cell.slope_per_decade)
  const amount = `${fmt(per, varDef.decimals)} ${varDef.units}`
  if (!cell.significant) {
    return {
      badge: 'No clear trend',
      tone: 'none',
      text: `${varDef.verbs.none} here. The value moves by about ${amount} every 10 years, but a change that small could easily be random.`,
    }
  }
  const up = cell.direction === 'up'
  return {
    badge: up ? 'Rising' : 'Falling',
    tone: up ? 'up' : 'down',
    text: `${up ? varDef.verbs.up : varDef.verbs.down} by ${amount} every 10 years. This change is real, not random.`,
  }
}

export function directionWord(cell) {
  if (!cell.significant) return 'no clear trend'
  return cell.direction === 'up' ? 'rising' : 'falling'
}
