# HTML Rendering (Default)

Sketches are HTML pages published with the built-in **Artifact** tool. It needs no
server or setup, and the user gets a link to the rendered sketch.

## Steps

1. Copy `assets/sketch-template.html` to the scratchpad directory, one file per sketch.
2. Replace `SKETCH NAME` in the `<title>` with the feature name (2-4 words).
3. Fill in the screens, regions, actions, and FLOW section. Duplicate the `.screen`
   block for each step. Give every box its own uneven `border-radius`, so no two
   boxes have the same corners.
4. Publish the file with the Artifact tool (`icon: "sketch"`). To revise the sketch,
   edit the same file and publish again, so the link stays the same.

## Keep it crude

The template already meets the Artifact page contract (title, side gutter, explicit
background). The Artifact tool may ask you to load its design guidance. Load it,
but don't apply its polish to a sketch: the fidelity rules win. That means:

- Black on white only. Don't add a palette, accent color, or dark-mode version.
  The page stays white on purpose.
- One typeface, Permanent Marker. Don't pair it with a second face.
- No shadows, fills, gradients, images, icons, or animation.
- Use only the template's classes and inline `border-radius`. Don't add new layout
  styling.

## When the Artifact tool isn't available

Some sessions don't have the Artifact tool (for example, an eval sandbox or another
harness). Then write the same file and open it locally with `open <file>`. The
fidelity rules don't change.

Never output the sketch as plain prose or an unstyled text list. If it doesn't have
visible boxes or borders around screens and regions, it's not a sketch. It's notes.

See `assets/example-ui-sketch.html` for a reference of the target structure.
