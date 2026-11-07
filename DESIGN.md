# Design kit: Course Smash city

Read this before building any UI for Course Smash.

The look is a **playful isometric city on a dark page**. Every course is a building, drawn in flat pixel-art isometric, and the rest of the interface stays quiet, so the colour comes from the buildings.

## The idea

1. **Your learning is a city.** A course is a building, each module is one floor, and a floor's windows light up when you pass its module. A course the agent is still planning is a building site with scaffolding and a crane.
2. **Dark page, bright buildings.** Neutrals carry the layout. Colour lives in the art and in the occasional full-colour block.
3. **Flat isometric, no realism.** Surfaces are flat fills with three tones per material (top, lit face, shaded face). No gradients, glows, blur or drop shadows.
4. **Friendly and alive.** Small motion makes the city feel lived in: rippling water, a ferry, a blinking antenna light, smoke, a swaying crane.

## Colour

### Neutrals

| Token | Hex | Use |
|---|---|---|
| `--bio-ink` | `#141414` | Page background, insets behind art, text and buttons on colour |
| `--bio-surface` | `#1F1F1D` | Cards and panels |
| `--bio-paper` | `#FBFBFB` | Main text on dark, light buttons |
| `--bio-muted` | `#A3A3A0` | Secondary text |

The `--bio-` token names are historical. Keep them so the CSS stays stable.

### Accents

| Token | Hex | Use |
|---|---|---|
| `--bio-orange` | `#E65F2B` | Wrong answers, cranes, trim |
| `--bio-yellow` | `#F5D556` | Lit windows, progress pips, focus rings, scaffolding |
| `--bio-green` | `#469B5B` | Correct answers, passed modules |
| `--bio-blue` | `#5889F7` | Selected options, trim |
| `--bio-purple` | `#904CF6` | Trim |
| `--bio-pink` | `#E7A0EA` | The finished-course panel, trim |

- Text on any accent is `--bio-ink`.
- One full-colour block per screen at most, such as the verdict or the finished panel.
- Don't use accents for body text on dark.
- The theme is dark only.

### Building materials

Each material has three tones: top, left (lit) face, right (shaded) face. They live in `public/city.js`.

| Material | Top | Left | Right |
|---|---|---|---|
| sandstone | `#EAD3A6` | `#D4B27C` | `#A9865A` |
| brick | `#D9826A` | `#B9533E` | `#86392D` |
| glass | `#9CC0F2` | `#5B8BD6` | `#3B62A6` |
| teal | `#9AD9D2` | `#4FA39D` | `#2F736F` |
| concrete | `#C9CCD1` | `#9EA3AB` | `#70757E` |
| white | `#FFFFFF` | `#E2E4E8` | `#B5BAC3` |

Unlit windows are `#27303F`, and lit windows are `--bio-yellow`. Water is `#1F4F8F` with `#2F68B0` ripples.

## Type

One font: **Inter Tight**.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Hero title ("Course Smash") | 52 to 104px | 800 | -0.055em |
| Section heading | 52px | 600 | -0.04em |
| Card title, large | 35px | 600 | -0.03em |
| Card title, small | 25px | 600 | -0.03em |
| Hero lead | 22px | 400 | -0.01em |
| Body | 19px | 400 | -0.01em |
| Button, small text | 16px | 500 | 0 |

Use sentence case everywhere, with no serif, monospace or italic type.

## Layout and shape

- **Header:** the logo mark and "Course Smash" on the left, the account and a pill button on the right.
- **Hero:** title, lead and composer on the left, and the city on the right. On phones the city sits under the composer.
- **Grids:** three columns of cards, two on tablets, one on phones.
- **Corners:** cards 28px, panels 36px, insets 20px, buttons full pills.
- **Surfaces:** separate them by colour only, with no borders or shadows.

## The city art

All art is SVG built in `public/city.js` from numbers and the palette. Model text never goes into it.

- **Projection:** 2:1 pixel-art isometric. x runs down-right, y runs down-left, z is up.
- **Building types:** tower, setback, rotunda, capitol, factory, datacenter, port, greenhouse and townhall.
- **Roof add-ons:** garden, helipad, antenna, dish, water tank and solar.
- **Lots:** each building stands on a 6 × 6 paved plaza.
- **The hero city:** a 3 × 3 block island on a water slab, with a pier and a ferry. Your newest courses take the front lots, the next free lot is a building site, and the back row is a skyline.
- **Course cards:** the building sits in an ink inset, cropped tightly to what was drawn.
- **Loader:** floors dropping onto a tower.
- **Finished course:** the fully lit building with confetti.

### How a course gets its building

When the planner writes a course outline, it also picks an `icon`, which is the building type, material, roof and accent from the fixed lists in `src/icon.ts`. The icon is stored as JSON on the course. Courses without one, including library courses, get a building from keywords in their title and topic. The building is drawn with the course's own seed, so it always looks the same.

## Motion

- Use springy easing with a slight overshoot (`--spring`) for hover lifts and pops.
- Lift buildings and cards a few pixels on hover.
- Keep loops slow and small: water, ferry, antenna blink, smoke, crane sway, the floating city.
- Honour `prefers-reduced-motion` by stopping all animation.

## Voice

- Short, warm and concrete: "Every course goes up as a building in your city, one floor per module."
- Plain words and an active tone, with no hype.

## Do and don't

**Do**

- Let the buildings carry the colour.
- Tie the art to real progress: floors are modules, and lights are passed modules.
- Vary building, material and accent so each course is recognisable.

**Don't**

- Use gradients, drop shadows, glows, glass effects or photoreal 3D.
- Add colours outside the palette and materials above.
- Let a model write markup for the art.
