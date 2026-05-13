import { describe, it, expect } from 'vitest'
import { getFecCommitteeUrl, getOpenSecretsUrl, FEC_GLOSSARY } from './fec'

describe('getFecCommitteeUrl', () => {
  it('returns the correct FEC committee URL', () => {
    expect(getFecCommitteeUrl('C00123456')).toBe(
      'https://www.fec.gov/data/committee/C00123456/'
    )
  })

  it('works with different committee IDs', () => {
    expect(getFecCommitteeUrl('C00654321')).toBe(
      'https://www.fec.gov/data/committee/C00654321/'
    )
  })
})

describe('getOpenSecretsUrl', () => {
  it('returns the correct OpenSecrets URL', () => {
    expect(getOpenSecretsUrl('C00123456')).toBe(
      'https://www.opensecrets.org/pacs/lookup2.php?strID=C00123456'
    )
  })
})

describe('FEC_GLOSSARY', () => {
  it('has entries for key terms', () => {
    expect(FEC_GLOSSARY.pac).toBeDefined()
    expect(FEC_GLOSSARY.pac.term).toBe('PAC')
    expect(FEC_GLOSSARY.pac.body).toBeTruthy()
  })

  it('has direct contribution entry', () => {
    expect(FEC_GLOSSARY.direct).toBeDefined()
    expect(FEC_GLOSSARY.direct.term).toBe('Direct contribution')
  })

  it('has independent expenditure entries', () => {
    expect(FEC_GLOSSARY.ieFor).toBeDefined()
    expect(FEC_GLOSSARY.ieAgainst).toBeDefined()
    expect(FEC_GLOSSARY.ieFor.term).toContain('Support')
    expect(FEC_GLOSSARY.ieAgainst.term).toContain('Opposition')
  })

  it('has FEC entry', () => {
    expect(FEC_GLOSSARY.fec).toBeDefined()
    expect(FEC_GLOSSARY.fec.term).toBe('FEC')
  })

  it('every entry has both term and body', () => {
    for (const [, entry] of Object.entries(FEC_GLOSSARY)) {
      expect(entry.term).toBeTruthy()
      expect(entry.body).toBeTruthy()
    }
  })
})
