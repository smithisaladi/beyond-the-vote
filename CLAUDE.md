# Beyond the Vote — Design System

When designing or modifying any component, follow this design system exactly. The source of truth is the Landing Page (`components/landing/`) and the Dashboard (`app/(authenticated)/dashboard/page.tsx`).

---

## Color Palette

### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| Page background | `#F5F0E8` | All pages, headers (`bg-[#F5F0E8]`) |
| Sidebar | `#D6CFC4` | AppSidebar background |
| Sidebar border | `#C4BCB0` | Sidebar internal borders |
| Card surface | `bg-white` | All cards, list containers |
| Hover row | `#F8F5F0` or `#F5F0E8/60` | Table/list row hover |
| Skeleton | `#E8E3DA` | Loading skeleton fill |

### Text — Opacity Hierarchy
All text is based on `#1C1C1A`. Use Tailwind opacity modifiers, not separate color values.

| Opacity | Class | Usage |
|---------|-------|-------|
| 100% | `text-[#1C1C1A]` | Headings, strong labels, active nav items |
| 80% | `text-[#1C1C1A]/80` | Emphasized body text |
| 70% | `text-[#1C1C1A]/70` | Body text, activity descriptions |
| 60% | `text-[#1C1C1A]/60` | Secondary labels, signed-in username |
| 55% | `text-[#1C1C1A]/55` | Subtitles, descriptions |
| 50% | `text-[#1C1C1A]/50` | Metadata, politician title |
| 45% | `text-[#1C1C1A]/45` | Empty state text, inactive icons |
| 38% | `text-[#1C1C1A]/38` | Count labels, monospace bill numbers |
| 32% | `text-[#1C1C1A]/32` | Timestamps, last-action dates |
| 30% | `text-[#1C1C1A]/30` | The most subtle metadata |

### Accent — Purple (`#9B7FA6`)
The primary interactive color. Used for CTAs, active states, links, and progress.

```
Solid:        bg-[#9B7FA6]          text-white     → Primary buttons
Hover solid:  hover:bg-[#8a6e95]                   → Primary button hover
Tint 20%:     bg-[#9B7FA6]/[0.12]   text-[#9B7FA6] → Status/badge backgrounds
Tint 10%:     bg-[#9B7FA6]/10       text-[#9B7FA6] → Topic pills, tab active state
Tint border:  border-[#9B7FA6]/20                  → Eyebrow badge border
Light fill:   bg-[#C8BED0]/40                      → Sidebar active nav background
```

### Semantic Colors
| Color | Value | Usage |
|-------|-------|-------|
| Error / Nay / Stalled / Failed | `#B85C38` | Warning states, nay votes |
| Success / Passed | `#6A9B7B` | Passed bills, yea votes (alternative) |
| Democrat | `#7B8FA8` | Party badge |
| Republican | `#A87B7B` | Party badge |
| Independent | `#8A8A7A` | Party badge, Committee status |

### Status Styles — use `STATUS_STYLES` from `@/lib/ui`
```ts
Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' }
Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' }
Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' }
Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' }
Failed:    { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' }
```

### Party Styles — use `PARTY_STYLES` from `@/lib/ui`
```ts
Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' }
Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' }
Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' }
```

Always import from `@/lib/ui` — never inline these values in new components.

---

## Typography

### Fonts
- **Serif** (`var(--font-serif)`): Headings, names, bill titles, brand wordmark, section titles, initials avatars
- **Sans-serif** (Tailwind default): All body text, labels, metadata
- **Monospace** (`font-mono`): Bill numbers only (e.g. `S. 1247`, `H.R. 4521`)

Apply serif via inline style — never a class — because Tailwind can't reference CSS variables in font-family:
```tsx
style={{ fontFamily: 'var(--font-serif)' }}
// or with weight:
style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
```

### Text Scale
| Role | Classes | Example |
|------|---------|---------|
| Hero h1 | `text-5xl sm:text-6xl leading-[1.08] tracking-[-0.02em]` serif 700 | Landing headline |
| Features h2 | `text-3xl` serif 600 | "Everything you need…" |
| Page header h1 | `text-xl` serif | "Dashboard" |
| Section h2 | `text-lg font-semibold` serif | "Following", "Activity" |
| Feature h3 | `text-sm` serif 500 | Feature item title |
| Body | `text-sm` or `text-base` | General prose |
| Small label | `text-xs` | Tags, eyebrows, metadata |
| Micro label | `text-[11px]` | Party badges, vote labels, timestamps |
| Smallest | `text-[10px]` | "LATEST VOTE" eyebrow, status badges in tight spaces |

### Section Header Pattern
Every content section uses this header with a count/subtitle:
```tsx
<div className="flex items-baseline gap-2.5 mb-5">
  <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
    Section Title
  </h2>
  <span className="text-sm text-[#1C1C1A]/38">subtitle or count</span>
</div>
```

---

## Borders & Shadows

| Usage | Classes |
|-------|---------|
| Card border | `border border-[rgba(28,28,26,0.08)]` |
| Card shadow | `shadow-[0_1px_4px_rgba(0,0,0,0.06)]` |
| Inner divider (card section) | `border-t border-[rgba(28,28,26,0.06)]` |
| List item divider | `border-b border-[rgba(28,28,26,0.05)]` |
| Page header border | `border-b border-[rgba(28,28,26,0.08)]` |
| Nav/footer border | `border-b border-[rgba(28,28,26,0.1)]` |
| Sidebar border | `border-r border-[#C4BCB0]` |

---

## Component Patterns

### Card
The standard container for any grouped content:
```tsx
<div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
  {/* content */}
</div>
```

Interactive card (clickable, e.g. politician card):
```tsx
<div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 hover:shadow-md transition-shadow cursor-pointer">
```

### List Container
For stacked row-based content (activity feed, tracked bills):
```tsx
<div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
  {items.map((item, idx) => (
    <div key={item.id} className={`px-6 py-5 ${idx < items.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}>
      {/* row content */}
    </div>
  ))}
</div>
```

Or use `divide-y divide-[rgba(28,28,26,0.05)]` on the container instead of per-row border logic.

Hover on list rows:
```tsx
className="block px-6 py-5 hover:bg-[#F5F0E8]/60 transition-colors"
```

### Empty State
```tsx
<div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-6 py-10 text-center">
  <p className="text-sm text-[#1C1C1A]/45 mb-3">No items yet.</p>
  <Link href="/path" className="text-sm text-[#9B7FA6] hover:underline underline-offset-2">
    Do the thing →
  </Link>
</div>
```

### Skeleton / Loading
Wrap the skeleton card in a parent with `animate-pulse`. Use `#E8E3DA` for all placeholder shapes:
```tsx
<div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 animate-pulse">
  <div className="w-11 h-11 rounded-full bg-[#E8E3DA] mb-4" />
  <div className="h-3.5 bg-[#E8E3DA] rounded w-3/4 mb-2" />
  <div className="h-3 bg-[#E8E3DA] rounded w-1/2" />
</div>
```

---

## Badges & Pills

### Party Badge
```tsx
<span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PARTY_STYLES[party].bg} ${PARTY_STYLES[party].text}`}>
  {party}
</span>
```

### Status Badge
```tsx
<span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}>
  {status}
</span>
```

### Topic / Filter Pill (active)
```tsx
<span className="text-xs font-medium px-3 py-1 rounded-full bg-[#9B7FA6]/10 text-[#9B7FA6]">
  Healthcare
</span>
```

### Category Chip (neutral)
```tsx
<span className="text-[11px] text-[#1C1C1A]/40 bg-[#F5F0E8] border border-[rgba(28,28,26,0.08)] px-2.5 py-1 rounded-full">
  Economy
</span>
```

### Eyebrow Badge (landing/hero)
```tsx
<span className="inline-block text-xs font-medium text-[#9B7FA6] bg-[#9B7FA6]/10 border border-[#9B7FA6]/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
  Know Your Representative
</span>
```

### Vote Label
```tsx
<span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
  vote === 'Yea' ? 'bg-[#9B7FA6]/[0.12] text-[#9B7FA6]' : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
}`}>
  {vote}
</span>
```

---

## Buttons

### Primary CTA (large, hero sections)
```tsx
<button className="px-6 py-3 bg-[#9B7FA6] text-white rounded-xl text-sm font-medium hover:bg-[#8a6e95] transition-colors shadow-sm">
  Get started free
</button>
```

### Primary CTA (small, nav/inline)
```tsx
<button className="text-sm bg-[#9B7FA6] text-white px-4 py-2 rounded-lg hover:bg-[#8a6e95] transition-colors shadow-sm font-medium">
  Sign up free
</button>
```

### Secondary / Outline
```tsx
<button className="px-6 py-3 bg-white border border-[#D6CFC4] text-[#1C1C1A] rounded-xl text-sm font-medium hover:border-[#9B7FA6]/50 hover:text-[#9B7FA6] transition-colors shadow-sm">
  Find your representatives →
</button>
```

### Ghost / Text Link
```tsx
<button className="text-sm text-[#1C1C1A]/60 hover:text-[#1C1C1A] transition-colors">
  Sign in
</button>
```

```tsx
<Link href="/path" className="text-sm text-[#9B7FA6] hover:underline underline-offset-2">
  View all
</Link>
```

### Tab / Filter Pills (inline tab group)
```tsx
{(['all', 'bills', 'votes'] as const).map(tab => (
  <button
    key={tab}
    onClick={() => setTab(tab)}
    className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
      activeTab === tab
        ? 'bg-[#9B7FA6]/10 text-[#9B7FA6]'
        : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70'
    }`}
  >
    {label}
  </button>
))}
```

---

## Avatars

### Politician / Person Avatar (with initials fallback)
```tsx
// Initials layer (always rendered)
<div className="w-11 h-11 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
  <span className="text-sm text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
    {initials}
  </span>
</div>

// Photo overlaid on top (if available)
<div className="relative w-11 h-11 flex-shrink-0">
  <Initials name={name} />
  {photo && !photoError && (
    <Image src={photo} alt={name} fill className="rounded-full object-cover" onError={handleError} />
  )}
</div>
```

### User Avatar (header, small)
```tsx
<div className="w-8 h-8 rounded-full bg-[#9B7FA6]/20 border border-[#9B7FA6]/30 flex items-center justify-center">
  <span className="text-xs font-semibold text-[#9B7FA6]" style={{ fontFamily: 'var(--font-serif)' }}>
    {initials}
  </span>
</div>
```

### Feature Icon Container
```tsx
<div className="w-10 h-10 rounded-lg bg-[#9B7FA6]/10 border border-[#9B7FA6]/15 flex items-center justify-center flex-shrink-0">
  <span className="text-[#9B7FA6]">{icon}</span>
</div>
```

---

## Page & Layout Structure

### Sticky Page Header (dashboard / app pages)
```tsx
<header className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
  <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
    Page Title
  </h1>
</header>
```

### Sticky Landing Nav
```tsx
<header className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-sm border-b border-[rgba(28,28,26,0.1)]">
  <div className="max-w-6xl mx-auto px-6 flex items-center h-16 gap-6">
    {/* Logo | nav tabs | auth CTAs */}
  </div>
</header>
```

### Main Content Area (dashboard)
```tsx
<main className="flex-1 px-8 py-8">
  <div className="max-w-5xl">
    {/* sections */}
  </div>
</main>
```

### Content Width
- Landing pages: `max-w-6xl mx-auto px-6`
- App pages (dashboard, etc.): `max-w-5xl` inside `px-8 py-8`
- Section spacing between sections: `mb-14`

### Grid Patterns
```tsx
// Politician cards: 1 → 3 columns
<div className="grid grid-cols-1 md:grid-cols-3 gap-5">

// Features: 1 → 3 columns
<div className="grid grid-cols-1 md:grid-cols-3 gap-10">

// Dashboard lower section: main + narrow sidebar
<div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6">

// Hero: content + preview cards
<div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
```

---

## Navigation Patterns

### Sidebar Active State
```tsx
// Active
'border-l-2 border-[#9B7FA6] bg-[#C8BED0]/40 text-[#1C1C1A] font-medium pl-[14px] pr-3'
// Inactive
'border-l-2 border-transparent text-[#1C1C1A]/60 hover:text-[#1C1C1A] hover:bg-[#BDB5A8]/40 pl-[14px] pr-3'
// Icon active
'text-[#9B7FA6]'
// Icon inactive
'text-[#1C1C1A]/40'
```

### Header Tab Active State (underline variant)
```tsx
tab === activeTab
  ? 'text-[#1C1C1A] font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1C1C1A] after:rounded-t-full'
  : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75'
```

---

## Iconography

Use `lucide-react` for all icons inside the app. Stroke width is consistently `1.8` for standard icons, `2` for chevrons.

For landing page icons, use inline SVG with `stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"`.

Icon size in sidebars and labels: `17×17`. In headers: `16–19px` (use `size={16}` or `size={19}` on Lucide icons).

---

## Decorative Background

The topographic SVG background appears on hero sections and bill/representative pages. Always use `opacity: 0.04`, stroke color `#1C1C1A`, and `strokeWidth` of `1–1.2`. Position it `absolute inset-0 w-full h-full pointer-events-none` behind a `relative z-10` content wrapper.

Give each instance a unique `id` on the `<pattern>` element to avoid SVG ID collisions (e.g. `id="topo-bills"`, `id="topo-landing"`).

---

## Microformat Conventions

- **Bill numbers**: `font-mono text-[11px] text-[#1C1C1A]/38` (e.g. `S. 1247`)
- **Eyebrow labels** (e.g. "LATEST VOTE"): `text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider`
- **Section link** ("View all →", "Manage topics →"): `text-xs text-[#9B7FA6] hover:underline underline-offset-2`
- **"Because you follow X"** topic attribution: `text-[10px] text-[#9B7FA6] font-medium` with `Tag` icon at `size={10} color="#9B7FA6"`
- **Activity dot**: `w-1.5 h-1.5 rounded-full mt-[7px]` — alert: `bg-[#B85C38]`, normal: `bg-[#9B7FA6]/50`
- **Bill progress bar**: 4 equal segments, `h-1 flex-1 rounded-full`
  - Completed: `bg-[#9B7FA6]/60`
  - Failed/current-and-failed: `bg-[#B85C38]/60`
  - Remaining: `bg-[#E8E3DA]`

---

## Do's and Don'ts

**Do:**
- Import `PARTY_STYLES` and `STATUS_STYLES` from `@/lib/ui` — never hardcode party/status colors inline
- Use `var(--font-serif)` via `style={{ fontFamily: ... }}` for headings and names
- Use `rounded-xl` on cards, `rounded-lg` on buttons (small), `rounded-full` on badges/pills/avatars
- Use the opacity hierarchy (`/45`, `/38`, `/32`) rather than inventing new gray values
- Add `transition-colors` to every interactive element

**Don't:**
- Invent new colors outside the palette — if you need a new semantic color, discuss it first
- Use `font-bold` on body text — headings use `font-semibold` or `font-medium` via `fontWeight` in the style prop
- Use hard-coded gray values like `text-gray-500` — always use `text-[#1C1C1A]` with opacity
- Use `shadow-lg` or heavy shadows — the design uses only `shadow-sm` (buttons) and `shadow-[0_1px_4px_rgba(0,0,0,0.06)]` (cards)
- Use blue as a primary accent — the only accent color is `#9B7FA6`
