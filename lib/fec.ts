export const FEC_DISPLAY_CYCLES = '2023–2026'

export const getFecCommitteeUrl = (cmteId: string) =>
  `https://www.fec.gov/data/committee/${cmteId}/`

export const getOpenSecretsUrl = (cmteId: string) =>
  `https://www.opensecrets.org/pacs/lookup2.php?strID=${cmteId}`
