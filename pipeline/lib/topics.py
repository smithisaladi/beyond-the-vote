"""
Bill topic classification — port of lib/topics.ts
"""

ALL_TOPICS = [
    "Climate & Environment",
    "Healthcare",
    "Economy & Jobs",
    "Education",
    "Housing",
    "Immigration",
    "Tech & Privacy",
    "Criminal Justice",
    "Voting Rights",
    "Social Security",
    "Gun Policy",
    "Foreign Policy",
]

# Congress.gov policyArea → topic slug
POLICY_AREA_TO_TOPIC_SLUG: dict[str, str] = {
    "Environmental Protection":           "climate-environment",
    "Energy":                             "climate-environment",
    "Public Lands and Natural Resources": "climate-environment",
    "Water Resources Development":        "climate-environment",
    "Health":                             "healthcare",
    "Economics and Public Finance":       "economy-jobs",
    "Commerce":                           "economy-jobs",
    "Finance and Financial Sector":       "economy-jobs",
    "Labor and Employment":               "economy-jobs",
    "Taxation":                           "economy-jobs",
    "Armed Forces and National Security": "foreign-policy",
    "International Affairs":              "foreign-policy",
    "Education":                          "education",
    "Housing and Community Development":  "housing",
    "Science, Technology, Communications": "tech-privacy",
    "Immigration":                        "immigration",
    "Crime and Law Enforcement":          "criminal-justice",
    "Civil Rights and Liberties, Minority Issues": "voting-rights",
    "Social Welfare":                     "social-security",
}

# Keyword arrays per topic slug — matched against lowercased title + summary
TOPIC_KEYWORDS: dict[str, list[str]] = {
    "climate-environment": ["climate", "emission", "renewable", "carbon", "pollution", "conservation", "clean energy", "epa", "greenhouse"],
    "healthcare":          ["medicaid", "medicare", "drug price", "prescription drug", "insurance coverage", "public health"],
    "economy-jobs":        ["tariff", "small business", "federal budget", "debt ceiling", "minimum wage"],
    "education":           ["student loan", "pell grant", "higher education", "k-12", "head start"],
    "housing":             ["affordable housing", "hud", "eviction", "homelessness", "rental assistance"],
    "immigration":         ["immigr", "asylum seeker", "undocumented", "daca", "deportat", "border patrol"],
    "tech-privacy":        ["data privacy", "artificial intelligence", "cybersecurity", "broadband", "social media platform"],
    "criminal-justice":    ["criminal justice", "mass incarceration", "parole", "juvenile justice", "law enforcement reform"],
    "voting-rights":       ["voting rights", "voter suppression", "campaign finance", "redistricting", "gerrymandering", "election integrity"],
    "social-security":     ["social security", "disability insurance", "social security administration"],
    "gun-policy":          ["firearm", "gun control", "gun violence", "assault weapon", "second amendment", "concealed carry", "background check"],
    "foreign-policy":      ["foreign policy", "foreign aid", "nato", "military alliance", "diplomatic", "sanctions regime"],
}

# Maps canonical agency name → topic slugs it implies
AGENCY_TOPIC_MAP: dict[str, list[str]] = {
    "Environmental Protection Agency":         ["climate-environment"],
    "Department of Energy":                    ["climate-environment", "economy-jobs"],
    "NOAA":                                    ["climate-environment"],
    "Bureau of Land Management":               ["climate-environment"],
    "Fish and Wildlife Service":               ["climate-environment"],
    "Forest Service":                          ["climate-environment"],
    "Army Corps of Engineers":                 ["climate-environment"],
    "Department of Health and Human Services": ["healthcare"],
    "CDC":                                     ["healthcare"],
    "FDA":                                     ["healthcare"],
    "NIH":                                     ["healthcare"],
    "CMS":                                     ["healthcare"],
    "SAMHSA":                                  ["healthcare"],
    "HRSA":                                    ["healthcare"],
    "Department of Education":                 ["education"],
    "Department of Housing and Urban Development": ["housing"],
    "Federal Housing Administration":          ["housing"],
    "ICE":                                     ["immigration"],
    "Customs and Border Protection":           ["immigration"],
    "Federal Communications Commission":       ["tech-privacy"],
    "Federal Trade Commission":                ["tech-privacy"],
    "CISA":                                    ["tech-privacy"],
    "Bureau of Prisons":                       ["criminal-justice"],
    "ATF":                                     ["gun-policy", "criminal-justice"],
    "Drug Enforcement Administration":         ["criminal-justice"],
    "Social Security Administration":          ["social-security"],
    "Department of State":                     ["foreign-policy"],
    "Department of Defense":                   ["foreign-policy"],
}


def classify_bill_topics(
    policy_area: str | None,
    title: str,
    summary: str | None,
    agencies: list[str] | None = None,
) -> list[str]:
    """
    Classifies a bill into one or more topic slugs using:
    1. Congress.gov policyArea → topic slug mapping
    2. Keyword matching on lowercased title + summary
    3. Referenced agency names → topic slug mapping
    """
    matched: set[str] = set()
    text = f"{title} {summary or ''}".lower()

    if policy_area:
        slug = POLICY_AREA_TO_TOPIC_SLUG.get(policy_area)
        if slug:
            matched.add(slug)

    for slug, keywords in TOPIC_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            matched.add(slug)

    for agency in (agencies or []):
        slugs = AGENCY_TOPIC_MAP.get(agency)
        if slugs:
            matched.update(slugs)

    return sorted(matched)
