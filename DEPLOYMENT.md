# Read this before you commit anything here

**This repo does not deploy. Pushing to it changes nothing on the live site.**

`rate.getflowmortgage.ca` ("Rate My Rate" / Mortgage Rate Grader) is served by
the Lovable project `62c19ea2-e711-4f60-9b59-6f397b40cfd5`, and that project has
**no Git connection**. Settings → Git offers only a fresh connect, and Lovable
does not support importing an existing repo — connecting would create a brand
new repository rather than relink this one.

So this checkout is a **dead mirror**. It reflects roughly what the site used to
be, and commits made here accumulate on a branch nobody reads.

## To actually change that site

Edit through the Lovable chat, then Publish. Binary assets can be attached to a
chat message and Lovable will write them byte-exact — "replace `public/X` with
this attached file as-is" works.

## Known drift

- 2026-08-04: a favicon fix was committed and pushed here before the dead-mirror
  problem was understood. The live fix was applied separately through Lovable, so
  the site is correct; this repo simply carries a commit that never shipped.

If the Git connection is ever established, reconcile this repo against what
Lovable actually holds before assuming either side is authoritative.
