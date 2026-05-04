# Acme Logistics — Logo + Theme Options

Six distinct branding concepts for the dashboard header (`Acme Logistics · Carrier Operations`).
Each concept includes an inline SVG you can preview by saving the snippet as `acme-<concept>.svg`.
All palettes are tuned to work on the current dark dashboard (`<html class="dark">`) AND on light mode.

Pick one and we'll wire it into `dashboard/src/components/header.tsx` + `dashboard/src/app/globals.css` (CSS variables only — no component rewrites).

---

## 1. Freightline — Traditional / Industrial

**Logo visual.** A horizontal "freight bar" mark: three stacked cargo lines of decreasing length suggesting motion + a flatbed silhouette, paired with a chunky uppercase wordmark in a condensed grotesk. Safety-orange accent stripe under the wordmark gives it the classic "DOT placard" feel.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 72" width="280" height="72">
  <!-- freight bars -->
  <rect x="6"  y="22" width="44" height="6" fill="#F97316" />
  <rect x="14" y="34" width="36" height="6" fill="#E2E8F0" />
  <rect x="22" y="46" width="28" height="6" fill="#94A3B8" />
  <!-- wordmark -->
  <text x="64" y="40"
        font-family="'Inter', 'Helvetica Neue', sans-serif"
        font-weight="900" font-size="22" letter-spacing="2"
        fill="#E2E8F0">ACME LOGISTICS</text>
  <!-- subtitle -->
  <text x="64" y="58"
        font-family="'Inter', sans-serif"
        font-weight="500" font-size="9" letter-spacing="4"
        fill="#F97316">CARRIER OPERATIONS</text>
</svg>
```

**Theme palette.**
| Token       | Hex       | Rationale                                          |
|-------------|-----------|----------------------------------------------------|
| Primary     | `#0F172A` | Slate-900 — gunmetal navy, freight-industry default |
| Accent      | `#F97316` | DOT safety-orange — high-vis, trucking heritage    |
| Background  | `#020617` | Near-black for dark mode                           |
| Foreground  | `#E2E8F0` | Slate-200 for body text                            |
| Muted       | `#475569` | Slate-600 for secondary text + borders             |

**Tailwind hint.** `bg-[#020617] text-[#E2E8F0] [&_.accent]:text-[#F97316]`

**Mood.** Heavy, blue-collar, "we move steel for a living."

**Where it shines.** Established mid-market broker pitching enterprise shippers. Reads like an old-school freight forwarder that learned software.

---

## 2. Meridian — Modern Fintech-Clean

**Logo visual.** A single thin geometric mark — a circle bisected by a horizontal line (a stylized horizon / shipping waterline), aligned with a low-weight wordmark. Lots of negative space. One accent color (electric indigo). Looks like Stripe, Linear, or Ramp.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 64" width="260" height="64">
  <!-- horizon mark -->
  <circle cx="28" cy="32" r="14" fill="none" stroke="#6366F1" stroke-width="1.75"/>
  <line x1="10" y1="32" x2="46" y2="32" stroke="#6366F1" stroke-width="1.75"/>
  <!-- wordmark -->
  <text x="58" y="36"
        font-family="'Inter', system-ui, sans-serif"
        font-weight="500" font-size="20" letter-spacing="-0.5"
        fill="#F8FAFC">Acme Logistics</text>
  <!-- subtitle -->
  <text x="58" y="52"
        font-family="'Inter', sans-serif"
        font-weight="400" font-size="10" letter-spacing="0"
        fill="#94A3B8">Carrier Operations</text>
</svg>
```

**Theme palette.**
| Token       | Hex       | Rationale                                       |
|-------------|-----------|-------------------------------------------------|
| Primary     | `#6366F1` | Indigo-500 — tasteful tech accent              |
| Accent      | `#A5B4FC` | Indigo-300 — for hover/focus states            |
| Background  | `#0B0B12` | True black with a hint of warmth                |
| Foreground  | `#F8FAFC` | Slate-50 — high contrast, restrained            |
| Muted       | `#64748B` | Slate-500 for muted text                        |

**Tailwind hint.** `bg-[#0B0B12] text-[#F8FAFC] [&_.accent]:text-[#6366F1]`

**Mood.** Quiet confidence. Series-B fintech. Lets the data do the talking.

**Where it shines.** A modern broker-tech startup courting venture capital — design language that feels at home next to Ramp, Brex, or Stripe Atlas.

---

## 3. Pulse — Bold Tech-Forward

**Logo visual.** A rounded gradient hex/diamond with an inset waveform "pulse" suggesting AI activity + voice signals. Wordmark in a geometric grotesk (Space Grotesk vibe) with the "A" subtly chamfered to echo the diamond. Strong gradient mark draws the eye.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 290 76" width="290" height="76">
  <defs>
    <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="#22D3EE"/>
      <stop offset="50%" stop-color="#A855F7"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <!-- diamond mark -->
  <rect x="8" y="14" width="48" height="48" rx="12" ry="12"
        transform="rotate(45 32 38)" fill="url(#pulseGrad)"/>
  <!-- pulse line inside -->
  <path d="M14 38 L24 38 L28 28 L32 48 L36 32 L40 42 L50 38"
        fill="none" stroke="#0B0B12" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- wordmark -->
  <text x="74" y="42"
        font-family="'Space Grotesk', 'Inter', sans-serif"
        font-weight="700" font-size="24" letter-spacing="-0.5"
        fill="#F4F4F5">Acme Logistics</text>
  <!-- subtitle -->
  <text x="74" y="60"
        font-family="'Space Grotesk', sans-serif"
        font-weight="500" font-size="10" letter-spacing="3"
        fill="#A855F7">CARRIER OPERATIONS · AI</text>
</svg>
```

**Theme palette.**
| Token       | Hex       | Rationale                                                |
|-------------|-----------|----------------------------------------------------------|
| Primary     | `#A855F7` | Purple-500 — AI/ML signal color                          |
| Accent      | `#22D3EE` | Cyan-400 — tech secondary, pairs in gradient             |
| Background  | `#0B0B12` | Deep near-black makes the gradient pop                   |
| Foreground  | `#F4F4F5` | Zinc-100 — clean white-ish text                          |
| Muted       | `#52525B` | Zinc-600 for secondary                                   |

**Tailwind hint.** `bg-[#0B0B12] text-[#F4F4F5] [&_.brand]:bg-gradient-to-br [&_.brand]:from-[#22D3EE] [&_.brand]:via-[#A855F7] [&_.brand]:to-[#EC4899]`

**Mood.** Future-forward, "we're an AI company that happens to do freight."

**Where it shines.** Pitching to a voice-AI / dev-tools-aware audience. Signals the dashboard belongs alongside modern AI tooling.

---

## 4. Letterform — Minimalist Wordmark Only

**Logo visual.** No icon. Pure typography. "Acme Logistics" set in a very tight, slightly oversized geometric sans, with a single hairline rule beneath it and "Carrier Operations" in a tracked-out small caps lockup. Letter-spacing is the design. Confidence-via-restraint.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="320" height="80">
  <!-- wordmark -->
  <text x="160" y="38" text-anchor="middle"
        font-family="'Inter', 'Helvetica Neue', sans-serif"
        font-weight="800" font-size="30" letter-spacing="-1"
        fill="#FAFAFA">Acme Logistics</text>
  <!-- hairline rule -->
  <line x1="80" y1="50" x2="240" y2="50"
        stroke="#FAFAFA" stroke-width="0.75" opacity="0.45"/>
  <!-- subtitle, tracked small caps -->
  <text x="160" y="66" text-anchor="middle"
        font-family="'Inter', sans-serif"
        font-weight="600" font-size="10" letter-spacing="6"
        fill="#A1A1AA">CARRIER OPERATIONS</text>
</svg>
```

**Theme palette.**
| Token       | Hex       | Rationale                                       |
|-------------|-----------|-------------------------------------------------|
| Primary     | `#FAFAFA` | Off-white — typography IS the brand            |
| Accent      | `#10B981` | Emerald-500 — used sparingly for status/positive deltas |
| Background  | `#000000` | True black for max contrast on dark mode        |
| Foreground  | `#FAFAFA` | Off-white                                       |
| Muted       | `#A1A1AA` | Zinc-400 for subtitle / muted UI                |

**Tailwind hint.** `bg-black text-[#FAFAFA] [&_.delta-positive]:text-[#10B981]`

**Mood.** Minimalist. Editorial. Quietly premium. Apple/MoMA-adjacent.

**Where it shines.** A boutique broker that wants to feel like a design-led tech company. Also flatters dense Recharts visualizations — nothing competes with the data.

---

## 5. Atlas Freight Co. — Retro / Vintage

**Logo visual.** A vintage shipping-company badge: a circular crest with "ACME LOGISTICS CO." arched along the top and "EST. 1952" along the bottom, a stylized propeller-star at center, all in a warm cream on steel-blue. Wordmark uses a high-contrast slab serif (think "Trade Gothic" meets "Playfair"). Feels like a heritage logistics firm that's been moving freight since the railway era.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" width="320" height="96">
  <!-- crest -->
  <circle cx="44" cy="48" r="34" fill="#1E3A5F" stroke="#E8DCC4" stroke-width="2"/>
  <circle cx="44" cy="48" r="28" fill="none" stroke="#E8DCC4" stroke-width="0.75"/>
  <!-- propeller-star at center -->
  <g fill="#E8DCC4" transform="translate(44 48)">
    <polygon points="0,-14 3,-3 14,0 3,3 0,14 -3,3 -14,0 -3,-3"/>
    <circle r="2.5" fill="#C9A85C"/>
  </g>
  <!-- arched top text -->
  <path id="arcTop" d="M 18 48 A 26 26 0 0 1 70 48" fill="none"/>
  <text font-family="'Georgia', serif" font-size="6.5" letter-spacing="2" fill="#E8DCC4">
    <textPath href="#arcTop" startOffset="50%" text-anchor="middle">ACME LOGISTICS CO.</textPath>
  </text>
  <!-- arched bottom text -->
  <path id="arcBot" d="M 18 48 A 26 26 0 0 0 70 48" fill="none"/>
  <text font-family="'Georgia', serif" font-size="6" letter-spacing="3" fill="#C9A85C">
    <textPath href="#arcBot" startOffset="50%" text-anchor="middle">EST. 1952</textPath>
  </text>
  <!-- wordmark -->
  <text x="92" y="48"
        font-family="'Playfair Display', 'Georgia', serif"
        font-weight="900" font-size="26"
        fill="#E8DCC4">Acme Logistics</text>
  <!-- subtitle, with rules -->
  <line x1="92"  y1="64" x2="108" y2="64" stroke="#C9A85C" stroke-width="1"/>
  <text x="112" y="67"
        font-family="'Georgia', serif"
        font-weight="400" font-size="11" font-style="italic"
        fill="#C9A85C">Carrier Operations</text>
  <line x1="222" y1="64" x2="238" y2="64" stroke="#C9A85C" stroke-width="1"/>
</svg>
```

**Theme palette.**
| Token       | Hex       | Rationale                                                |
|-------------|-----------|----------------------------------------------------------|
| Primary     | `#1E3A5F` | Steel-blue — heritage shipping/rail color                |
| Accent      | `#C9A85C` | Aged brass — vintage badge gilt                          |
| Background  | `#0E1A2B` | Deep navy for dark mode (lighter than #000 — feels warmer) |
| Foreground  | `#E8DCC4` | Cream/parchment — old paper                              |
| Muted       | `#7C8FA6` | Faded steel for muted UI                                 |

**Tailwind hint.** `bg-[#0E1A2B] text-[#E8DCC4] [&_.accent]:text-[#C9A85C]`

**Mood.** Heritage, established, "we've moved freight since your grandfather was a kid."

**Where it shines.** Pitching to a traditional family-owned brokerage that values legacy. Stands out in a sea of identical SaaS gradients.

---

## Quick comparison

| # | Concept     | Primary    | Accent     | Vibe                    | Best for                          |
|---|-------------|------------|------------|-------------------------|-----------------------------------|
| 1 | Freightline | `#0F172A`  | `#F97316`  | Industrial / blue-collar | Established mid-market broker     |
| 2 | Meridian    | `#6366F1`  | `#A5B4FC`  | Quiet fintech            | Series-B broker-tech startup      |
| 3 | Pulse       | `#A855F7`  | `#22D3EE`  | AI-forward gradient      | Voice-AI / dev-tools audience     |
| 4 | Letterform  | `#FAFAFA`  | `#10B981`  | Editorial minimalist     | Boutique design-led broker        |
| 5 | Atlas       | `#1E3A5F`  | `#C9A85C`  | Heritage / vintage badge | Traditional family-owned brokerage |

---

## 7. Coyote Mark — Wile E. / Acme Brand Reference

**Logo visual.** A minimalist coyote silhouette sitting on its haunches, head tilted up at a full moon — the classic Wile E. Coyote pose, but stripped of cartoon. Single-line stroke, geometric construction (triangular ears, taut back-line, tail curving low to the ground), rendered in bone-white against a deep desert-night indigo. A solitary amber moon hangs behind/above the coyote. Pairs with a clean geometric sans wordmark; the "Acme" reads as both the broker name AND the deliberate Looney Tunes wink. The reviewer gets the joke instantly; the tasteful execution keeps it from tipping into novelty.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" width="320" height="96">
  <!-- desert-night backdrop disc (subtle, anchors the mark) -->
  <circle cx="48" cy="48" r="40" fill="#1A1B3A" opacity="0.55"/>
  <!-- amber moon, behind the coyote -->
  <circle cx="62" cy="28" r="11" fill="#F4A24C"/>
  <circle cx="58" cy="25" r="2.2" fill="#1A1B3A" opacity="0.35"/>
  <circle cx="65" cy="31" r="1.4" fill="#1A1B3A" opacity="0.3"/>
  <!-- coyote silhouette: single-line stroke, sitting, head tilted up at moon -->
  <g fill="none" stroke="#F2EADF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- body + haunch + back leg curve -->
    <path d="M 22 76
             L 28 70
             L 30 60
             L 34 54
             L 40 50
             L 44 46
             L 46 38
             L 49 32
             L 52 28
             L 50 22
             L 53 18
             L 57 22
             L 56 28
             L 59 32
             L 60 38
             L 62 44
             L 60 50
             L 56 54
             L 54 62
             L 56 70
             L 58 76
             L 50 76
             L 48 70
             L 44 66
             L 40 70
             L 38 76 Z"/>
    <!-- pricked ear -->
    <path d="M 50 22 L 52 14 L 55 20"/>
    <!-- tail, low and curving -->
    <path d="M 22 76 Q 14 74 12 66 Q 12 62 16 60"/>
    <!-- snout pointing up -->
    <path d="M 53 18 L 50 14 L 53 13"/>
  </g>
  <!-- tiny eye dot -->
  <circle cx="54" cy="20" r="0.9" fill="#1A1B3A"/>
  <!-- ground line -->
  <line x1="14" y1="78" x2="82" y2="78" stroke="#F2EADF" stroke-width="0.6" opacity="0.45"/>
  <!-- wordmark -->
  <text x="100" y="48"
        font-family="'Inter', 'Helvetica Neue', sans-serif"
        font-weight="700" font-size="26" letter-spacing="-0.5"
        fill="#F2EADF">Acme Logistics</text>
  <!-- subtitle -->
  <text x="100" y="66"
        font-family="'Inter', sans-serif"
        font-weight="500" font-size="10" letter-spacing="3"
        fill="#F4A24C">CARRIER OPERATIONS</text>
</svg>
```

**Theme palette.**
| Token       | Hex       | Rationale                                                       |
|-------------|-----------|-----------------------------------------------------------------|
| Primary     | `#F2EADF` | Bone-white — coyote outline, moonlit body fur                   |
| Accent      | `#F4A24C` | Amber moon — desert-night warmth, the only chromatic note       |
| Background  | `#0E1030` | Deep indigo — desert sky an hour after sunset                   |
| Foreground  | `#F2EADF` | Bone-white text echoes the silhouette                           |
| Muted       | `#5A5E8A` | Dusk-violet for muted UI / borders                              |

**Tailwind hint.** `bg-[#0E1030] text-[#F2EADF] [&_.accent]:text-[#F4A24C]`

**Mood.** Self-aware playful. "We know our customer is named Acme, and we're confident enough to wink at it without breaking character." Freight industry with a personality — the coyote staring at the moon is patient, persistent, and a little obsessed with its quarry, which is exactly what carrier-ops feels like at 3am.

**Where it shines.** Customer demos and impressions where you want to be remembered. Anyone with cultural literacy clocks the Acme/Wile E. lineage in two seconds and respects the restraint of not over-egging it. The desert-night palette is *chosen because* it carries the gag without leaning on it — burnt-sienna canyon would have read as "rustic Western lifestyle brand," and monochrome operator-grade would have killed the joke entirely. Indigo + amber lets the silhouette do the storytelling: the moon is the punchline, the coyote's posture is the setup, and the wordmark stays adult.

---

## How to apply (once you pick)

1. Add the chosen palette to `dashboard/src/app/globals.css` as CSS variables under `:root` (light) and `.dark` (dark).
2. Drop the SVG into `dashboard/src/components/branding/AcmeMark.tsx` as a React component (`<svg>` with the chosen viewBox).
3. Replace the current header brand block in `dashboard/src/components/header.tsx` with `<AcmeMark className="h-10 w-auto" />` + subtitle.
4. No other component changes needed — Recharts colors will inherit via CSS vars if we wire `--chart-1..n` to the new palette.
