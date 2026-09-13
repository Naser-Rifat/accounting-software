# Photography

Save the advocate's portrait here as:

```
advocate.jpg
```

It is already referenced by `index.html` (hero card) and `about.html` (profile
card) — no markup change is needed. Until the file exists, both pages fall back
to the built-in monogram plate: `main.js` removes the broken `<img>` on load
error, so nothing ever appears broken.

## What to supply

| | |
| --- | --- |
| Orientation | **Portrait, cropped to 4:5.** The frame is 4:5. |
| Size | 1200 × 1500 px is plenty. Keep it under ~300 KB. |
| Format | JPEG (or WebP — then update `src` on both pages). |
| Framing | Head and shoulders, eyes roughly a third down the frame. |

## Fixing the crop

The frame is 4:5 and uses `object-fit: cover`, so anything wider is cropped at
the sides. One value controls what stays in frame — `--portrait-focus` on
`.portrait-photo` in `assets/css/styles.css`, which defaults to `50% 25%`.

Raise the first number to follow a face that sits right of centre, lower it to
follow one on the left. Lower the second number to show more of the top of the
head.

**A landscape photo loses roughly half its width** to the 4:5 crop. If you feed
one in uncropped and the sitter is off-centre, start around `62% 40%`. You will
get a better result by cropping to 4:5 in an image editor first, since you can
then choose the framing directly rather than steering it from CSS.

If you would rather keep the whole width of a landscape photograph, change
`aspect-ratio` on `.portrait` from `4 / 5` to `1 / 1` or `4 / 3` — the card
layout adapts, it just makes the hero card shorter.

## Before you use a photograph

The person in the portrait is presented on this site as an advocate with a
named bar enrolment, court admissions, case outcomes and client testimonials.

Only use a photograph where **both** are true:

1. You have the right to use the image — you took it, you licensed it, or the
   subject gave permission.
2. The person shown is the person the site describes, **or** the site's copy
   has been changed to describe whoever is shown.

A licensed stock photo of a model is fine for a demo. A headshot taken from
another firm's website is not, and neither is a real individual paired with
invented legal credentials. If the portrait is of a real advocate, replace the
fictional name, enrolment year, admissions, matters and testimonials with
theirs — the checklist is in the main `README.md`.
