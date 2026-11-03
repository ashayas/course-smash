# Design kit: `hex.inc/bio-web`

When anyone says **"use hex.inc/bio-web theme"**, they mean this file.

The look is **3D, geometric and fun**: chunky, flat-colour shapes that pop off a near-black page. It comes from the "Not Bios Sphere" page by Ayush.

## How far to trust these values

This kit was built from five screenshots, not from the page's source.

- **Sampled:** colour values marked as sampled were read from screenshot pixels.
- **Measured:** sizes are estimates from the screenshots, assuming a 2x display and a viewport about 1457px wide. Round them to the scale below.
- **Inferred:** the font and all motion could not be confirmed. Replace them if the source becomes available.

## The idea

1. **Dark page, loud shapes.** Neutrals stay quiet so that all the colour comes from illustrations, tiles and the occasional full-colour block.
2. **Depth without realism.** 3D comes from isometric forms and overlapping layers. Colours are always flat, with no gradients, bevels, glows or shadows.
3. **Built from simple geometry.** Everything is made of circles, arches, petals, stripes, stars and rounded squares.
4. **Friendly.** Smiling faces, planets and flowers keep it playful, while the type and layout stay tidy.

## Colour

### Neutrals (sampled)

| Token | Hex | Use |
|---|---|---|
| `--bio-ink` | `#141414` | Page background, text and buttons on colour, dark insets |
| `--bio-surface` | `#1F1F1D` | Cards and the hero panel |
| `--bio-paper` | `#FBFBFB` | Main text on dark, light buttons, window title bars |
| `--bio-muted` | `#A3A3A0` | Secondary text on dark. Estimated by eye, not sampled |

### Accents (sampled)

| Token | Hex |
|---|---|
| `--bio-orange` | `#E65F2B` |
| `--bio-yellow` | `#F5D556` |
| `--bio-green` | `#469B5B` |
| `--bio-blue` | `#5889F7` |
| `--bio-purple` | `#904CF6` |
| `--bio-pink` | `#E7A0EA` |

Use only these six accents. The hero wordmark also shows in-between shades such as olive and lavender. They look like frames of a colour animation, so don't use them as tokens.

### Using colour

- Pair accents at high contrast, such as yellow on orange, pink on purple or yellow on green.
- Reserve full-colour blocks for moments of emphasis, usually one per screen. Orange and pink are the two seen in use.
- Text on any accent is `--bio-ink`, never white. On purple, `--bio-ink` reaches only about 4:1, so use it for large bold text only.
- Don't use accents for body text on dark. Keep colour in shapes.
- The theme is dark only. No light mode appears in the source.

```css
:root {
  --bio-ink: #141414;
  --bio-surface: #1f1f1d;
  --bio-paper: #fbfbfb;
  --bio-muted: #a3a3a0;

  --bio-orange: #e65f2b;
  --bio-yellow: #f5d556;
  --bio-green: #469b5b;
  --bio-blue: #5889f7;
  --bio-purple: #904cf6;
  --bio-pink: #e7a0ea;

  --bio-radius-card: 28px;
  --bio-radius-panel: 36px;
  --bio-radius-pill: 999px;
  --bio-gutter: 32px;
  --bio-gap: 28px;
  --bio-font: "Inter Tight", "Helvetica Neue", Arial, sans-serif;
}
```

## Type

The source uses one tight neo-grotesque sans. The exact font is unconfirmed, so `Inter Tight` is the stand-in.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Section heading | 52px | 600 | -0.04em |
| Talk or card title, large | 35px | 600 | -0.03em |
| Card title, small | 25px | 600 | -0.03em |
| Hero lead | 22px | 400 | -0.01em |
| Body and intro text | 19px | 400 | -0.01em |
| Button | 16px | 500 | 0 |

- Line height is about 1.05 for headings and 1.35 for body text.
- Use sentence case everywhere. Only tile letters are capitals.
- Don't use serif, monospace or italic type.

## Layout and shape

- **Page:** `--bio-gutter` side margins, with a minimal header of wordmark on the left and one pill button on the right.
- **Section header:** a large heading on the left, with a muted intro starting just past the midpoint of the page. Stack them on mobile.
- **Grids:** four columns for feature illustrations and three for cards, with a `--bio-gap` gap. Collapse to one column on phones.
- **Spacing:** generous, with about 100px or more between sections.
- **Corners:** cards are about 28px, large panels about 36px, buttons are full pills. Illustrated window frames stay square.
- **Surfaces:** separate them by colour only, with no borders or shadows.

## Signature components

### Letter-tile wordmark

The most recognisable element.

- Each letter sits on its own rounded square in a different accent, with heavy `--bio-ink` capitals.
- An O can be drawn as a solid `--bio-ink` circle.
- Short words such as "NOT" can share one wider tile.
- Hero tiles are about 92px, with radius 26px and a 5px gap. Footer tiles are about 44px with radius 13px.
- In the hero, tiles sit slightly out of line, by a few pixels vertically, so the word feels bouncy.

### Buttons

- A full pill about 50px tall with 26px horizontal padding.
- `--bio-paper` with ink text on dark surfaces, and `--bio-ink` with paper text on colour.
- Use one action label consistently across the page.

### Cards

- **Content card:** `--bio-surface`, about 21px padding, with the title and muted subtitle anchored at the bottom.
- **Colour card:** the same shape filled with an accent, using ink text and a dark button. Use it to break up a grid.
- **Call-to-action panel:** a full-width accent panel with heading, sentence and button on the left, and an illustration in a dark rounded inset on the right.

### Patterned photo frame

- A square photo with an L-shaped patterned strip offset behind it to the lower right, about 24px out.
- The strip is a repeating two-colour pattern of diamonds, dots, arches, quarter circles or blocks.
- Give each card a different pattern and colour pair.

## Illustration

Draw these as inline SVG, using flat fills from the accent palette only.

- **Isometric cube:** three visible faces in different colours, each with its own surface pattern, such as dots, an arch or stripes.
- **Stacked browser windows:** 3 to 5 windows cascading diagonally. Each has a paper title bar with three small dots and a colourful scene inside. A black-outlined white cursor often sits on top.
- **Ringed planets:** a two-colour or striped sphere with a tilted ring passing in front and behind, plus small four-point sparkles.
- **Characters:** arch-shaped or round smiling faces with simple eyes and rounded cheeks.
- **Flowers and suns:** layered petals or radial dashes around a circle.
- **Sticker grid:** a 3×3 block of colour squares, with one icon per square and rounded outer corners only.

Keep shapes bold enough to read at small sizes, and avoid thin outlines. The cursor and the occasional ring are the exceptions.

## Motion

Static screenshots can't confirm any motion, so treat this as a suggested direction.

- Give tiles a gentle bob and slowly cycle their colours.
- Let windows fan out or planets drift slowly, with springy easing that has a slight overshoot.
- On hover, lift elements a few pixels or nudge them slightly.
- Honour `prefers-reduced-motion` by stopping all looping animation.

## Voice

- Short, warm and concrete: "Bring an idea in the morning, leave with something real by the end of the day."
- Plain words and an active tone, with no corporate hype.
- Headings are short phrases: "Save your spot".

## Do and don't

**Do**

- Start from `--bio-ink` and add colour through shapes.
- Make one illustration or wordmark the hero of each screen.
- Vary colour pairs so that repeated items feel different.

**Don't**

- Use gradients, drop shadows, glows, glass effects or photorealistic 3D.
- Add colours outside the palette.
- Use pale pastel versions of the accents, or put colour on every surface.
- Reuse the event's name, speakers or copy, unless the work is for that event.
