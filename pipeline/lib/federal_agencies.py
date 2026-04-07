"""
Static lookup: common name variants → canonical agency names.
Port of scripts/lib/federal-agencies.ts
"""

_RAW: list[tuple[str, str]] = [
    # Cabinet Departments
    ("department of agriculture", "Department of Agriculture"),
    ("secretary of agriculture", "Department of Agriculture"),
    ("usda", "Department of Agriculture"),

    ("department of commerce", "Department of Commerce"),
    ("secretary of commerce", "Department of Commerce"),

    ("department of defense", "Department of Defense"),
    ("secretary of defense", "Department of Defense"),
    ("dod", "Department of Defense"),
    ("dept. of defense", "Department of Defense"),

    ("department of education", "Department of Education"),
    ("secretary of education", "Department of Education"),

    ("department of energy", "Department of Energy"),
    ("secretary of energy", "Department of Energy"),
    ("doe", "Department of Energy"),

    ("department of health and human services", "Department of Health and Human Services"),
    ("secretary of health and human services", "Department of Health and Human Services"),
    ("hhs", "Department of Health and Human Services"),

    ("department of homeland security", "Department of Homeland Security"),
    ("secretary of homeland security", "Department of Homeland Security"),
    ("dhs", "Department of Homeland Security"),

    ("department of housing and urban development", "Department of Housing and Urban Development"),
    ("secretary of housing and urban development", "Department of Housing and Urban Development"),
    ("hud", "Department of Housing and Urban Development"),

    ("department of the interior", "Department of the Interior"),
    ("secretary of the interior", "Department of the Interior"),

    ("department of justice", "Department of Justice"),
    ("attorney general", "Department of Justice"),
    ("doj", "Department of Justice"),

    ("department of labor", "Department of Labor"),
    ("secretary of labor", "Department of Labor"),

    ("department of state", "Department of State"),
    ("secretary of state", "Department of State"),

    ("department of transportation", "Department of Transportation"),
    ("secretary of transportation", "Department of Transportation"),
    ("dot", "Department of Transportation"),

    ("department of the treasury", "Department of the Treasury"),
    ("secretary of the treasury", "Department of the Treasury"),

    ("department of veterans affairs", "Department of Veterans Affairs"),
    ("secretary of veterans affairs", "Department of Veterans Affairs"),

    # Major Independent Agencies
    ("environmental protection agency", "Environmental Protection Agency"),
    ("administrator of the environmental protection agency", "Environmental Protection Agency"),
    ("epa", "Environmental Protection Agency"),

    ("federal communications commission", "Federal Communications Commission"),
    ("fcc", "Federal Communications Commission"),

    ("securities and exchange commission", "Securities and Exchange Commission"),
    ("sec", "Securities and Exchange Commission"),

    ("federal trade commission", "Federal Trade Commission"),
    ("ftc", "Federal Trade Commission"),

    ("national aeronautics and space administration", "NASA"),
    ("nasa", "NASA"),

    ("small business administration", "Small Business Administration"),
    ("sba", "Small Business Administration"),

    ("social security administration", "Social Security Administration"),
    ("ssa", "Social Security Administration"),

    ("consumer financial protection bureau", "Consumer Financial Protection Bureau"),
    ("cfpb", "Consumer Financial Protection Bureau"),

    ("federal reserve", "Federal Reserve"),
    ("board of governors of the federal reserve", "Federal Reserve"),
    ("federal reserve board", "Federal Reserve"),

    ("nuclear regulatory commission", "Nuclear Regulatory Commission"),
    ("nrc", "Nuclear Regulatory Commission"),

    ("federal election commission", "Federal Election Commission"),
    ("fec", "Federal Election Commission"),

    ("equal employment opportunity commission", "Equal Employment Opportunity Commission"),
    ("eeoc", "Equal Employment Opportunity Commission"),

    ("national labor relations board", "National Labor Relations Board"),
    ("nlrb", "National Labor Relations Board"),

    ("commodity futures trading commission", "Commodity Futures Trading Commission"),
    ("cftc", "Commodity Futures Trading Commission"),

    ("federal deposit insurance corporation", "Federal Deposit Insurance Corporation"),
    ("fdic", "Federal Deposit Insurance Corporation"),

    ("office of management and budget", "Office of Management and Budget"),
    ("omb", "Office of Management and Budget"),

    ("office of personnel management", "Office of Personnel Management"),
    ("opm", "Office of Personnel Management"),

    ("general services administration", "General Services Administration"),
    ("gsa", "General Services Administration"),

    ("government accountability office", "Government Accountability Office"),
    ("gao", "Government Accountability Office"),

    ("congressional budget office", "Congressional Budget Office"),
    ("cbo", "Congressional Budget Office"),

    # High-Frequency Sub-Agencies
    ("centers for disease control and prevention", "CDC"),
    ("cdc", "CDC"),

    ("food and drug administration", "FDA"),
    ("fda", "FDA"),

    ("federal bureau of investigation", "FBI"),
    ("fbi", "FBI"),

    ("internal revenue service", "IRS"),
    ("irs", "IRS"),

    ("centers for medicare & medicaid services", "CMS"),
    ("centers for medicare and medicaid services", "CMS"),
    ("cms", "CMS"),

    ("national institutes of health", "NIH"),
    ("nih", "NIH"),

    ("bureau of land management", "Bureau of Land Management"),
    ("blm", "Bureau of Land Management"),

    ("fish and wildlife service", "Fish and Wildlife Service"),
    ("u.s. fish and wildlife service", "Fish and Wildlife Service"),

    ("customs and border protection", "Customs and Border Protection"),
    ("cbp", "Customs and Border Protection"),

    ("immigration and customs enforcement", "ICE"),
    ("ice", "ICE"),

    ("transportation security administration", "Transportation Security Administration"),
    ("tsa", "Transportation Security Administration"),

    ("federal aviation administration", "Federal Aviation Administration"),
    ("faa", "Federal Aviation Administration"),

    ("national highway traffic safety administration", "National Highway Traffic Safety Administration"),
    ("nhtsa", "National Highway Traffic Safety Administration"),

    ("occupational safety and health administration", "Occupational Safety and Health Administration"),
    ("osha", "Occupational Safety and Health Administration"),

    ("bureau of prisons", "Bureau of Prisons"),
    ("federal bureau of prisons", "Bureau of Prisons"),

    ("bureau of alcohol, tobacco, firearms and explosives", "ATF"),
    ("bureau of alcohol, tobacco, firearms, and explosives", "ATF"),
    ("atf", "ATF"),

    ("drug enforcement administration", "Drug Enforcement Administration"),
    ("dea", "Drug Enforcement Administration"),

    ("national science foundation", "National Science Foundation"),
    ("nsf", "National Science Foundation"),

    ("national oceanic and atmospheric administration", "NOAA"),
    ("noaa", "NOAA"),

    ("forest service", "Forest Service"),
    ("u.s. forest service", "Forest Service"),

    ("army corps of engineers", "Army Corps of Engineers"),
    ("u.s. army corps of engineers", "Army Corps of Engineers"),

    ("veterans health administration", "Veterans Health Administration"),
    ("vha", "Veterans Health Administration"),

    ("cybersecurity and infrastructure security agency", "CISA"),
    ("cisa", "CISA"),

    ("federal housing administration", "Federal Housing Administration"),
    ("fha", "Federal Housing Administration"),

    ("substance abuse and mental health services administration", "SAMHSA"),
    ("samhsa", "SAMHSA"),

    ("health resources and services administration", "HRSA"),
    ("hrsa", "HRSA"),

    ("children's bureau", "Children's Bureau"),

    ("national park service", "National Park Service"),
    ("nps", "National Park Service"),
]

# Pre-computed lowercase → canonical map
AGENCY_LOOKUP: dict[str, str] = {variant.lower(): canonical for variant, canonical in _RAW}


def extract_agencies(text: str) -> list[str]:
    lower = text.lower()
    found: set[str] = set()
    for variant, canonical in AGENCY_LOOKUP.items():
        if variant in lower:
            found.add(canonical)
    return sorted(found)
