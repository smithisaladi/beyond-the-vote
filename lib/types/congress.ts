// lib/types/congress.ts

/** Subset of GET /bill/{congress}/{type}/{number} response. */
export interface CongressBillResponse {
  bill: {
    title: string
    introducedDate?: string
    sponsors?: CongressBillSponsor[]
    cosponsors?: CongressBillCosponsor[] | { cosponsor?: CongressBillCosponsor[] }
    policyArea?: { name?: string }
    subjects?: { legislativeSubjects?: CongressBillSubject[] }
  }
}

export interface CongressBillSponsor {
  fullName: string
  bioguideId: string
  party: string
  state: string
  district?: number | null
}

export interface CongressBillCosponsor {
  fullName: string
  bioguideId: string
  party: string
  state: string
}

export interface CongressBillAction {
  actionDate: string
  text: string
  type?: string | null
  actionCode?: string
  recordedVotes?: { yeas?: number; nays?: number; url?: string }[]
}

export interface CongressBillSummary {
  text?: string
  actionDate?: string
}

export interface CongressBillSubject {
  name: string
}

/**
 * Geocodio congressional district fragment used in /api/representatives.
 * Each district carries the legislators currently representing it.
 */
export interface GeocodioDistrict {
  district_number?: number
  current_legislators?: LegislatorJson[]
}

/**
 * Legislator entry shape used by Geocodio's `current_legislators` field
 * and the local `pipeline/data/legislators` raw JSON files. The two share
 * the same nested structure (references / bio / contact).
 */
export interface LegislatorJson {
  type?: string
  references?: { bioguide_id?: string }
  bio?: { first_name?: string; last_name?: string; party?: string }
  contact?: { url?: string; phone?: string }
}
