import { describe, it, expect } from 'vitest'
import { FEC_GLOSSARY, getFecCommitteeUrl, getOpenSecretsUrl, FEC_DISPLAY_CYCLES } from './fec'
import type { FecTermKey } from './fec'

describe('FEC_GLOSSARY', () => {
  const allKeys: FecTermKey[] = [
    'pac', 'fec', 'cycle', 'fecCycle', 'direct', 'ie', 'ieFor', 'ieAgainst',
    'itemized', 'smallDonors', 'largeIndividual', 'pacAndCorporate',
    'otherFunding', 'topContributors', 'inOutState', 'connectedOrg',
  ]

  it.each(allKeys)('entry "%s" has both term and body', key => {
    expect(FEC_GLOSSARY[key]).toBeDefined()
    expect(FEC_GLOSSARY[key].term).toBeTruthy()
    expect(FEC_GLOSSARY[key].body).toBeTruthy()
  })

  it('covers all expected keys', () => {
    expect(Object.keys(FEC_GLOSSARY).sort()).toEqual(allKeys.sort())
  })
})

describe('getFecCommitteeUrl', () => {
  it('builds the correct FEC URL', () => {
    expect(getFecCommitteeUrl('C00401224')).toBe(
      'https://www.fec.gov/data/committee/C00401224/',
    )
  })
})

describe('getOpenSecretsUrl', () => {
  it('builds the correct OpenSecrets URL', () => {
    expect(getOpenSecretsUrl('C00401224')).toBe(
      'https://www.opensecrets.org/pacs/lookup2.php?strID=C00401224',
    )
  })
})

describe('FEC_DISPLAY_CYCLES', () => {
  it('is the expected value', () => {
    expect(FEC_DISPLAY_CYCLES).toBe('2023–2026')
  })
})
